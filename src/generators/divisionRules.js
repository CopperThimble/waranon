export function parseDivisionRuleEntries(text) {
  if (!text || typeof text !== "string") return [];

  const entries = [];

  const blockRegex =
    /([A-Za-z0-9_]+)\s+is\s+TDeckDivisionRule\s*\(([\s\S]*?)\n\)/g;

  let match;
  while ((match = blockRegex.exec(text)) !== null) {
    const id = match[1];
    const block = match[2];

    const unitIds = [
      ...block.matchAll(/UnitDescriptor\s*=\s*\$\/GFX\/Unit\/([A-Za-z0-9_]+)/g),
    ].map((m) => m[1]);

    entries.push({
      id,
      unitIds,
      rawBlock: block,
    });
  }

  return entries;
}