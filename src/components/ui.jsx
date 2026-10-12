import { useEffect, useId, useRef } from "react";
import { blobUrl, fileToPng } from "../lib/images";

export function Button({ variant = "default", size, className = "", ...props }) {
  return <button type="button" className={`btn btn-${variant}${size ? ` btn-${size}` : ""} ${className}`} {...props} />;
}

export function Field({ label, hint, error, children, className = "" }) {
  const id = useId();
  return (
    <div className={`field ${className}`}>
      {label && (
        <label className="field-label" htmlFor={id}>
          {label}
        </label>
      )}
      {typeof children === "function" ? children(id) : children}
      {error ? <div className="field-error">{error}</div> : hint ? <div className="field-hint">{hint}</div> : null}
    </div>
  );
}

export function Modal({ title, onClose, children, footer, size = "md" }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal modal-${size}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal-header">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-footer">{footer}</footer>}
      </div>
    </div>
  );
}

export function Empty({ icon = "◇", title, children, action }) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function SideBadge({ side }) {
  return <span className={`side-badge side-${side}`}>{side === "PACT" ? "PACT" : "NATO"}</span>;
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

/**
 * Image picker that converts uploads to the PNG size the game expects.
 * `blob` = current custom image; `fallbackUrl` = vanilla image shown when none.
 */
export function ImageUpload({ blob, fallbackUrl, spec, onChange, onClear, className = "" }) {
  const input = useRef(null);
  const url = blob ? blobUrl(blob) : fallbackUrl;
  async function handle(file) {
    if (!file) return;
    try {
      onChange(await fileToPng(file, spec), file.name);
    } catch (err) {
      alert(`Couldn't read that image: ${err.message}`);
    }
  }
  return (
    <div className={`image-upload ${className}`}>
      <button
        type="button"
        className="image-upload-drop"
        style={{ aspectRatio: `${spec.width} / ${spec.height}` }}
        onClick={() => input.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          handle(e.dataTransfer.files[0]);
        }}
      >
        {url ? <img src={url} alt="" /> : <span className="image-upload-placeholder">Drop image or click</span>}
        {!blob && url && <span className="image-upload-tag">vanilla</span>}
      </button>
      <div className="image-upload-meta">
        <span>{spec.label}</span>
        <span className="image-upload-actions">
          <button type="button" className="link" onClick={() => input.current?.click()}>
            {blob ? "Replace" : "Upload"}
          </button>
          {blob && (
            <button type="button" className="link danger" onClick={onClear}>
              Remove
            </button>
          )}
        </span>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
        hidden
        onChange={(e) => {
          handle(e.target.files[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}

/**
 * Number control with a slider showing the vanilla range for context.
 * Values outside vanilla are allowed (and flagged); `hardMin`/`hardMax` are real limits.
 */
export function StatControl({ stat, value, baseValue, range, hardMin = 0, hardMax, onChange, onReset }) {
  const id = useId();
  const decimals = stat.decimals ?? 0;
  const vMin = range?.min ?? 0;
  const vMax = range?.max ?? Math.max(1, baseValue * 2);
  const sliderMin = Math.min(hardMin, vMin);
  const sliderMax = hardMax ?? niceCeil(Math.max(vMax * 1.5, value, baseValue));
  const span = sliderMax - sliderMin || 1;
  // Clamp to the track: the vanilla band can extend past a hard limit (e.g. a bomb family with
  // only 1 power level inside a weapon class whose band goes to 15) and must not overflow.
  const clampPct = (x) => Math.min(100, Math.max(0, ((x - sliderMin) / span) * 100));
  const pct = (x) => `${clampPct(x)}%`;
  const outside = range && (value < range.min || value > range.max);
  const changed = value !== baseValue;
  return (
    <div className={`stat ${outside ? "stat-outside" : ""} ${changed ? "stat-changed" : ""}`}>
      <div className="stat-head">
        <label htmlFor={id}>{stat.label}</label>
        <span className="stat-value">
          <input
            id={id}
            type="number"
            value={value}
            step={stat.step}
            min={hardMin}
            max={hardMax}
            onChange={(e) => e.target.value !== "" && onChange(Number(e.target.value))}
          />
          {stat.unit && <span className="stat-unit">{stat.unit}</span>}
        </span>
      </div>
      <div className="stat-track">
        {range && (
          <div
            className="stat-band"
            style={{ left: pct(range.min), width: `${Math.max(clampPct(range.max) - clampPct(range.min), 1)}%` }}
          />
        )}
        <div className="stat-base" style={{ left: pct(baseValue) }} title={`Base: ${baseValue}`} />
        <input
          type="range"
          min={sliderMin}
          max={sliderMax}
          step={stat.step}
          value={Math.min(Math.max(value, sliderMin), sliderMax)}
          onChange={(e) => onChange(round(Number(e.target.value), decimals))}
          aria-label={stat.label}
        />
      </div>
      <div className="stat-foot">
        <span>
          {range ? `vanilla ${range.min}–${range.max}` : ""}
          {hardMax != null && ` · max ${hardMax}`}
        </span>
        {changed ? (
          <button type="button" className="link" onClick={onReset}>
            reset to {baseValue}
          </button>
        ) : (
          <span className="stat-base-label">base</span>
        )}
      </div>
    </div>
  );
}

const round = (v, d) => Math.round(v * 10 ** d) / 10 ** d;

function niceCeil(x) {
  if (x <= 10) return Math.ceil(x);
  const mag = 10 ** Math.floor(Math.log10(x));
  return Math.ceil(x / mag) * mag;
}
