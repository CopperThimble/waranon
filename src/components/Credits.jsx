import config from "../../waranon.config.json";
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
