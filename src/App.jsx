import { useEffect, useState } from "react";
import Credits from "./components/Credits";
import { loadGameData } from "./lib/gameData";
import AbilitiesPage from "./pages/AbilitiesPage";
import AlliancesPage from "./pages/AlliancesPage";
import BalancePage from "./pages/BalancePage";
import DivisionsPage from "./pages/DivisionsPage";
import ExportPage from "./pages/ExportPage";
import GalleryPage from "./pages/GalleryPage";
import NationsPage from "./pages/NationsPage";
import ProjectPage from "./pages/ProjectPage";
import UnitsPage from "./pages/UnitsPage";
import VoicesPage from "./pages/VoicesPage";
import { ProjectProvider } from "./state/ProjectContext";
import { useProject } from "./state/useProject";

const PAGES = [
  { id: "overview", label: "Overview", icon: "◎", component: ProjectPage },
  { id: "alliances", label: "Alliances", icon: "⚑", component: AlliancesPage, count: (p) => p.alliances.length },
  { id: "nations", label: "Nations", icon: "⚐", component: NationsPage, count: (p) => p.nations.length },
  { id: "units", label: "Units", icon: "▣", component: UnitsPage, count: (p) => p.units.length },
  { id: "abilities", label: "Abilities", icon: "✦", component: AbilitiesPage, count: (p) => (p.abilities || []).length },
  { id: "voices", label: "Voices", icon: "♪", component: VoicesPage, count: (p) => p.nations.reduce((n, x) => n + (x.voice?.clips?.length || 0), 0) },
  { id: "divisions", label: "Divisions", icon: "◆", component: DivisionsPage, count: (p) => p.divisions.length },
  { id: "balance", label: "Balance", icon: "⚖", component: BalancePage },
  { id: "export", label: "Export", icon: "⇩", component: ExportPage },
  { id: "gallery", label: "Gallery", icon: "▦", component: GalleryPage },
];

/** "#/units/<unitId>/weapons" -> { page: "units", id: "<unitId>", tab: "weapons" } */
const routeFromHash = () => {
  const [page, id, tab] = window.location.hash.replace(/^#\/?/, "").split("/").map(decodeURIComponent);
  return { page: PAGES.some((p) => p.id === page) ? page : "overview", id: id || null, tab: tab || null };
};

export default function App() {
  const [game, setGame] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadGameData().then(setGame, (err) => setError(err.message));
  }, []);

  if (error) return <div className="boot boot-error">Couldn't load game data: {error}</div>;
  if (!game) return <div className="boot">Loading WARNO game data…</div>;

  return (
    <ProjectProvider game={game}>
      <Shell />
    </ProjectProvider>
  );
}

function Shell() {
  const { project, saveState } = useProject();
  const [route, setRoute] = useState(routeFromHash);
  const page = route.page;

  useEffect(() => {
    const onHash = () => setRoute(routeFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  /** navigate("units") or navigate("units", { id, tab }) to open a specific item / tab. */
  const navigate = (id, { id: itemId, tab } = {}) => {
    const parts = [id, itemId, tab].filter(Boolean).map(encodeURIComponent);
    window.location.assign(`#/${parts.join("/")}`);
    window.scrollTo({ top: 0 });
  };
  const Page = PAGES.find((p) => p.id === page).component;

  return (
    <div className="shell">
      <nav className="sidebar">
        <div className="brand">
          <span className="brand-mark">W</span>
          <span>
            <span className="brand-name">Waranon</span>
            <span className="brand-sub">WARNO mod builder</span>
          </span>
        </div>
        <div className="sidebar-project" title={project.name}>
          {project.name}
          <SaveIndicator state={saveState} />
        </div>
        <ul className="nav">
          {PAGES.map((p) => (
            <li key={p.id}>
              <button type="button" className={page === p.id ? "active" : ""} onClick={() => navigate(p.id)}>
                <span className="nav-icon">{p.icon}</span>
                <span className="nav-label">{p.label}</span>
                {p.count && <span className="nav-count">{p.count(project)}</span>}
              </button>
            </li>
          ))}
        </ul>
        <Credits />
      </nav>
      <main className="main">
        <Page key={`${project.id}-${page}-${route.id || ""}-${route.tab || ""}`} navigate={navigate} route={route} />
      </main>
    </div>
  );
}

function SaveIndicator({ state }) {
  const label = { saved: "Saved", unsaved: "Saving…", saving: "Saving…", error: "Not saved!", loading: "" }[state];
  return <span className={`save save-${state}`}>{label}</span>;
}
