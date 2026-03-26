const CONDITION_COLORS = {
  "Like New": "#22c55e",
  "Excellent": "#3b82f6",
  "Very Good": "#8b5cf6",
  "Good": "#f59e0b",
  "Fair": "#ef4444",
};

function ExternalIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="external-icon">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

export default function LensCard({ lens }) {
  const conditionColor = CONDITION_COLORS[lens.condition] || "#6b7280";

  return (
    <div className="lens-card">
      {lens.imageUrl && (
        <div className="lens-image-wrap">
          <img
            src={lens.imageUrl}
            alt={lens.model}
            className="lens-image"
            loading="lazy"
            onError={(e) => { e.currentTarget.parentElement.style.display = "none"; }}
          />
        </div>
      )}

      <div className="lens-card-header">
        <div className="lens-brand">{lens.brand}</div>
        <span
          className="condition-badge"
          style={{
            backgroundColor: conditionColor + "22",
            color: conditionColor,
            border: `1px solid ${conditionColor}44`,
          }}
        >
          {lens.condition}
        </span>
      </div>

      <h2 className="lens-model">{lens.model}</h2>

      <div className="lens-specs">
        {lens.focalLength && (
          <div className="spec">
            <span className="spec-label">FL</span>
            <span>{lens.focalLength}mm</span>
          </div>
        )}
        {lens.maxAperture && (
          <div className="spec">
            <span className="spec-label">f/</span>
            <span>{lens.maxAperture}</span>
          </div>
        )}
        <div className="spec">
          <span className="spec-label">Mount</span>
          <span>Leica M</span>
        </div>
      </div>

      {lens.description && (
        <p className="lens-description">{lens.description}</p>
      )}

      <div className="lens-card-footer">
        <div className="price">${lens.price.toLocaleString()}</div>
        <a
          href={lens.url}
          target="_blank"
          rel="noopener noreferrer"
          className="source-link"
        >
          {lens.source}
          <ExternalIcon />
        </a>
      </div>
    </div>
  );
}
