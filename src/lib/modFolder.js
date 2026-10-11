// Access to the user's WARNO mod *source* folder (created by Mods/CreateNewMod.bat).
// All sources expose: { name, kind, readText(path), listDir(path), canWrite, writeFile?(path, data) }

export const supportsDirectoryPicker = () => typeof window !== "undefined" && "showDirectoryPicker" in window;

/** Chromium: File System Access API — reads only the files we need, can write back. */
export async function pickModFolder() {
  const root = await window.showDirectoryPicker({ id: "warno-mod", mode: "read" });

  async function dirHandle(parts, create = false) {
    let dir = root;
    for (const p of parts) dir = await dir.getDirectoryHandle(p, { create });
    return dir;
  }
  async function fileHandle(path, create = false) {
    const parts = path.split("/");
    const name = parts.pop();
    const dir = await dirHandle(parts, create);
    return dir.getFileHandle(name, { create });
  }

  return {
    name: root.name,
    kind: "picker",
    canWrite: true,
    async readText(path) {
      try {
        return await (await (await fileHandle(path)).getFile()).text();
      } catch {
        return null;
      }
    },
    async listDir(path) {
      try {
        const dir = await dirHandle(path.split("/").filter(Boolean));
        const out = [];
        for await (const [name, h] of dir.entries()) out.push({ name, kind: h.kind });
        return out;
      } catch {
        return null;
      }
    },
    async requestWrite() {
      return (await root.requestPermission({ mode: "readwrite" })) === "granted";
    },
    async writeFile(path, data) {
      const h = await fileHandle(path, true);
      const w = await h.createWritable();
      await w.write(data);
      await w.close();
    },
  };
}

/** Firefox/Safari fallback: <input type="file" webkitdirectory>. Read-only. */
export function sourceFromFileList(fileList) {
  const files = new Map();
  let name = "";
  for (const f of fileList) {
    const parts = f.webkitRelativePath.split("/");
    name = parts[0];
    files.set(parts.slice(1).join("/").toLowerCase(), f);
  }
  return {
    name,
    kind: "upload",
    canWrite: false,
    async readText(path) {
      const f = files.get(path.toLowerCase());
      return f ? f.text() : null;
    },
    async listDir(path) {
      const depth = path.split("/").filter(Boolean).length;
      const prefix = `${path.toLowerCase().replace(/\/$/, "")}/`;
      const names = new Map();
      for (const [key, f] of files) {
        if (!key.startsWith(prefix)) continue;
        const parts = f.webkitRelativePath.split("/").slice(1); // drop the root folder
        const child = parts[depth];
        names.set(child.toLowerCase(), { name: child, kind: parts.length > depth + 1 ? "directory" : "file" });
      }
      return [...names.values()];
    },
  };
}

/** Dev server only: serves SampleMods/modexample through a Vite middleware. */
export function devSampleSource() {
  const base = "/__modexample/";
  return {
    name: "modexample",
    kind: "dev",
    canWrite: false,
    async readText(path) {
      const res = await fetch(base + path.split("/").map(encodeURIComponent).join("/"));
      return res.ok ? res.text() : null;
    },
    async listDir(path) {
      const res = await fetch(`${base + path}?list=1`);
      return res.ok ? res.json() : null;
    },
  };
}
