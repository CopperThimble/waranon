// Game artwork bundled with the app (flags, emblems, weapon and unit pictures).
// Swapped for gameArt.off.js when "gameArt" is false in waranon.config.json (see vite.config.js).

const glob = (modules) => modules;

export const flagModules = glob(import.meta.glob("/images/flags/*.png", { eager: true, import: "default", query: "?url" }));
export const emblemModules = glob(import.meta.glob("/images/divisions/*.png", { eager: true, import: "default", query: "?url" }));
export const weaponModules = glob(import.meta.glob("/images/weapons/*.png", { eager: true, import: "default", query: "?url" }));
// Unit portraits extracted from the game and converted to WebP (scripts/convert_portraits.py),
// laid out like GameData/Assets/2D/Interface/Common/UnitsIcons: images/portraits/NATO/M1A1_Abrams_US.webp
export const portraitModules = glob(import.meta.glob("/images/portraits/*/*.webp", { eager: true, import: "default", query: "?url" }));
// Specialty icons (roles, traits, abilities) and weapon trait icons, cropped from the game's
// UnitIcons-Spec and Traits atlases: images/specialties/hq.png, images/traits/HEAT.png
export const specialtyModules = glob(import.meta.glob("/images/specialties/*.png", { eager: true, import: "default", query: "?url" }));
export const traitModules = glob(import.meta.glob("/images/traits/*.png", { eager: true, import: "default", query: "?url" }));
