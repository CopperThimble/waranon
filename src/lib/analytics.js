// Optional, cookieless page-view counting via GoatCounter (https://www.goatcounter.com).
// Off unless "analytics.goatcounter" is set in waranon.config.json, and never on localhost/dev builds.
// GoatCounter counts page loads only: no cookies, no personal data, no cross-site tracking.
import config from "../../waranon.config.json";

const code = String(config.analytics?.goatcounter || "").trim();

export const analyticsEnabled = import.meta.env.PROD && /^[a-z0-9-]+$/i.test(code);

export function startAnalytics() {
  if (!analyticsEnabled) return;
  const script = document.createElement("script");
  script.async = true;
  script.src = "https://gc.zgo.at/count.js";
  script.dataset.goatcounter = `https://${code}.goatcounter.com/count`;
  document.head.appendChild(script);
}
