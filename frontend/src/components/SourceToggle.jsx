function formatAge(seconds) {
  if (seconds === null || seconds === undefined) return "";
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.round(seconds / 60)}m ago`;
}

export default function SourceToggle({ mode, onChange, liveInfo }) {
  const mpb = liveInfo?.sources?.mpb;
  const ebay = liveInfo?.sources?.ebay;

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
          title="Live listings scraped from MPB and eBay"
        >
          Live
        </button>
      </div>

      {mode === "live" && liveInfo && (
        <div className="live-status">
          <span className="live-dot" />
          <span className="live-sources">
            {mpb && (
              <span className="live-source-tag">
                MPB {mpb.items}
                {mpb.cachedAt && <em> · {formatAge(mpb.cacheAgeSeconds)}</em>}
              </span>
            )}
            {ebay && (
              <span className="live-source-tag">
                eBay {ebay.items}
                {ebay.cachedAt && <em> · {formatAge(ebay.cacheAgeSeconds)}</em>}
              </span>
            )}
          </span>
        </div>
      )}
    </div>
  );
}
