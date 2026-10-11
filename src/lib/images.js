// Image helpers: vanilla art lookups (bundled /images) and user uploads.

const flagUrls = indexGlob(import.meta.glob("/images/flags/*.png", { eager: true, import: "default", query: "?url" }));
const emblemUrls = indexGlob(import.meta.glob("/images/divisions/*.png", { eager: true, import: "default", query: "?url" }));
const weaponUrls = indexGlob(import.meta.glob("/images/weapons/*.png", { eager: true, import: "default", query: "?url" }));
const unitUrls = indexGlob(import.meta.glob("/images/units/*.png", { eager: true, import: "default", query: "?url" }));

function indexGlob(modules) {
  const out = {};
  for (const [path, url] of Object.entries(modules)) {
    out[path.split("/").pop().replace(/\.png$/i, "").toLowerCase()] = url;
  }
  return out;
}

// The bundled /images/flags set names East Germany "RDA" (its French abbreviation).
const FLAG_ALIASES = { DDR: "RDA" };

export function vanillaFlagUrl(country) {
  if (!country) return null;
  const file = (country.flagFile || `${country.tag}_FLAG`).replace(/\.png$/i, "").toLowerCase();
  const alias = FLAG_ALIASES[country.tag];
  return flagUrls[file] || flagUrls[`${country.tag}_flag`.toLowerCase()] || (alias && flagUrls[`${alias}_flag`.toLowerCase()]) || null;
}

export function vanillaEmblemUrl(divisionId) {
  return divisionId ? emblemUrls[divisionId.toLowerCase()] || null : null;
}

/** Weapon panel picture by the file basename from WeaponTextures.ndf (game.weaponIcons). */
export function vanillaWeaponUrl(fileBase) {
  return fileBase ? weaponUrls[fileBase.toLowerCase()] || null : null;
}

export function vanillaUnitUrl(unitId) {
  return unitId ? unitUrls[unitId.toLowerCase()] || null : null;
}

// Object URLs for stored Blobs. Cached per Blob and never revoked: blobs are few
// and small, and revoking breaks React StrictMode's double-mounted effects.
const blobUrls = new WeakMap();
export function blobUrl(blob) {
  if (!blob) return null;
  let url = blobUrls.get(blob);
  if (!url) {
    url = URL.createObjectURL(blob);
    blobUrls.set(blob, url);
  }
  return url;
}

/** Sizes the game uses for each kind of upload. */
export const IMAGE_SPECS = {
  flag: { width: 640, height: 384, fit: "cover", label: "Flag (640×384)" },
  emblem: { width: 512, height: 512, fit: "contain", label: "Emblem (512×512, transparent)" },
  unitIcon: { width: 360, height: 184, fit: "contain", label: "Unit icon (360×184, transparent)" },
  abilityIcon: { width: 128, height: 128, fit: "contain", label: "Ability icon (128×128, transparent)" },
};

/** Decode any browser-supported image and re-encode it as a PNG of the given size. */
export async function fileToPng(file, { width, height, fit }) {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  const scale = fit === "cover"
    ? Math.max(width / bitmap.width, height / bitmap.height)
    : Math.min(width / bitmap.width, height / bitmap.height);
  const w = bitmap.width * scale;
  const h = bitmap.height * scale;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, (width - w) / 2, (height - h) / 2, w, h);
  bitmap.close?.();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG encoding failed"))), "image/png"),
  );
}
