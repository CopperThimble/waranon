// Project persistence in IndexedDB. Projects are stored whole (images as Blobs),
// so nothing has to be re-uploaded between sessions.

const DB_NAME = "waranon";
const DB_VERSION = 1;

let dbPromise = null;

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("projects")) db.createObjectStore("projects", { keyPath: "id" });
        if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta");
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

async function tx(store, mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const result = fn(t.objectStore(store));
    t.oncomplete = () => resolve(result?.result ?? result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export const listProjects = () => tx("projects", "readonly", (s) => s.getAll());
export const getProject = (id) => tx("projects", "readonly", (s) => s.get(id));
export const saveProject = (project) => tx("projects", "readwrite", (s) => s.put(project));
export const deleteProject = (id) => tx("projects", "readwrite", (s) => s.delete(id));
export const getMeta = (key) => tx("meta", "readonly", (s) => s.get(key));
export const setMeta = (key, value) => tx("meta", "readwrite", (s) => s.put(value, key));

// ── Project files (.waranon.json) ────────────────────────────────────────────
// Portable backup: images are inlined as data URLs.

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export async function projectToFile(project) {
  const assets = {};
  for (const [id, a] of Object.entries(project.assets || {})) {
    assets[id] = { ...a, blob: undefined, dataUrl: await blobToDataUrl(a.blob) };
  }
  const json = JSON.stringify({ format: "waranon-project", version: 1, project: { ...project, assets } }, null, 1);
  return new Blob([json], { type: "application/json" });
}

export async function projectFromFile(file) {
  const parsed = JSON.parse(await file.text());
  if (parsed?.format !== "waranon-project") throw new Error("Not a Waranon project file.");
  const project = parsed.project;
  const assets = {};
  for (const [id, a] of Object.entries(project.assets || {})) {
    const blob = await (await fetch(a.dataUrl)).blob();
    assets[id] = { ...a, dataUrl: undefined, blob };
  }
  return { ...project, assets };
}
