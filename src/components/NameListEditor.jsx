import { useMemo, useState } from "react";
import { MAX_NAMES, MAX_NAME_LENGTH, MIN_NAMES, parseNameList } from "../lib/unitNames";
import { Button } from "./ui";

const EXAMPLE = `# One name per line. Lines starting with # are ignored.
Kowalski
Nakamura
Okafor
Lindqvist
Rhodes`;

const pick = (list, n) => {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
};

/** Paste-in list of random unit names for a custom nation (nation.customNames, raw text). */
export default function NameListEditor({ value = "", onChange }) {
  const { names, duplicates, tooLong } = useMemo(() => parseNameList(value), [value]);
  const [seed, setSeed] = useState(0);
  // seed only re-rolls the sample
  const sample = useMemo(() => (seed >= 0 ? pick(names, 6) : []), [names, seed]);

  return (
    <div className="names-editor">
      <div className="names-help">
        <strong>Paste your own unit names</strong>
        <ul className="muted small">
          <li>One name per line, as you'd want it shown in game (usually a surname, e.g. how vanilla shows <em>Kowalski</em> under a unit).</li>
          <li>A single comma-separated line works too. Bullets, numbering (&quot;1.&quot;, &quot;-&quot;), quotes and duplicates are cleaned up for you.</li>
          <li>
            Aim for {MIN_NAMES}+ names so they don&apos;t repeat (vanilla pools have 500–800); up to {MAX_NAMES.toLocaleString()}. Keep them short:
            about {MAX_NAME_LENGTH} characters fits the unit label.
          </li>
          <li>The game picks one at random for each unit you deploy. Semicolons and double quotes are removed (the dictionary format can&apos;t hold them).</li>
        </ul>
      </div>
      <textarea
        className="input names-textarea"
        value={value}
        placeholder={EXAMPLE}
        spellCheck={false}
        rows={10}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Unit names, one per line"
      />
      <div className="names-status">
        <span className={names.length >= MIN_NAMES ? "ok-text" : names.length ? "warn-text" : "muted"}>
          {names.length.toLocaleString()} name{names.length === 1 ? "" : "s"}
        </span>
        {duplicates > 0 && <span className="muted"> · {duplicates} duplicate{duplicates > 1 ? "s" : ""} skipped</span>}
        {tooLong.length > 0 && (
          <span className="warn-text" title={tooLong.slice(0, 10).join("\n")}>
            {" "}
            · {tooLong.length} longer than {MAX_NAME_LENGTH} characters (may be cut off)
          </span>
        )}
        {names.length > MAX_NAMES && <span className="err-text"> · too many (max {MAX_NAMES.toLocaleString()})</span>}
      </div>
      {sample.length > 0 && (
        <div className="names-sample">
          <span className="muted small">Random pick:</span>
          {sample.map((n) => (
            <span key={n} className="chip chip-sm">
              {n}
            </span>
          ))}
          <Button size="sm" onClick={() => setSeed((s) => s + 1)}>
            Shuffle
          </Button>
        </div>
      )}
    </div>
  );
}
