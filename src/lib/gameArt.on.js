// Game artwork bundled with the app (flags, emblems, weapon and unit pictures).
// Swapped for gameArt.off.js when "gameArt" is false in waranon.config.json (see vite.config.js).

const glob = (modules) => modules;

export const flagModules = glob(import.meta.glob("/images/flags/*.png", { eager: true, import: "default", query: "?url" }));
export const emblemModules = glob(import.meta.glob("/images/divisions/*.png", { eager: true, import: "default", query: "?url" }));
export const weaponModules = glob(import.meta.glob("/images/weapons/*.png", { eager: true, import: "default", query: "?url" }));
// Old portrait set, named after unit descriptors (Descriptor_Unit_X.png).
export const unitModules = glob(import.meta.glob("/images/units/*.png", { eager: true, import: "default", query: "?url" }));
// Portraits extracted from the game, laid out like GameData/Assets/2D/Interface/Common/UnitsIcons.
export const portraitModules = glob(import.meta.glob("/images/unit-icons/*/*.png", { eager: true, import: "default", query: "?url" }));
