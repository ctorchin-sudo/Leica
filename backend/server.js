const express = require("express");
const cors = require("cors");
const LENSES = require("./data/lenses");
const { scrapeMPB, closeBrowser } = require("./scrapers/mpb");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// ─── Shared filter/sort logic ────────────────────────────────────────────────

function applyFilters(results, query) {
  const { q, brand, focalLength, maxAperture, condition, minPrice, maxPrice } =
    query;

  if (q) {
    const text = q.toLowerCase();
    results = results.filter(
      (l) =>
        l.brand.toLowerCase().includes(text) ||
        l.model.toLowerCase().includes(text) ||
        (l.description || "").toLowerCase().includes(text)
    );
  }
  if (brand) {
    const brands = brand.split(",").map((b) => b.trim().toLowerCase());
    results = results.filter((l) => brands.includes(l.brand.toLowerCase()));
  }
  if (focalLength) {
    const fl = focalLength.split(",").map(Number);
    results = results.filter((l) => l.focalLength && fl.includes(l.focalLength));
  }
  if (maxAperture) {
    results = results.filter(
      (l) => l.maxAperture && l.maxAperture <= parseFloat(maxAperture)
    );
  }
  if (condition) {
    const conditions = condition.split(",").map((c) => c.trim().toLowerCase());
    results = results.filter((l) =>
      conditions.includes(l.condition.toLowerCase())
    );
  }
  if (minPrice) {
    results = results.filter((l) => l.price >= parseFloat(minPrice));
  }
  if (maxPrice) {
    results = results.filter((l) => l.price <= parseFloat(maxPrice));
  }
  return results;
}

function applySort(results, sortBy = "price_asc") {
  switch (sortBy) {
    case "price_asc":
      return [...results].sort((a, b) => a.price - b.price);
    case "price_desc":
      return [...results].sort((a, b) => b.price - a.price);
    case "focal_asc":
      return [...results].sort(
        (a, b) => (a.focalLength ?? 999) - (b.focalLength ?? 999)
      );
    case "aperture_fast":
      return [...results].sort(
        (a, b) => (a.maxAperture ?? 99) - (b.maxAperture ?? 99)
      );
    default:
      return results;
  }
}

// ─── Static lens database endpoints ─────────────────────────────────────────

// GET /api/lenses - search and filter the static seed database
app.get("/api/lenses", (req, res) => {
  const { sortBy = "price_asc" } = req.query;
  let results = applyFilters([...LENSES], req.query);
  results = applySort(results, sortBy);
  res.json({ total: results.length, results, source: "static" });
});

// GET /api/lenses/filters - available filter options from static data
app.get("/api/lenses/filters", (req, res) => {
  const brands = [...new Set(LENSES.map((l) => l.brand))].sort();
  const focalLengths = [...new Set(LENSES.map((l) => l.focalLength))].sort(
    (a, b) => a - b
  );
  const conditions = ["Like New", "Excellent", "Very Good", "Good", "Fair"];
  const priceRange = {
    min: Math.min(...LENSES.map((l) => l.price)),
    max: Math.max(...LENSES.map((l) => l.price)),
  };
  res.json({ brands, focalLengths, conditions, priceRange });
});

// ─── Live scrape endpoint ────────────────────────────────────────────────────

// Simple in-memory cache — refreshes every 10 minutes
const CACHE_TTL_MS = 10 * 60 * 1000;
let scrapeCache = null;
let cacheTimestamp = 0;
let scrapeInProgress = false;

async function refreshCache() {
  if (scrapeInProgress) return;
  scrapeInProgress = true;
  try {
    console.log("[scraper] Starting MPB scrape...");
    const result = await scrapeMPB({ rows: 48 });
    scrapeCache = result;
    cacheTimestamp = Date.now();
    console.log(`[scraper] Done — ${result.total} total, ${result.items.length} fetched`);
  } catch (err) {
    console.error("[scraper] Failed:", err.message);
  } finally {
    scrapeInProgress = false;
  }
}

// GET /api/scrape - live listings from MPB via Playwright scraper
app.get("/api/scrape", async (req, res) => {
  const { sortBy = "price_asc", refresh } = req.query;

  // Serve from cache if fresh, unless ?refresh=1
  const cacheAge = Date.now() - cacheTimestamp;
  if (scrapeCache && cacheAge < CACHE_TTL_MS && refresh !== "1") {
    let items = applyFilters([...scrapeCache.items], req.query);
    items = applySort(items, sortBy);
    return res.json({
      total: scrapeCache.total,
      fetched: scrapeCache.items.length,
      results: items,
      source: "mpb-live",
      cachedAt: new Date(cacheTimestamp).toISOString(),
      cacheAgeSeconds: Math.round(cacheAge / 1000),
    });
  }

  // Trigger fresh scrape (non-blocking — stream back when ready)
  try {
    await refreshCache();
    if (!scrapeCache) {
      return res
        .status(503)
        .json({ error: "Scrape failed — see server logs." });
    }
    let items = applyFilters([...scrapeCache.items], req.query);
    items = applySort(items, sortBy);
    return res.json({
      total: scrapeCache.total,
      fetched: scrapeCache.items.length,
      results: items,
      source: "mpb-live",
      cachedAt: new Date(cacheTimestamp).toISOString(),
      cacheAgeSeconds: 0,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/scrape/status - cache status
app.get("/api/scrape/status", (req, res) => {
  res.json({
    cached: scrapeCache !== null,
    inProgress: scrapeInProgress,
    total: scrapeCache?.total ?? 0,
    fetched: scrapeCache?.items?.length ?? 0,
    availableBrands: scrapeCache?.availableBrands ?? [],
    cachedAt: cacheTimestamp
      ? new Date(cacheTimestamp).toISOString()
      : null,
    cacheAgeSeconds: cacheTimestamp
      ? Math.round((Date.now() - cacheTimestamp) / 1000)
      : null,
  });
});

// ─── Start ───────────────────────────────────────────────────────────────────

const server = app.listen(PORT, () => {
  console.log(`Leica lens search backend running on http://localhost:${PORT}`);
});

process.on("SIGTERM", async () => {
  await closeBrowser();
  server.close();
});
process.on("SIGINT", async () => {
  await closeBrowser();
  server.close();
  process.exit(0);
});
