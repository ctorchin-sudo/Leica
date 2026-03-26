/**
 * MPB scraper — queries MPB's internal search-service API
 * for used Leica M mount (rangefinder) lenses.
 *
 * MPB uses a React SPA protected by Cloudflare. Plain HTTP requests
 * are blocked (403/400). We use Playwright to:
 *   1. Launch a real Chromium browser to establish a valid CF session cookie
 *   2. Call the search-service API from within that page context so all
 *      cookies and headers are forwarded automatically
 *
 * All pages are fetched in parallel (up to MAX_PAGES) using a shared
 * browser instance with one context per concurrent request.
 */

const { chromium } = require("playwright-core");

const CHROMIUM_PATH =
  process.env.CHROMIUM_PATH ||
  "/root/.cache/ms-playwright/chromium-1194/chrome-linux/chrome";

const MPB_BASE = "https://www.mpb.com";
const MPB_PRODUCT_BASE = "https://www.mpb.com/en-us/equipment/camera-lenses";

const PAGE_SIZE = 48;
const MAX_PAGES = 10; // safety cap — 480 listings max

const CONDITION_MAP = {
  5: "Like New",
  4: "Excellent",
  3: "Very Good",
  2: "Good",
  1: "Fair",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseProxy(proxyUrl) {
  if (!proxyUrl) return undefined;
  try {
    const url = new URL(proxyUrl);
    return {
      server: `${url.protocol}//${url.hostname}:${url.port}`,
      username: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
    };
  } catch {
    return undefined;
  }
}

function buildApiParams({ start = 0, rows = PAGE_SIZE } = {}) {
  const fields = [
    "model_id",
    "model_name",
    "model_brand",
    "model_images",
    "product_price",
    "product_condition_star_rating",
    "product_url_segment",
    "model_url_segment",
  ];
  const entries = [
    ...fields.map((f) => ["field_list", f]),
    ["filter_query[model_market]", "US"],
    ["filter_query[object_type]", "product"],
    ["filter_query[model_available]", "true"],
    ["filter_query[model_is_published_out]", "true"],
    ["filter_query[model_category]", "Rangefinder lenses"],
    ["facet_field", "model_brand"],
    ["facet_field", "product_condition_star_rating"],
    ["start", String(start)],
    ["rows", String(rows)],
  ];
  return new URLSearchParams(entries).toString();
}

function normaliseItem(raw) {
  const name = raw.model_name?.values?.[0] ?? "Unknown";
  const brand = raw.model_brand?.values?.[0] ?? "Unknown";
  const priceRaw = raw.product_price?.values?.[0];
  const price = priceRaw ? Math.round(parseFloat(priceRaw) / 100) : null;
  const condRating = parseInt(
    raw.product_condition_star_rating?.values?.[0] ?? 0,
    10
  );
  const condition = CONDITION_MAP[condRating] ?? "Unknown";
  const modelSlug = raw.model_url_segment?.values?.[0] ?? "";
  const productSlug = raw.product_url_segment?.values?.[0] ?? "";
  const imgPath = raw.model_images?.values?.[0] ?? "";
  const imageUrl = imgPath ? `${MPB_BASE}${imgPath}` : null;
  const url = productSlug
    ? `${MPB_PRODUCT_BASE}/${modelSlug}/${productSlug}`
    : `${MPB_PRODUCT_BASE}/${modelSlug}`;

  // Extract focal length and max aperture from the model name
  const focalMatch = name.match(/(\d+)(?:-\d+)?mm/);
  const apertureMatch = name.match(/f\/?(\d+(?:\.\d+)?)/i);
  const focalLength = focalMatch ? parseInt(focalMatch[1], 10) : null;
  const maxAperture = apertureMatch ? parseFloat(apertureMatch[1]) : null;

  return {
    id: `mpb-${raw.model_id?.values?.[0]}-${productSlug}`,
    source: "MPB",
    brand,
    model: name,
    focalLength,
    maxAperture,
    mount: "Leica M",
    condition,
    conditionRating: condRating,
    price,
    imageUrl,
    url,
    description: `Used ${name} in ${condition} condition from MPB.`,
  };
}

// ─── Browser singleton ────────────────────────────────────────────────────────

let _browser = null;

async function getBrowser() {
  if (_browser) return _browser;
  const proxy = parseProxy(
    process.env.HTTPS_PROXY || process.env.HTTP_PROXY || ""
  );
  _browser = await chromium.launch({
    headless: true,
    executablePath: CHROMIUM_PATH,
    proxy,
    args: ["--ignore-certificate-errors", "--no-sandbox"],
  });
  return _browser;
}

// ─── Page fetcher ─────────────────────────────────────────────────────────────

/**
 * Fetch one page of results using a fresh browser context.
 * Reuses the shared browser instance but creates isolated contexts
 * so concurrent fetches don't share cookies/state.
 */
async function fetchPage(browser, start) {
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();
  try {
    // Establish Cloudflare session cookie
    await page.goto(`${MPB_BASE}/en-us/`, {
      timeout: 30000,
      waitUntil: "domcontentloaded",
    });

    const qs = buildApiParams({ start, rows: PAGE_SIZE });
    const raw = await page.evaluate(async (queryString) => {
      const r = await fetch(`/search-service/product/query/?${queryString}`, {
        headers: { "content-language": "en_US", accept: "application/json" },
      });
      return r.text();
    }, qs);

    return JSON.parse(raw);
  } finally {
    await context.close();
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Scrape all available Leica M rangefinder lens listings from MPB.
 * Fetches the first page, discovers total count, then fetches all
 * remaining pages in parallel (up to MAX_PAGES).
 *
 * @returns {{ total: number, items: object[], availableBrands: string[] }}
 */
async function scrapeMPB() {
  const browser = await getBrowser();

  // Fetch page 0 to learn the total result count
  const firstPage = await fetchPage(browser, 0);
  const total = firstPage.total_results ?? 0;

  const brandFacet = (firstPage.facets || []).find(
    (f) => f.field === "model_brand"
  );
  const availableBrands = (brandFacet?.values || [])
    .filter((v) => v.count > 0)
    .map((v) => v.field_value);

  let allResults = firstPage.results || [];

  // Calculate remaining pages and fetch them in parallel
  const numPages = Math.min(Math.ceil(total / PAGE_SIZE), MAX_PAGES);
  if (numPages > 1) {
    const starts = Array.from(
      { length: numPages - 1 },
      (_, i) => (i + 1) * PAGE_SIZE
    );
    const remaining = await Promise.all(
      starts.map((start) =>
        fetchPage(browser, start).then((d) => d.results || []).catch(() => [])
      )
    );
    allResults = allResults.concat(remaining.flat());
  }

  const items = allResults
    .map(normaliseItem)
    .filter((item) => item.price !== null);

  return { total, items, availableBrands };
}

async function closeBrowser() {
  if (_browser) {
    await _browser.close();
    _browser = null;
  }
}

module.exports = { scrapeMPB, closeBrowser };
