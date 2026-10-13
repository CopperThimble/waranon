import { useEffect, useId, useMemo, useRef, useState } from "react";

/**
 * A select with a search box and grouped results, for long lists (impact effects, weapon icons…).
 * options: [{ value, label, group?, badge?, image?, keywords? }]
 */
export default function SearchSelect({ value, options, onChange, placeholder = "Search…", ariaLabel }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const root = useRef(null);
  const list = useRef(null);
  const listId = useId();
  const current = options.find((o) => o.value === value);

  const results = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const hay = (o) => `${o.label} ${o.group || ""} ${o.value} ${o.keywords || ""}`.toLowerCase();
    return options.filter((o) => words.every((w) => hay(o).includes(w)));
  }, [options, query]);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => !root.current?.contains(e.target) && setOpen(false);
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const choose = (o) => {
    onChange(o.value);
    setOpen(false);
    setQuery("");
  };

  function onKey(e) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(results.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (results[active]) choose(results[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="search-select" ref={root}>
      <button
        type="button"
        className="input search-select-current"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => {
          setOpen((o) => !o);
          setActive(Math.max(0, options.indexOf(current)));
        }}
      >
        {current?.image && <img src={current.image} alt="" className="search-select-img" />}
        <span className="search-select-label">{current ? current.label : <span className="muted">Choose…</span>}</span>
        {current?.badge && <span className="search-select-badge">{current.badge}</span>}
        <span className="muted" aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="search-select-pop">
          <input
            className="input"
            autoFocus
            placeholder={placeholder}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKey}
            aria-controls={listId}
          />
          <div className="search-select-list" role="listbox" id={listId} ref={list}>
            {results.map((o, i) => {
              const header = o.group && o.group !== results[i - 1]?.group ? o.group : null;
              return (
                <div key={o.value}>
                  {header && <div className="search-select-group">{header}</div>}
                  <button
                    type="button"
                    role="option"
                    aria-selected={o.value === value}
                    data-index={i}
                    className={`search-select-option ${i === active ? "active" : ""} ${o.value === value ? "chosen" : ""}`}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => choose(o)}
                  >
                    {o.image !== undefined && (o.image ? <img src={o.image} alt="" className="search-select-img" /> : <span className="search-select-img" />)}
                    <span className="search-select-label">{o.label}</span>
                    {o.badge && <span className="search-select-badge">{o.badge}</span>}
                  </button>
                </div>
              );
            })}
            {!results.length && <p className="muted small search-select-empty">Nothing matches “{query}”.</p>}
          </div>
          <div className="muted small search-select-foot">
            {results.length} of {options.length} · ↑↓ to move, Enter to pick, Esc to close
          </div>
        </div>
      )}
    </div>
  );
}
