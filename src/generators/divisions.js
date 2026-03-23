export function createDivisionFromBase(
  baseDivision,
  overrides,
  existingDivisions,
) {
  const newDivision = structuredClone(baseDivision);

  // --- Core identity ---
  newDivision.id = crypto.randomUUID();
  newDivision.descriptorId = crypto.randomUUID();

  // --- Apply overrides LAST ---
  Object.assign(newDivision, overrides);

  // --- Enforce required uniqueness ---
  newDivision.cfgName = makeUnique(
    newDivision.cfgName,
    existingDivisions.map((d) => d.cfgName),
  );

  newDivision.divisionName = enforceTokenLength(newDivision.divisionName, 10);
  newDivision.summaryToken = enforceTokenLength(newDivision.summaryToken, 10);
  newDivision.historyToken = enforceTokenLength(newDivision.historyToken, 10);

  // --- Interface Order ---
  newDivision.interfaceOrder =
    Math.max(0, ...existingDivisions.map((d) => d.interfaceOrder || 0)) + 1;

  // --- Country Tag Injection ---
  if (newDivision.tags) {
    newDivision.tags.countryTag = newDivision.countryId;
  }

  // --- Rename linked systems ---
  newDivision.divisionRules.id = generateRuleName(newDivision.cfgName);
  newDivision.costMatrix.id = generateCostMatrixName(newDivision.cfgName);

  return newDivision;
}

// -------------------------
// NEW: parse divisions text into dropdown-friendly entries
// -------------------------
export function parseDivisionEntries(text) {
  if (!text || typeof text !== "string") return [];

  const entries = [];
  const divisionRuleMatch = block.match(/DivisionRule\s*=\s*([A-Za-z0-9_]+)/);
  const costMatrixMatch = block.match(/CostMatrix\s*=\s*([A-Za-z0-9_]+)/);
  const emblemTextureMatch = block.match(/EmblemTexture\s*=\s*"([^"]+)"/);

  const blockRegex =
    /export\s+([A-Za-z0-9_]+)\s+is\s+TDeckDivisionDescriptor\s*\(([\s\S]*?)\n\)/g;

  let match;
  while ((match = blockRegex.exec(text)) !== null) {
    const exportName = match[1];
    const block = match[2];

    const cfgNameMatch = block.match(/CfgName\s*=\s*'([^']+)'/);
    const divisionNameMatch = block.match(/DivisionName\s*=\s*'([^']+)'/);
    const coalitionMatch = block.match(
      /DivisionCoalition\s*=\s*ECoalition\/([A-Z]+)/,
    );
    const countryMatch = block.match(/CountryId\s*=\s*"([^"]+)"/);
    const typeTokenMatch = block.match(/TypeToken\s*=\s*"([^"]+)"/);
    const summaryTextTokenMatch = block.match(
      /SummaryTextToken\s*=\s*"([^"]+)"/,
    );
    const historyTextTokenMatch = block.match(
      /HistoryTextToken\s*=\s*"([^"]+)"/,
    );
    const interfaceOrderMatch = block.match(/InterfaceOrder\s*=\s*([0-9.]+)/);

    entries.push({
      id: exportName,
      exportName,
      cfgName: cfgNameMatch?.[1] || "",
      divisionNameToken: divisionNameMatch?.[1] || "",
      coalition: coalitionMatch?.[1] || "",
      countryId: countryMatch?.[1] || "",
      typeToken: typeTokenMatch?.[1] || "",
      summaryTextToken: summaryTextTokenMatch?.[1] || "",
      historyTextToken: historyTextTokenMatch?.[1] || "",
      interfaceOrder: interfaceOrderMatch
        ? Number(interfaceOrderMatch[1])
        : null,
      divisionRule: divisionRuleMatch?.[1] || "",
      costMatrix: costMatrixMatch?.[1] || "",
      emblemTexture: emblemTextureMatch?.[1] || "",
      rawBlock: block,
    });
  }

  return entries;
}

//unique name generator

function makeUnique(base, existingList) {
  let name = base;
  let i = 1;

  while (existingList.includes(name)) {
    name = `${base}_${i}`;
    i++;
  }

  return name;
}

//slug identifier builder

function sanitizeDivisionName(value) {
  return value
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}

//name builder
export function buildDivisionExportName({ countryId, cfgName }) {
  return `Descriptor_Deck_Division_${cfgName}`;
}

export function getNextInterfaceOrder(divisions) {
  return Math.max(0, ...divisions.map((d) => d.interfaceOrder || 0)) + 1;
}

//token length enforcer
function enforceTokenLength(value, length) {
  if (!value || value.length !== length) {
    throw new Error(`Token must be exactly ${length} characters`);
  }
  return value;
}

//token generator

export function generateTenCharToken(prefix = "") {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = prefix;

  while (result.length < 10) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }

  return result.slice(0, 10);
}

//rule+matrixnaming
function generateRuleName(cfgName) {
  return `Descriptor_Deck_Division_${cfgName}_Rule`;
}

function generateCostMatrixName(cfgName) {
  return `MatrixCostName_${cfgName}`;
}

//enforce unique token
function makeUniqueToken(baseToken, usedTokens) {
  let token = baseToken;
  let i = 0;

  while (usedTokens.includes(token)) {
    const suffix = String(i).padStart(2, "0");
    token = `${baseToken.slice(0, 8)}${suffix}`.slice(0, 10);
    i += 1;
  }

  return token;
}
