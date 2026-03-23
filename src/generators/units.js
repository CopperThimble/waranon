export function parseUnitEntries(text) {
  if (!text || typeof text !== "string") return [];

  const entries = [];

  const blockRegex =
    /export\s+([A-Za-z0-9_]+)\s+is\s+TEntityDescriptor\s*\(([\s\S]*?)\n\)/g;

  let match;
  while ((match = blockRegex.exec(text)) !== null) {
    const id = match[1];
    const block = match[2];

    const classNameMatch = block.match(/ClassNameForDebug\s*=\s*'([^']+)'/);
    const coalitionMatch = block.match(/Coalition\s*=\s*ECoalition\/([A-Z]+)/);
    const countryMatch = block.match(/MotherCountry\s*=\s*'([^']+)'/);
    const unitRoleMatch = block.match(/UnitRole\s*=\s*'([^']+)'/);
    const nameTokenMatch = block.match(/NameToken\s*=\s*'([^']+)'/);
    const buttonTextureMatch = block.match(/ButtonTexture\s*=\s*'([^']+)'/);
    const menuIconTextureMatch = block.match(/MenuIconTexture\s*=\s*'([^']+)'/);

    entries.push({
      id,
      className: classNameMatch?.[1] || "",
      coalition: coalitionMatch?.[1] || "",
      countryId: countryMatch?.[1] || "",
      unitRole: unitRoleMatch?.[1] || "",
      nameToken: nameTokenMatch?.[1] || "",
      buttonTexture: buttonTextureMatch?.[1] || "",
      menuIconTexture: menuIconTextureMatch?.[1] || "",
      rawBlock: block,
    });
  }

  return entries;
}

export function mapUnitRoleToCategory(unitRole) {
  const normalized = (unitRole || "").toUpperCase();

  switch (normalized) {
    case "LOG":
    case "SUPPORT":
    case "CV":
      return "log";

    case "INF":
    case "INFANTRY":
      return "inf";

    case "ART":
    case "ARTILLERY":
    case "MORTAR":
      return "art";

    case "TNK":
    case "TANK":
      return "tnk";

    case "REC":
    case "RECON":
      return "rec";

    case "AA":
    case "DCA":
    case "SAM":
      return "aa";

    case "HEL":
    case "HELO":
    case "HELICOPTER":
      return "hel";

    case "AIR":
    case "PLANE":
      return "air";

    default:
      return null;
  }
}