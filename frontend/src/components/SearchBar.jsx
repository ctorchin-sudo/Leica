import { useState } from "react";

export default function SearchBar({ value, onChange }) {
  const [inputValue, setInputValue] = useState(value);

  const handleSubmit = (e) => {
    e.preventDefault();
    onChange(inputValue);
  };

  const handleChange = (e) => {
    setInputValue(e.target.value);
    if (e.target.value === "") onChange("");
  };

  return (
    <form className="search-bar" onSubmit={handleSubmit}>
      <div className="search-input-wrapper">
        <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="text"
          placeholder="Search by brand, model, or description..."
          value={inputValue}
          onChange={handleChange}
          className="search-input"
        />
        {inputValue && (
          <button
            type="button"
            className="clear-btn"
            onClick={() => {
              setInputValue("");
              onChange("");
            }}
          >
            &times;
          </button>
        )}
      </div>
      <button type="submit" className="search-btn">Search</button>
    </form>
  );
}
