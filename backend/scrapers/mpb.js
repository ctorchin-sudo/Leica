/**
 * MPB scraper — queries MPB's internal search-service API
 * for used Leica M mount (rangefinder) lenses.
 *
 * MPB uses a React SPA. Their search-service requires:
 *   - A `content-language` header set to the locale
 *   - A valid Cloudflare `__cf_bm` session cookie
 *
 * We use Playwright to: (1) boot a real browser to establish the
 * CF session, (2) call the API from within that page context so
 * all cookies/headers are forwarded automatically.
 */

const { chromium } = require("playwright-core");

const CHROMIUM_PATH =
  process.env.CHROMIUM_PATH ||
  "/root/.cache/ms-playwright/chromium-1194/chrome-linux/chrome";

const MPB_BASE = "https://www.mpb.com";
const MPB_IMAGE_BASE = "https://www.mpb.com";
const MPB_PRODUCT_BASE = "https://www.mpb.com/en-us/equipment/camera-lenses";

const CONDITION_MAP = {
  5: "Like New",
  4: "Excellent",
  3: "Very Good",
  2: "Good",
  1: "Fair",
};

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

function buildApiParams({ start = 0, rows = 48, brands = [] } = {}) {
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

  if (brands.length === 1) {
    entries.push(["filter_query[model_brand]", brands[0]]);
  }

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
  const imageUrl = imgPath ? `${MPB_IMAGE_BASE}${imgPath}` : null;
  const url = productSlug
    ? `${MPB_PRODUCT_BASE}/${modelSlug}/${productSlug}`
    : `${MPB_PRODUCT_BASE}/${modelSlug}`;

  // Extract focal length and aperture from name (best-effort)
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

/**
 * Scrape MPB for used Leica M mount lenses.
 * @param {object} opts
 * @param {number} opts.page   0-based page index
 * @param {number} opts.rows   Results per page (max 48)
 * @param {string[]} opts.brands  Optional brand filter array
 * @returns {{ total: number, items: object[] }}
 */
async function scrapeMPB({ page: pageNum = 0, rows = 48, brands = [] } = {}) {
  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    ignoreHTTPSErrors: true,
  });

  const browserPage = await context.newPage();

  try {
    // Establish session / CF cookie
    await browserPage.goto(`${MPB_BASE}/en-us/`, {
      timeout: 30000,
      waitUntil: "domcontentloaded",
    });

    const queryString = buildApiParams({
      start: pageNum * rows,
      rows,
      brands,
    });

    const raw = await browserPage.evaluate(async (qs) => {
      const r = await fetch(`/search-service/product/query/?${qs}`, {
        headers: {
          "content-language": "en_US",
          accept: "application/json",
        },
      });
      return r.text();
    }, queryString);

    const data = JSON.parse(raw);

    const items = (data.results || [])
      .map(normaliseItem)
      .filter((item) => item.price !== null);

    const brandFacet = (data.facets || []).find(
      (f) => f.field === "model_brand"
    );
    const availableBrands = (brandFacet?.values || [])
      .filter((v) => v.count > 0)
      .map((v) => v.field_value);

    return {
      total: data.total_results ?? 0,
      items,
      availableBrands,
    };
  } finally {
    await context.close();
  }
}

/**
 * Gracefully close the shared browser instance.
 */
async function closeBrowser() {
  if (_browser) {
    await _browser.close();
    _browser = null;
  }
}

module.exports = { scrapeMPB, closeBrowser };
