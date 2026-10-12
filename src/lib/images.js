// Image helpers: vanilla art lookups (bundled /images) and user uploads.
// "game-art" is aliased in vite.config.js to gameArt.on.js or gameArt.off.js, driven by
// "gameArt" in waranon.config.json, so switching it off leaves no game art in the build.
import { emblemModules, flagModules, portraitModules, unitModules, weaponModules } from "game-art";

export const gameArtEnabled = import.meta.env.VITE_GAME_ART !== "off";

const flagUrls = indexGlob(flagModules);
const emblemUrls = indexGlob(emblemModules);
const weaponUrls = indexGlob(weaponModules);
// Old portrait set, named after unit descriptors (Descriptor_Unit_X.png). Covers ~57% of units.
const unitUrls = indexGlob(unitModules);
// Extracted portraits: images/unit-icons/NATO/M1A1_Abrams_US.png, keyed "nato/m1a1_abrams_us" to match unit.portrait.
const portraitUrls = indexByPath(portraitModules, "/images/unit-icons/");

/** Every extracted portrait: { path: "NATO/M1A1_Abrams_US", side: "NATO", name: "M1A1_Abrams_US", url }. Empty if not extracted. */
export const allPortraits = Object.entries(portraitModules)
  .map(([file, url]) => {
    const path = file.slice("/images/unit-icons/".length).replace(/\.png$/i, "");
    const [side, name] = path.split("/");
    return { path, side, name, url };
  })
  .sort((a, b) => a.name.localeCompare(b.name));

function indexGlob(modules) {
  const out = {};
  for (const [path, url] of Object.entries(modules)) {
    out[path.split("/").pop().replace(/\.png$/i, "").toLowerCase()] = url;
  }
  return out;
}

function indexByPath(modules, prefix) {
  const out = {};
  for (const [path, url] of Object.entries(modules)) {
    out[path.slice(prefix.length).replace(/\.png$/i, "").toLowerCase()] = url;
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

/**
 * Portrait for a vanilla unit: the game's own icon (via its button texture, unit.portrait),
 * falling back to the older descriptor-named set if the extracted icons aren't present.
 */
export function vanillaUnitUrl(unit) {
  if (!unit) return null;
  return (unit.portrait && portraitUrls[unit.portrait.toLowerCase()]) || unitUrls[unit.id.toLowerCase()] || null;
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
