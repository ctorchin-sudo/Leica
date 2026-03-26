import { useState, useEffect, useCallback } from "react";
import { fetchLenses, fetchFilters, fetchLiveLenses } from "./api";
import SearchBar from "./components/SearchBar";
import FilterPanel from "./components/FilterPanel";
import LensGrid from "./components/LensGrid";
import SortBar from "./components/SortBar";
import SourceToggle from "./components/SourceToggle";
import "./App.css";

export default function App() {
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState({
    brands: [],
    focalLengths: [],
    conditions: [],
    minPrice: "",
    maxPrice: "",
    maxAperture: "",
  });
  const [sortBy, setSortBy] = useState("price_asc");
  const [results, setResults] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filterOptions, setFilterOptions] = useState(null);
  const [mode, setMode] = useState("static"); // "static" | "live"
  const [liveInfo, setLiveInfo] = useState(null); // { cachedAt, cacheAgeSeconds, fetched }

  useEffect(() => {
    fetchFilters().then(setFilterOptions).catch(console.error);
  }, []);

  const buildParams = useCallback(() => {
    const params = { sortBy };
    if (query) params.q = query;
    if (filters.brands.length) params.brand = filters.brands.join(",");
    if (filters.focalLengths.length)
      params.focalLength = filters.focalLengths.join(",");
    if (filters.conditions.length)
      params.condition = filters.conditions.join(",");
    if (filters.minPrice) params.minPrice = filters.minPrice;
    if (filters.maxPrice) params.maxPrice = filters.maxPrice;
    if (filters.maxAperture) params.maxAperture = filters.maxAperture;
    return params;
  }, [query, filters, sortBy]);

  const search = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = buildParams();
      if (mode === "live") {
        const data = await fetchLiveLenses(params);
        setResults(data.results);
        setTotal(data.filtered ?? data.total);
        setLiveInfo({ sources: data.sources });
      } else {
        const data = await fetchLenses(params);
        setResults(data.results);
        setTotal(data.total);
        setLiveInfo(null);
      }
    } catch {
      setError(
        mode === "live"
          ? "Could not fetch live listings — make sure the backend is running and Chromium is installed."
          : "Could not connect to the search server. Is the backend running on port 3001?"
      );
    } finally {
      setLoading(false);
    }
  }, [buildParams, mode]);

  useEffect(() => {
    search();
  }, [search]);

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-inner">
          <div className="logo">
            <div className="logo-mark">M</div>
            <div>
              <h1>Leica M Lens Finder</h1>
              <p className="subtitle">
                Search used Leica M mount lenses across multiple sources
              </p>
            </div>
          </div>
          <SourceToggle mode={mode} onChange={setMode} liveInfo={liveInfo} />
        </div>
      </header>

      <main className="app-main">
        <SearchBar value={query} onChange={setQuery} />

        <div className="content-layout">
          <aside className="sidebar">
            {filterOptions && (
              <FilterPanel
                options={filterOptions}
                filters={filters}
                onChange={setFilters}
              />
            )}
          </aside>

          <section className="results-area">
            <SortBar
              sortBy={sortBy}
              onChange={setSortBy}
              total={total}
              loading={loading}
            />
            {error ? (
              <div className="error-state">
                <p>{error}</p>
              </div>
            ) : (
              <LensGrid lenses={results} loading={loading} />
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
