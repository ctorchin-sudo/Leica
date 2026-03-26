const express = require("express");
const cors = require("cors");
const LENSES = require("./data/lenses");
const { scrapeMPB, closeBrowser: closeMPB } = require("./scrapers/mpb");
const { scrapeEbay, closeBrowser: closeEbay } = require("./scrapers/ebay");
const { scrapeKEH, closeBrowser: closeKEH } = require("./scrapers/keh");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// ─── Shared filter/sort logic ─────────────────────────────────────────────────

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
  const copy = [...results];
  switch (sortBy) {
    case "price_asc":
      return copy.sort((a, b) => a.price - b.price);
    case "price_desc":
      return copy.sort((a, b) => b.price - a.price);
    case "focal_asc":
      return copy.sort(
        (a, b) => (a.focalLength ?? 999) - (b.focalLength ?? 999)
      );
    case "aperture_fast":
      return copy.sort(
        (a, b) => (a.maxAperture ?? 99) - (b.maxAperture ?? 99)
      );
    default:
      return copy;
  }
}

// ─── Static database endpoints ────────────────────────────────────────────────

app.get("/api/lenses", (req, res) => {
  const { sortBy = "price_asc" } = req.query;
  let results = applyFilters([...LENSES], req.query);
  results = applySort(results, sortBy);
  res.json({ total: results.length, results, source: "static" });
});

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

// ─── Live scrape cache ────────────────────────────────────────────────────────

const CACHE_TTL_MS = 10 * 60 * 1000;

const cache = {
  mpb: { data: null, ts: 0 },
  ebay: { data: null, ts: 0 },
  keh: { data: null, ts: 0 },
};
const inProgress = { mpb: false, ebay: false, keh: false };

async function refreshSource(source) {
  if (inProgress[source]) return;
  inProgress[source] = true;
  try {
    console.log(`[scraper] Starting ${source} scrape...`);
    const result =
      source === "mpb"
        ? await scrapeMPB()
        : source === "keh"
        ? await scrapeKEH()
        : await scrapeEbay();
    cache[source] = { data: result, ts: Date.now() };
    const count =
      source === "mpb" ? result.items.length : result.items.length;
    console.log(`[scraper] ${source} done — ${count} items`);
  } catch (err) {
    console.error(`[scraper] ${source} failed:`, err.message);
  } finally {
    inProgress[source] = false;
  }
}

function isFresh(source) {
  return cache[source].data && Date.now() - cache[source].ts < CACHE_TTL_MS;
}

// ─── /api/scrape ─────────────────────────────────────────────────────────────

// GET /api/scrape?sources=mpb,ebay&sortBy=price_asc&...
app.get("/api/scrape", async (req, res) => {
  const { sortBy = "price_asc", refresh, sources = "mpb,ebay,keh" } = req.query;
  const requestedSources = sources.split(",").map((s) => s.trim().toLowerCase());
  const forceRefresh = refresh === "1";

  // Refresh stale sources (in parallel)
  const toRefresh = requestedSources.filter(
    (s) =>
      (forceRefresh || !isFresh(s)) &&
      (s === "mpb" || s === "ebay" || s === "keh")
  );
  if (toRefresh.length) {
    await Promise.all(toRefresh.map(refreshSource));
  }

  // Merge results from all requested sources
  let allItems = [];
  const sourceMeta = {};

  for (const source of requestedSources) {
    const entry = cache[source];
    if (!entry.data) continue;
    allItems = allItems.concat(entry.data.items);
    sourceMeta[source] = {
      items: entry.data.items.length,
      total: entry.data.total ?? entry.data.items.length,
      cachedAt: new Date(entry.ts).toISOString(),
      cacheAgeSeconds: Math.round((Date.now() - entry.ts) / 1000),
    };
  }

  if (!allItems.length) {
    return res.status(503).json({
      error: "No data available — scrape may have failed. Check server logs.",
    });
  }

  let results = applyFilters(allItems, req.query);
  results = applySort(results, sortBy);

  res.json({
    total: allItems.length,
    filtered: results.length,
    results,
    sources: sourceMeta,
  });
});

// GET /api/scrape/status
app.get("/api/scrape/status", (req, res) => {
  res.json({
    sources: {
      mpb: {
        cached: isFresh("mpb"),
        inProgress: inProgress.mpb,
        items: cache.mpb.data?.items?.length ?? 0,
        total: cache.mpb.data?.total ?? 0,
        availableBrands: cache.mpb.data?.availableBrands ?? [],
        cachedAt: cache.mpb.ts ? new Date(cache.mpb.ts).toISOString() : null,
        cacheAgeSeconds: cache.mpb.ts
          ? Math.round((Date.now() - cache.mpb.ts) / 1000)
          : null,
      },
      ebay: {
        cached: isFresh("ebay"),
        inProgress: inProgress.ebay,
        items: cache.ebay.data?.items?.length ?? 0,
        cachedAt: cache.ebay.ts ? new Date(cache.ebay.ts).toISOString() : null,
        cacheAgeSeconds: cache.ebay.ts
          ? Math.round((Date.now() - cache.ebay.ts) / 1000)
          : null,
      },
      keh: {
        cached: isFresh("keh"),
        inProgress: inProgress.keh,
        items: cache.keh.data?.items?.length ?? 0,
        total: cache.keh.data?.total ?? 0,
        cachedAt: cache.keh.ts ? new Date(cache.keh.ts).toISOString() : null,
        cacheAgeSeconds: cache.keh.ts
          ? Math.round((Date.now() - cache.keh.ts) / 1000)
          : null,
      },
    },
  });
});

// ─── Start ────────────────────────────────────────────────────────────────────

const server = app.listen(PORT, () => {
  console.log(`Leica lens search backend running on http://localhost:${PORT}`);
});

async function shutdown() {
  await Promise.all([closeMPB(), closeEbay(), closeKEH()]);
  server.close();
}

process.on("SIGTERM", () => shutdown());
process.on("SIGINT", () => shutdown().then(() => process.exit(0)));
