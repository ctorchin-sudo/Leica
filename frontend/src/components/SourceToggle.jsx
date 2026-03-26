export default function SourceToggle({ mode, onChange, liveInfo }) {
  const formatAge = (seconds) => {
    if (seconds < 60) return `${seconds}s ago`;
    return `${Math.round(seconds / 60)}m ago`;
  };

  return (
    <div className="source-toggle">
      <div className="toggle-buttons">
        <button
          className={`toggle-btn ${mode === "static" ? "active" : ""}`}
          onClick={() => onChange("static")}
          title="Curated seed database of common Leica M lenses"
        >
          Seed Data
        </button>
        <button
          className={`toggle-btn ${mode === "live" ? "active" : ""}`}
          onClick={() => onChange("live")}
          title="Live listings scraped from MPB.com"
        >
          Live — MPB
        </button>
      </div>
      {mode === "live" && liveInfo && (
        <div className="live-status">
          <span className="live-dot" />
          <span>
            {liveInfo.fetched} listings
            {liveInfo.cachedAt && ` · cached ${formatAge(liveInfo.cacheAgeSeconds)}`}
          </span>
        </div>
      )}
    </div>
  );
}
