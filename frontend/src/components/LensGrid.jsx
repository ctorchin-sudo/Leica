import LensCard from "./LensCard";

function SkeletonCard() {
  return (
    <div className="lens-card skeleton">
      <div className="skeleton-line short" />
      <div className="skeleton-line" />
      <div className="skeleton-line medium" />
      <div className="skeleton-line long" />
      <div className="skeleton-footer">
        <div className="skeleton-line short" />
        <div className="skeleton-line short" />
      </div>
    </div>
  );
}

export default function LensGrid({ lenses, loading }) {
  if (loading) {
    return (
      <div className="lens-grid">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  if (lenses.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </div>
        <h3>No lenses found</h3>
        <p>Try adjusting your search or filters.</p>
      </div>
    );
  }

  return (
    <div className="lens-grid">
      {lenses.map((lens) => (
        <LensCard key={lens.id} lens={lens} />
      ))}
    </div>
  );
}
