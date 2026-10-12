import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ProjectContext } from "./useProject";
import { customRef, newId, newProject, normalizeProject } from "../lib/model";
import {
  deleteProject,
  getMeta,
  listProjects,
  projectFromFile,
  saveProject,
  setMeta,
} from "../lib/storage";

const summarize = (p) => ({ id: p.id, name: p.name, updatedAt: p.updatedAt });

export function ProjectProvider({ game, children }) {
  const [project, setProject] = useState(null);
  const [projects, setProjects] = useState([]);
  const [saveState, setSaveState] = useState("loading"); // loading | saved | unsaved | saving | error
  const latest = useRef(null);

  // Initial load: last active project, or a fresh one.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const all = await listProjects();
        const activeId = await getMeta("activeProjectId");
        let active = all.find((p) => p.id === activeId) || all.sort((a, b) => b.updatedAt - a.updatedAt)[0];
        if (!active) {
          active = newProject();
          await saveProject(active);
          all.push(active);
        }
        if (cancelled) return;
        setProjects(all.map(summarize));
        setProject(normalizeProject(active));
        setSaveState("saved");
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setProject(newProject());
          setSaveState("error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Debounced autosave.
  useEffect(() => {
    latest.current = project;
    if (saveState !== "unsaved" || !project) return;
    const timer = setTimeout(async () => {
      setSaveState("saving");
      try {
        await saveProject(project);
        await setMeta("activeProjectId", project.id);
        setProjects((list) => [...list.filter((p) => p.id !== project.id), summarize(project)]);
        setSaveState((s) => (s === "saving" ? "saved" : s));
      } catch (err) {
        console.error(err);
        setSaveState("error");
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [project, saveState]);

  const update = useCallback((recipe) => {
    setProject((p) => ({ ...recipe(p), updatedAt: Date.now() }));
    setSaveState("unsaved");
  }, []);

  const api = useMemo(() => {
    const patchItem = (collection, id, patch) =>
      update((p) => ({
        ...p,
        [collection]: p[collection].map((x) => (x.id === id ? { ...x, ...(typeof patch === "function" ? patch(x) : patch) } : x)),
      }));
    const addItem = (collection, item) => update((p) => ({ ...p, [collection]: [...p[collection], item] }));

    return {
      update,
      patchItem,
      addItem,
      removeItem(collection, id) {
        update((p) => {
          const next = { ...p, [collection]: p[collection].filter((x) => x.id !== id) };
          if (collection === "units") {
            // drop the unit from every roster and transport list
            const ref = customRef(id);
            next.divisions = p.divisions.map((d) => ({
              ...d,
              roster: d.roster
                .filter((r) => r.unit !== ref)
                .map((r) => ({ ...r, transports: (r.transports || []).filter((t) => t !== ref) })),
            }));
          }
          if (collection === "abilities") {
            next.units = p.units.map((u) =>
              u.abilities?.custom?.includes(id)
                ? { ...u, abilities: { ...u.abilities, custom: u.abilities.custom.filter((x) => x !== id) } }
                : u,
            );
          }
          if (collection === "alliances") {
            next.nations = p.nations.map((n) => (n.allianceId === id ? { ...n, allianceId: "NATO" } : n));
          }
          return next;
        });
      },
      /** Store an image Blob and return its id. */
      addAsset(blob, name) {
        const id = newId();
        update((p) => ({ ...p, assets: { ...p.assets, [id]: { blob, name, addedAt: Date.now() } } }));
        return id;
      },
      removeAsset(id) {
        if (!id) return;
        update((p) => {
          const assets = { ...p.assets };
          delete assets[id];
          return { ...p, assets };
        });
      },
      async switchProject(id) {
        if (latest.current) await saveProject(latest.current);
        const all = await listProjects();
        const p = all.find((x) => x.id === id);
        if (!p) return;
        await setMeta("activeProjectId", id);
        setProjects(all.map(summarize));
        setProject(normalizeProject(p));
        setSaveState("saved");
      },
      async createProject(name) {
        if (latest.current) await saveProject(latest.current);
        const p = newProject(name);
        await saveProject(p);
        await setMeta("activeProjectId", p.id);
        setProjects((list) => [...list, summarize(p)]);
        setProject(normalizeProject(p));
        setSaveState("saved");
      },
      async duplicateProject() {
        const src = latest.current;
        const p = { ...structuredClone(src), id: newId(), name: `${src.name} (copy)`, createdAt: Date.now(), updatedAt: Date.now() };
        await saveProject(src);
        await saveProject(p);
        await setMeta("activeProjectId", p.id);
        setProjects((list) => [...list, summarize(p)]);
        setProject(normalizeProject(p));
        setSaveState("saved");
      },
      async deleteCurrentProject() {
        const current = latest.current;
        await deleteProject(current.id);
        const rest = (await listProjects()).sort((a, b) => b.updatedAt - a.updatedAt);
        const next = rest[0] || newProject();
        if (!rest.length) await saveProject(next);
        await setMeta("activeProjectId", next.id);
        setProjects((rest.length ? rest : [next]).map(summarize));
        setProject(next);
        setSaveState("saved");
      },
      async importProject(file) {
        const imported = await projectFromFile(file);
        const p = { ...imported, id: newId(), updatedAt: Date.now() };
        if (latest.current) await saveProject(latest.current);
        await saveProject(p);
        await setMeta("activeProjectId", p.id);
        setProjects((list) => [...list, summarize(p)]);
        setProject(normalizeProject(p));
        setSaveState("saved");
      },
    };
  }, [update]);

  if (!project) return <div className="boot">Loading project…</div>;

  return (
    <ProjectContext.Provider value={{ game, project, projects, saveState, ...api }}>
      {children}
    </ProjectContext.Provider>
  );
}
