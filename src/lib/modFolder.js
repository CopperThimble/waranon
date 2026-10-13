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
    /** The file as a Blob (binary-safe, for backups), or null if it doesn't exist. */
    async readBlob(path) {
      try {
        return await (await fileHandle(path)).getFile();
      } catch {
        return null;
      }
    },
    async requestWrite() {
      return (await root.requestPermission({ mode: "readwrite" })) === "granted";
    },
    async deleteFile(path) {
      const parts = path.split("/");
      const name = parts.pop();
      try {
        await (await dirHandle(parts)).removeEntry(name);
      } catch {
        /* already gone */
      }
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

export const BACKUP_ROOT = "waranon-backups";

/**
 * Write export files into a writable source, backing up every file that will be overwritten to
 * waranon-backups/<stamp>/<same path> first, plus a README explaining how to undo.
 * Returns { backupDir, backedUp: [paths], created: [paths] }.
 */
export async function writeWithBackup(source, files, { stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19), onProgress, remove = [] } = {}) {
  const backupDir = `${BACKUP_ROOT}/${stamp}`;
  const backedUp = [];
  const created = [];
  const removed = [];
  onProgress?.("Backing up the files that will change…");
  // stale files from earlier exports: backed up like any other change, then deleted
  for (const path of remove) {
    const original = await source.readBlob(path);
    if (!original) continue;
    await source.writeFile(`${backupDir}/${path}`, original);
    backedUp.push(path);
    removed.push(path);
  }
  for (const f of files) {
    const original = await source.readBlob(f.path);
    if (original) {
      await source.writeFile(`${backupDir}/${f.path}`, original);
      backedUp.push(f.path);
    } else {
      created.push(f.path);
    }
  }
  await source.writeFile(`${backupDir}/README.txt`, backupReadme(stamp, backedUp, created));
  onProgress?.("Writing files…");
  for (const f of files) await source.writeFile(f.path, f.data);
  for (const path of removed) await source.deleteFile(path);
  return { backupDir, backedUp, created, removed };
}

function backupReadme(stamp, backedUp, created) {
  const lines = [
    `Waranon backup taken ${stamp} (UTC) before exporting into this mod folder.`,
    "",
    "To undo that export:",
    "  1. Copy everything in this folder (except this README) back into the mod folder, overwriting.",
  ];
  if (created.length) {
    lines.push("  2. Delete these files, which the export created (they did not exist before):");
    for (const p of created) lines.push(`       ${p}`);
  }
  lines.push("", `Backed-up originals (${backedUp.length}):`);
  for (const p of backedUp) lines.push(`  ${p}`);
  return `${lines.join("\r\n")}\r\n`;
}
