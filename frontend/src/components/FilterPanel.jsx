const APERTURE_OPTIONS = [
  { label: "f/0.95 or faster", value: "0.95" },
  { label: "f/1.1 or faster", value: "1.1" },
  { label: "f/1.4 or faster", value: "1.4" },
  { label: "f/1.7 or faster", value: "1.7" },
  { label: "f/2.0 or faster", value: "2.0" },
  { label: "f/2.8 or faster", value: "2.8" },
  { label: "Any aperture", value: "" },
];

function CheckboxGroup({ title, items, selected, onToggle }) {
  return (
    <div className="filter-group">
      <h3 className="filter-title">{title}</h3>
      <div className="filter-items">
        {items.map((item) => {
          const value = String(item);
          const isChecked = selected.includes(value);
          return (
            <label key={value} className="filter-label">
              <input
                type="checkbox"
                checked={isChecked}
                onChange={() => onToggle(value)}
              />
              <span>{value}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

export default function FilterPanel({ options, filters, onChange }) {
  const toggle = (key, value) => {
    const current = filters[key];
    const updated = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    onChange({ ...filters, [key]: updated });
  };

  const focalLengthLabels = options.focalLengths.map((fl) => `${fl}mm`);
  const selectedFocalLabels = filters.focalLengths.map((fl) => `${fl}mm`);

  const toggleFocal = (label) => {
    const fl = label.replace("mm", "");
    toggle("focalLengths", fl);
  };

  return (
    <div className="filter-panel">
      <div className="filter-panel-header">
        <h2>Filters</h2>
        <button
          className="clear-filters-btn"
          onClick={() =>
            onChange({
              brands: [],
              focalLengths: [],
              conditions: [],
              minPrice: "",
              maxPrice: "",
              maxAperture: "",
            })
          }
        >
          Clear all
        </button>
      </div>

      <CheckboxGroup
        title="Brand"
        items={options.brands}
        selected={filters.brands}
        onToggle={(v) => toggle("brands", v)}
      />

      <CheckboxGroup
        title="Focal Length"
        items={focalLengthLabels}
        selected={selectedFocalLabels}
        onToggle={toggleFocal}
      />

      <CheckboxGroup
        title="Condition"
        items={options.conditions}
        selected={filters.conditions}
        onToggle={(v) => toggle("conditions", v)}
      />

      <div className="filter-group">
        <h3 className="filter-title">Max Aperture</h3>
        <select
          className="filter-select"
          value={filters.maxAperture}
          onChange={(e) => onChange({ ...filters, maxAperture: e.target.value })}
        >
          {APERTURE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div className="filter-group">
        <h3 className="filter-title">Price Range (USD)</h3>
        <div className="price-range">
          <input
            type="number"
            placeholder={`Min ($${options.priceRange.min})`}
            value={filters.minPrice}
            onChange={(e) => onChange({ ...filters, minPrice: e.target.value })}
            className="price-input"
            min="0"
          />
          <span className="price-separator">—</span>
          <input
            type="number"
            placeholder={`Max ($${options.priceRange.max})`}
            value={filters.maxPrice}
            onChange={(e) => onChange({ ...filters, maxPrice: e.target.value })}
            className="price-input"
            min="0"
          />
        </div>
      </div>
    </div>
  );
}
