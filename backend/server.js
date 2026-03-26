const express = require("express");
const cors = require("cors");
const LENSES = require("./data/lenses");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// GET /api/lenses - search and filter lenses
app.get("/api/lenses", (req, res) => {
  const {
    q,
    brand,
    focalLength,
    maxAperture,
    condition,
    minPrice,
    maxPrice,
    sortBy = "price_asc",
  } = req.query;

  let results = [...LENSES];

  // Full-text search across model, brand, description
  if (q) {
    const query = q.toLowerCase();
    results = results.filter(
      (l) =>
        l.brand.toLowerCase().includes(query) ||
        l.model.toLowerCase().includes(query) ||
        l.description.toLowerCase().includes(query)
    );
  }

  // Brand filter (comma-separated)
  if (brand) {
    const brands = brand.split(",").map((b) => b.trim().toLowerCase());
    results = results.filter((l) => brands.includes(l.brand.toLowerCase()));
  }

  // Focal length filter (comma-separated or single)
  if (focalLength) {
    const fl = focalLength.split(",").map(Number);
    results = results.filter((l) => fl.includes(l.focalLength));
  }

  // Max aperture filter (e.g. "1.4" shows only f/1.4 or faster)
  if (maxAperture) {
    results = results.filter((l) => l.maxAperture <= parseFloat(maxAperture));
  }

  // Condition filter (comma-separated)
  if (condition) {
    const conditions = condition.split(",").map((c) => c.trim().toLowerCase());
    results = results.filter((l) =>
      conditions.includes(l.condition.toLowerCase())
    );
  }

  // Price range
  if (minPrice) {
    results = results.filter((l) => l.price >= parseFloat(minPrice));
  }
  if (maxPrice) {
    results = results.filter((l) => l.price <= parseFloat(maxPrice));
  }

  // Sorting
  switch (sortBy) {
    case "price_asc":
      results.sort((a, b) => a.price - b.price);
      break;
    case "price_desc":
      results.sort((a, b) => b.price - a.price);
      break;
    case "focal_asc":
      results.sort((a, b) => a.focalLength - b.focalLength);
      break;
    case "aperture_fast":
      results.sort((a, b) => a.maxAperture - b.maxAperture);
      break;
    default:
      break;
  }

  res.json({
    total: results.length,
    results,
  });
});

// GET /api/lenses/filters - return available filter options
app.get("/api/lenses/filters", (req, res) => {
  const brands = [...new Set(LENSES.map((l) => l.brand))].sort();
  const focalLengths = [...new Set(LENSES.map((l) => l.focalLength))].sort(
    (a, b) => a - b
  );
  const conditions = [
    "Like New",
    "Excellent",
    "Very Good",
    "Good",
    "Fair",
  ];
  const priceRange = {
    min: Math.min(...LENSES.map((l) => l.price)),
    max: Math.max(...LENSES.map((l) => l.price)),
  };

  res.json({ brands, focalLengths, conditions, priceRange });
});

app.listen(PORT, () => {
  console.log(`Leica lens search backend running on http://localhost:${PORT}`);
});
