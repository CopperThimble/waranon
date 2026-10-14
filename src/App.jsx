import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Credits from "./components/Credits";
import MapControl from "./components/MapControl";
import NavIcon from "./components/NavIcon";
import TopoBackdrop from "./components/TopoBackdrop";
import { loadGameData } from "./lib/gameData";
import { useTopo } from "./lib/topo";
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
  { id: "overview", label: "Overview", component: ProjectPage },
  { id: "alliances", label: "Alliances", component: AlliancesPage, count: (p) => p.alliances.length },
  { id: "nations", label: "Nations", component: NationsPage, count: (p) => p.nations.length },
  { id: "units", label: "Units", component: UnitsPage, count: (p) => p.units.length },
  { id: "abilities", label: "Abilities", component: AbilitiesPage, count: (p) => (p.abilities || []).length },
  { id: "voices", label: "Voices", component: VoicesPage, count: (p) => p.nations.reduce((n, x) => n + (x.voice?.clips?.length || 0), 0) },
  { id: "divisions", label: "Divisions", component: DivisionsPage, count: (p) => p.divisions.length },
  { id: "balance", label: "Balance", component: BalancePage },
  { id: "export", label: "Export", component: ExportPage },
  { id: "gallery", label: "Gallery", component: GalleryPage },
];

// Refined interface: the same pages, grouped by what you're doing.
const NAV_GROUPS = [
  { title: null, pages: ["overview"] },
  { title: "Build", pages: ["alliances", "nations", "units", "abilities", "voices", "divisions"] },
  { title: "Insight", pages: ["balance", "gallery"] },
  { title: "Ship", pages: ["export"] },
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
  const topo = useTopo(true);
  const [exploring, setExploring] = useState(false);
  const exploreOn = exploring && topo.settings.show;
  useEffect(() => {
    if (exploreOn) document.documentElement.dataset.explore = "on";
    else delete document.documentElement.dataset.explore;
  }, [exploreOn]);
  /** step through the maps while exploring (pins the one you land on) */
  const stepMap = (dir) => {
    const list = topo.regions;
    const i = Math.max(0, list.findIndex((r) => r.id === topo.current?.id));
    topo.update({ pinned: list[(i + dir + list.length) % list.length].id });
  };
  const [route, setRoute] = useState(routeFromHash);
  const page = route.page;
  const navRef = useRef(null);
  const [marker, setMarker] = useState(null);

  // one marker slides to the active page instead of the highlight jumping
  useLayoutEffect(() => {
    const place = () => {
      const box = navRef.current;
      const active = box?.querySelector("button.active");
      if (!box || !active) return setMarker(null);
      const b = box.getBoundingClientRect();
      const a = active.getBoundingClientRect();
      setMarker({ y: a.top - b.top + box.scrollTop, h: a.height });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [page]);

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
      {topo.settings.show && (
        <TopoBackdrop
          region={topo.region}
          shift={page}
          strength={topo.settings.strength}
          explore={exploreOn}
          onExit={() => setExploring(false)}
          onNext={() => stepMap(1)}
          onPrev={() => stepMap(-1)}
        />
      )}
      <MapControl topo={topo} onExplore={() => setExploring(true)} />
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
        <div className="nav-groups" ref={navRef}>
            {marker && <span className="nav-marker" style={{ transform: `translateY(${marker.y}px)`, height: marker.h }} aria-hidden="true" />}
            {NAV_GROUPS.map((g) => (
              <div key={g.title || "top"} className="nav-group">
                {g.title && <div className="nav-group-title">{g.title}</div>}
                <ul className="nav">
                  {g.pages.map((id) => {
                    const p = PAGES.find((x) => x.id === id);
                    const n = p.count?.(project) || 0;
                    return (
                      <li key={p.id}>
                        <button type="button" className={page === p.id ? "active" : ""} aria-current={page === p.id ? "page" : undefined} onClick={() => navigate(p.id)}>
                          <span className="nav-icon">
                            <NavIcon name={p.id} />
                          </span>
                          <span className="nav-label">{p.label}</span>
                          {n > 0 && <span className="nav-count">{n}</span>}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
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
  // keyed by state so each completed save replays the Field stamp
  return (
    <span key={state} className={`save save-${state}`}>
      {label}
    </span>
  );
}
