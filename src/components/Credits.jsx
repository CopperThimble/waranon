import config from "../../waranon.config.json";
import { analyticsEnabled } from "../lib/analytics";
import { gameArtEnabled } from "../lib/images";

/** Attribution + contact, shown on every page. */
export default function Credits() {
  const contact = config.contact;
  return (
    <footer className="credits">
      <p>
        Fan-made, free tool. Not affiliated with or endorsed by Eugen Systems.
        {gameArtEnabled ? " WARNO game data and unit artwork © Eugen Systems." : " WARNO game data © Eugen Systems."}
      </p>
      <p>
        Privacy: your projects are saved only in this browser, and mod files are read and written on your computer only. Nothing you build is
        uploaded. No cookies or tracking
        {analyticsEnabled ? "; we count anonymous page views (no cookies, no personal data)." : "."}
      </p>
      {contact?.url && (
        <p>
          Questions, issues or takedown requests:{" "}
          <a href={contact.url} target="_blank" rel="noreferrer">
            {contact.label || contact.url}
          </a>
        </p>
      )}
    </footer>
  );
}
