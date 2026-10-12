// Checks "Write into folder": every overwritten file is backed up first, and restoring the backup undoes the export.
//   node scripts/test-write-backup.mjs
import { BACKUP_ROOT, writeWithBackup } from "../src/lib/modFolder.js";

let failed = 0;
const check = (ok, msg) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${msg}`);
  if (!ok) failed++;
};

// In-memory stand-in for the picked mod folder (same interface as pickModFolder's source).
const disk = new Map([
  ["GameData/Generated/Gameplay/Gfx/UniteDescriptor.ndf", new Blob(["original units\r\n"])],
  ["GameData/Assets/2D/Interface/Common/Flags/RUR_FLAG.png", new Blob([new Uint8Array([137, 80, 78, 71, 0, 255, 1])])],
]);
const before = new Map(disk);
const source = {
  canWrite: true,
  readBlob: async (p) => disk.get(p) || null,
  writeFile: async (p, data) => disk.set(p, data instanceof Blob ? data : new Blob([data])),
};
const bytes = async (blob) => Buffer.from(await blob.arrayBuffer()).toString("hex");

const files = [
  { path: "GameData/Generated/Gameplay/Gfx/UniteDescriptor.ndf", data: "patched units\r\n" },
  { path: "GameData/Assets/2D/Interface/Common/Flags/RUR_FLAG.png", data: new Blob([new Uint8Array([1, 2, 3])]) },
  { path: "GameData/Generated/Gameplay/Gfx/UnitNames/UnitNames_RUR.ndf", data: "new file" },
];
const res = await writeWithBackup(source, files, { stamp: "2026-10-12T10-00-00" });

check(res.backupDir === `${BACKUP_ROOT}/2026-10-12T10-00-00`, `backup folder ${res.backupDir}`);
check(res.backedUp.length === 2 && res.created.length === 1, "2 originals backed up, 1 new file recorded as created");
for (const p of res.backedUp) {
  check((await bytes(disk.get(`${res.backupDir}/${p}`))) === (await bytes(before.get(p))), `backup of ${p.split("/").pop()} is byte-identical (text and binary)`);
}
check((await disk.get(files[0].path).text()) === "patched units\r\n", "export written after the backup");
const readme = await disk.get(`${res.backupDir}/README.txt`).text();
check(readme.includes("To undo") && readme.includes("UnitNames_RUR.ndf"), "README explains the undo and lists the created file");

// Undo: copy the backup back and delete created files -> folder is exactly as before
for (const p of res.backedUp) disk.set(p, disk.get(`${res.backupDir}/${p}`));
for (const p of res.created) disk.delete(p);
let same = true;
for (const [p, blob] of before) if ((await bytes(disk.get(p))) !== (await bytes(blob))) same = false;
const extra = [...disk.keys()].filter((p) => !before.has(p) && !p.startsWith(BACKUP_ROOT));
check(same && extra.length === 0, "restoring the backup returns the folder to its original state");

console.log(failed ? `${failed} check(s) failed` : "all checks passed");
process.exit(failed ? 1 : 0);
