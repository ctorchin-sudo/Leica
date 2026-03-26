/**
 * KEH Camera scraper — uses Playwright to establish a session, then calls
 * KEH's Bloomreach DXP search API to fetch all in-stock Leica M mount lenses.
 *
 * KEH is protected by Cloudflare. Plain HTTP requests are blocked (403).
 * We use Playwright to load the KEH homepage (which passes CF clearance),
 * then call the Bloomreach API from within that page context so the CF
 * cookies are included automatically.
 *
 * API: https://core.dxpapi.com/api/v1/core/
 *   auth_key=ixtut7ssagqdrgkx, domain_key=keh, account_id=7655
 *   fq=keh_system:"Leica M", fq=Stock:"In Stock"
 */

const { chromium } = require("playwright-core");

const CHROMIUM_PATH =
  process.env.CHROMIUM_PATH ||
  "/root/.cache/ms-playwright/chromium-1194/chrome-linux/chrome";

const KEH_BASE = "https://www.keh.com";
const DXP_URL = "https://core.dxpapi.com/api/v1/core/";

const PAGE_SIZE = 200; // request large pages — KEH typically has ~200 Leica M items
const MAX_PAGES = 5;

// Map KEH grade codes to normalised condition strings
const GRADE_MAP = {
  "LN": "Like New",
  "LN-": "Like New",
  "EX+": "Excellent",
  "EX": "Excellent",
  "EX-": "Excellent",
  "VG+": "Very Good",
  "VG": "Very Good",
  "VG-": "Very Good",
  "G+": "Good",
  "G": "Good",
  "G-": "Good",
  "FAIR": "Fair",
  "PR": "Fair", // Poor / For Parts
  "UGLY": "Fair",
};

function normaliseGrade(grade) {
  if (!grade) return "Used";
  return GRADE_MAP[grade.toUpperCase()] ?? "Used";
}

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

function buildDxpParams({ start = 0, rows = PAGE_SIZE } = {}) {
  const fields = [
    "pid",
    "title",
    "thumb_image_webp",
    "url",
    "quantity",
    "min_price",
    "max_price",
    "keh_manufacturer",
    "grades",
    "keh_system",
  ].join(",");

  const params = new URLSearchParams({
    auth_key: "ixtut7ssagqdrgkx",
    domain_key: "keh",
    account_id: "7655",
    request_type: "search",
    search_type: "keyword",
    q: "*",
    fl: fields,
    rows: String(rows),
    start: String(start),
  });

  // Multi-value fq params — URLSearchParams encodes them correctly
  params.append("fq", 'Stock:"In Stock"');
  params.append("fq", 'keh_system:"Leica M"');

  return params.toString();
}

function normaliseItem(doc) {
  const title = doc.title ?? "Unknown";
  const brand = doc.keh_manufacturer ?? "Unknown";

  // KEH prices are in dollars (not cents)
  const price = parseFloat(doc.min_price ?? doc.max_price ?? 0);
  if (!price || price < 1) return null;

  // grades is an array like ["VG"] or ["LN-"]; use the first entry
  const gradeRaw = Array.isArray(doc.grades) ? doc.grades[0] : doc.grades;
  const condition = normaliseGrade(gradeRaw);

  const url = doc.url
    ? doc.url.startsWith("http")
      ? doc.url
      : `${KEH_BASE}${doc.url}`
    : `${KEH_BASE}/cameras/lenses`;

  const imageUrl = doc.thumb_image_webp
    ? doc.thumb_image_webp.startsWith("http")
      ? doc.thumb_image_webp
      : `https:${doc.thumb_image_webp}`
    : null;

  // Extract focal length and max aperture from title
  const focalMatch = title.match(/(\d+)(?:-\d+)?mm/i);
  const apertureMatch = title.match(/f\/?(\d+(?:\.\d+)?)/i);
  const focalLength = focalMatch ? parseInt(focalMatch[1], 10) : null;
  const maxAperture = apertureMatch ? parseFloat(apertureMatch[1]) : null;

  return {
    id: `keh-${doc.pid}`,
    source: "KEH",
    brand,
    model: title,
    focalLength,
    maxAperture,
    mount: "Leica M",
    condition,
    price,
    imageUrl,
    url,
    description: `Used ${title} in ${condition} condition from KEH Camera.`,
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

async function fetchPage(browser, start) {
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();
  try {
    // Load KEH homepage to establish Cloudflare clearance cookie
    await page.goto(`${KEH_BASE}/`, {
      timeout: 40000,
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(2000);

    const qs = buildDxpParams({ start, rows: PAGE_SIZE });
    const raw = await page.evaluate(
      async ({ url, queryString }) => {
        const r = await fetch(`${url}?${queryString}`, {
          headers: { accept: "application/json" },
        });
        return r.text();
      },
      { url: DXP_URL, queryString: qs }
    );

    return JSON.parse(raw);
  } finally {
    await context.close();
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Scrape all in-stock Leica M mount lenses from KEH Camera.
 * Fetches the first page to discover total count, then remaining pages
 * in parallel (up to MAX_PAGES).
 *
 * @returns {{ total: number, items: object[] }}
 */
async function scrapeKEH() {
  const browser = await getBrowser();

  // Fetch first page to learn total
  const firstPage = await fetchPage(browser, 0);
  const total = firstPage.response?.numFound ?? 0;
  const firstDocs = firstPage.response?.docs ?? [];

  let allDocs = [...firstDocs];

  const numPages = Math.min(Math.ceil(total / PAGE_SIZE), MAX_PAGES);
  if (numPages > 1) {
    const starts = Array.from(
      { length: numPages - 1 },
      (_, i) => (i + 1) * PAGE_SIZE
    );
    const remaining = await Promise.all(
      starts.map((start) =>
        fetchPage(browser, start)
          .then((d) => d.response?.docs ?? [])
          .catch(() => [])
      )
    );
    allDocs = allDocs.concat(remaining.flat());
  }

  const items = allDocs
    .map(normaliseItem)
    .filter(Boolean);

  return { total, items };
}

async function closeBrowser() {
  if (_browser) {
    await _browser.close();
    _browser = null;
  }
}

module.exports = { scrapeKEH, closeBrowser };
