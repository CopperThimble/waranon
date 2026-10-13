import { useEffect, useState } from "react";

// "classic" (the original look), "refined" (polish pass) or "field" (refined + the map-desk layer).
// Kept per browser so all stay available. Refined styles live in src/refined.css under
// :root[data-ui="refined"]; Field adds src/field.css under :root[data-flair="field"].
const KEY = "waranon-ui";
const VERSIONS = ["classic", "refined", "field"];

function initial() {
  try {
    const v = localStorage.getItem(KEY);
    return VERSIONS.includes(v) ? v : "classic";
  } catch {
    return "classic";
  }
}

export function useUiVersion() {
  const [version, setVersion] = useState(initial);
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.ui = version === "classic" ? "classic" : "refined";
    if (version === "field") root.dataset.flair = "field";
    else delete root.dataset.flair;
    try {
      localStorage.setItem(KEY, version);
    } catch {
      /* private mode: just don't remember */
    }
  }, [version]);
  return [version, setVersion];
}
