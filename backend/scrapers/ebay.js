/**
 * eBay scraper — uses Playwright to load eBay's Buy-It-Now search results
 * for pre-owned Leica M mount lenses and extract structured listing data.
 *
 * eBay blocks plain HTTP scraping (400 errors), so Playwright is required
 * to render the page in a real browser before extracting data.
 *
 * Results are filtered server-side to keep only genuine M-mount lenses:
 *   - Must have eBay's own "Leica M ·" tag OR "Leica M" / "M-Mount" in title
 *   - Price must be ≥ $50 (filters auction starting bids and junk)
 *   - Excludes known M39/LTM/screw-mount indicators in title
 */

const { chromium } = require("playwright-core");

const CHROMIUM_PATH =
  process.env.CHROMIUM_PATH ||
  "/root/.cache/ms-playwright/chromium-1194/chrome-linux/chrome";

const EBAY_BASE = "https://www.ebay.com";
const SEARCH_URL = `${EBAY_BASE}/sch/i.html`;
const MAX_PAGES = 4; // ~200 listings max per scrape cycle

// Search params — pre-owned, Buy It Now, Lenses category, sorted by best match
const BASE_PARAMS = {
  _nkw: "leica m mount lens",
  _sacat: "625",        // Cameras & Photo > Lenses
  LH_ItemCondition: "3000", // Pre-Owned
  LH_BIN: "1",          // Buy It Now only
  _sop: "12",           // Sort: best match
};

// Brands commonly sold in the Leica M ecosystem
const KNOWN_BRANDS = [
  "Leica",
  "Voigtlander",
  "Voigtländer",
  "Zeiss",
  "TTArtisan",
  "TTartisan",
  "7Artisans",
  "Thypoch",
  "Laowa",
  "Konica",
  "Minolta",
  "Nikon",
  "Canon",
  "Industar",
  "Jupiter",
  "Meyer",
  "Heliar",
  "Nokton",
];

// Patterns that indicate this is NOT a true M-mount lens
const EXCLUDE_PATTERNS = [/\bm39\b/i, /\bltm\b/i, /\bscrew\s+mount\b/i, /\bl39\b/i];

function parseProxy(u) {
  if (!u) return undefined;
  try {
    const url = new URL(u);
    return {
      server: `${url.protocol}//${url.hostname}:${url.port}`,
      username: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
    };
  } catch {
    return undefined;
  }
}

function inferBrand(title) {
  for (const brand of KNOWN_BRANDS) {
    if (title.toLowerCase().includes(brand.toLowerCase())) {
      return brand === "Voigtländer" ? "Voigtlander" : brand;
    }
  }
  return "Other";
}

function normaliseCondition(raw) {
  if (!raw) return "Used";
  const lower = raw.toLowerCase();
  if (lower.includes("like new") || lower.includes("mint")) return "Like New";
  if (lower.includes("excellent")) return "Excellent";
  if (lower.includes("very good")) return "Very Good";
  if (lower.includes("good")) return "Good";
  if (lower.includes("fair") || lower.includes("parts")) return "Fair";
  return "Used";
}

function extractItems(rawCards) {
  const items = [];

  for (const card of rawCards) {
    const { spans, link, img } = card;
    if (!link || !spans.length) continue;

    const title = spans[0];
    if (!title || title === "Shop on eBay" || title.length < 10) continue;

    // Find price span matching $X.XX
    const priceSpan = spans.find((s) => /^\$[\d,]+\.\d{2}$/.test(s));
    if (!priceSpan) continue;
    const price = parseFloat(priceSpan.replace(/[$,]/g, ""));
    if (price < 50) continue;

    // eBay tags items with their mount type — keep only Leica M tagged items
    // OR items whose title clearly mentions Leica M mount
    const hasLeicaMTag = spans.includes("Leica M ·");
    const titleLower = title.toLowerCase();
    const titleHasLeicaM =
      titleLower.includes("leica m") ||
      titleLower.includes("m-mount") ||
      titleLower.includes("vm leica") ||
      titleLower.includes("for leica");

    if (!hasLeicaMTag && !titleHasLeicaM) continue;

    // Exclude M39/LTM screw-mount items that slipped through
    if (EXCLUDE_PATTERNS.some((re) => re.test(title))) continue;

    // Extract condition from subtitle spans
    const condSpan = spans.find(
      (s) =>
        s.startsWith("Pre-Owned") ||
        s.startsWith("Used") ||
        s.startsWith("For Parts") ||
        s.includes("Near Mint") ||
        s.includes("Excellent")
    );
    const condition = normaliseCondition(condSpan?.replace(/\s*·\s*$/, ""));

    // Extract focal length and aperture from spans (eBay tags these explicitly)
    const focalSpan = spans.find((s) => /^\d+mm\s*·?$/.test(s));
    const apertureSpan = spans.find((s) => /^f\/[\d.]+\s*·?$/.test(s));
    const focalMatch = (focalSpan || title).match(/(\d+)(?:-\d+)?mm/);
    const apertureMatch = (apertureSpan || title).match(/f\/?(\d+(?:\.\d+)?)/i);

    const focalLength = focalMatch ? parseInt(focalMatch[1], 10) : null;
    const maxAperture = apertureMatch ? parseFloat(apertureMatch[1]) : null;

    // Clean up eBay item URL — strip tracking params
    const itemUrl = link.split("?")[0];

    items.push({
      id: `ebay-${itemUrl.split("/").pop()}`,
      source: "eBay",
      brand: inferBrand(title),
      model: title,
      focalLength,
      maxAperture,
      mount: "Leica M",
      condition,
      price,
      imageUrl: img || null,
      url: itemUrl,
      description: title,
    });
  }

  return items;
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

async function fetchEbayPage(browser, pageNum) {
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();
  try {
    const params = new URLSearchParams({
      ...BASE_PARAMS,
      ...(pageNum > 1 ? { _pgn: String(pageNum) } : {}),
    });
    await page.goto(`${SEARCH_URL}?${params}`, {
      timeout: 40000,
      waitUntil: "domcontentloaded",
    });
    // Wait for cards to render
    await page.waitForTimeout(4000);

    const rawCards = await page.locator(".s-card").evaluateAll((els) =>
      els.map((el) => {
        const spans = Array.from(el.querySelectorAll("span"))
          .map((s) => s.textContent?.trim())
          .filter(Boolean);
        const linkEl = el.querySelector('a[href*="ebay.com/itm"]');
        const imgEl = el.querySelector('img[src*="ebayimg"]');
        return {
          spans,
          link: linkEl?.href ?? null,
          img: imgEl?.src ?? null,
        };
      })
    );

    return rawCards;
  } finally {
    await context.close();
  }
}

/**
 * Scrape eBay for used Leica M mount lenses (Buy It Now, Pre-Owned).
 * Fetches up to MAX_PAGES pages in parallel.
 *
 * @returns {{ items: object[] }}
 */
async function scrapeEbay() {
  const browser = await getBrowser();

  const pageNums = Array.from({ length: MAX_PAGES }, (_, i) => i + 1);
  const pages = await Promise.all(
    pageNums.map((n) => fetchEbayPage(browser, n).catch(() => []))
  );

  const allCards = pages.flat();
  const items = extractItems(allCards);

  // Deduplicate by eBay item ID
  const seen = new Set();
  const unique = items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });

  return { items: unique };
}

async function closeBrowser() {
  if (_browser) {
    await _browser.close();
    _browser = null;
  }
}

module.exports = { scrapeEbay, closeBrowser };
