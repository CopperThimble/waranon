import config from "../../waranon.config.json";
import { analyticsEnabled } from "../lib/analytics";
import { gameArtEnabled } from "../lib/images";

/** Attribution + contact, shown on every page. */
export default function Credits({ collapsible = false, terrain = false }) {
  const contact = config.contact;
  const body = (
    <>
      <p>
        Fan-made, free tool. Not affiliated with or endorsed by Eugen Systems.
        {gameArtEnabled ? " WARNO game data and unit artwork © Eugen Systems." : " WARNO game data © Eugen Systems."}
      </p>
      <p>
        Privacy: your projects are saved only in this browser, and mod files are read and written on your computer only. Nothing you build is
        uploaded. No cookies or tracking
        {analyticsEnabled ? "; we count anonymous page views (no cookies, no personal data)." : "."}
      </p>
      {terrain && (
        <p>
          Map backdrop: elevation from the{" "}
          <a href="https://registry.opendata.aws/terrain-tiles/" target="_blank" rel="noreferrer">
            AWS Terrain Tiles
          </a>{" "}
          open dataset (NASA SRTM and others), drawn as contours by this app.
        </p>
      )}
      {contact?.url && (
        <p>
          Questions, issues or takedown requests:{" "}
          <a href={contact.url} target="_blank" rel="noreferrer">
            {contact.label || contact.url}
          </a>
        </p>
      )}
    </>
  );
  // refined interface: same text, folded away under one line so the sidebar stays calm
  if (collapsible) {
    return (
      <footer className="credits">
        <details>
          <summary>About &amp; privacy</summary>
          {body}
        </details>
      </footer>
    );
  }
  return <footer className="credits">{body}</footer>;
}
