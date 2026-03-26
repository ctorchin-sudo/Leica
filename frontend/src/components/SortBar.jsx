const SORT_OPTIONS = [
  { value: "price_asc", label: "Price: Low to High" },
  { value: "price_desc", label: "Price: High to Low" },
  { value: "focal_asc", label: "Focal Length" },
  { value: "aperture_fast", label: "Fastest Aperture" },
];

export default function SortBar({ sortBy, onChange, total, loading }) {
  return (
    <div className="sort-bar">
      <span className="result-count">
        {loading ? "Searching..." : `${total} listing${total !== 1 ? "s" : ""} found`}
      </span>
      <div className="sort-controls">
        <label htmlFor="sort-select" className="sort-label">Sort by:</label>
        <select
          id="sort-select"
          className="sort-select"
          value={sortBy}
          onChange={(e) => onChange(e.target.value)}
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
