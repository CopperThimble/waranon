import { v4 as uuidv4 } from 'uuid' // or use crypto.randomUUID()

export function createDivisionFromBase(baseDivision, overrides, existingDivisions) {
  const newDivision = structuredClone(baseDivision)

  // --- Core identity ---
  newDivision.id = crypto.randomUUID()
  newDivision.descriptorId = crypto.randomUUID()

  // --- Apply overrides LAST ---
  Object.assign(newDivision, overrides)

  // --- Enforce required uniqueness ---
  newDivision.cfgName = makeUnique(
    newDivision.cfgName,
    existingDivisions.map(d => d.cfgName)
  )

  newDivision.divisionName = enforceTokenLength(newDivision.divisionName, 10)
  newDivision.summaryToken = enforceTokenLength(newDivision.summaryToken, 10)
  newDivision.historyToken = enforceTokenLength(newDivision.historyToken, 10)

  // --- Interface Order ---
  newDivision.interfaceOrder =
    Math.max(0, ...existingDivisions.map(d => d.interfaceOrder || 0)) + 1

  // --- Country Tag Injection ---
  if (newDivision.tags) {
    newDivision.tags.countryTag = newDivision.countryId
  }

  // --- Rename linked systems ---
  newDivision.divisionRules.id = generateRuleName(newDivision.cfgName)
  newDivision.costMatrix.id = generateCostMatrixName(newDivision.cfgName)

  return newDivision
}

// -------------------------
// NEW: parse divisions text into dropdown-friendly entries
// -------------------------
export function parseDivisionEntries(text) {
  if (!text || typeof text !== "string") return [];

  const entries = [];

  /**
   * This regex is a starter assumption.
   * You may need to tweak it to match the real structure
   * of your divisions.txt file.
   *
   * It assumes repeated division blocks somewhat like:
   * TDeckDivisionDescriptor SOME_ID { ... }
   */
  const blockRegex = /TDeckDivisionDescriptor\s+([A-Za-z0-9_]+)\s*\{([\s\S]*?)\}/g;

  let match;
  while ((match = blockRegex.exec(text)) !== null) {
    const rawId = match[1];
    const block = match[2];

    // Try a few likely field names for division display name
    const nameMatch =
      block.match(/DisplayName\s*=\s*"([^"]+)"/) ||
      block.match(/DivisionName\s*=\s*"([^"]+)"/) ||
      block.match(/Name\s*=\s*"([^"]+)"/);

    // Try a few likely field names for country reference
    const countryMatch =
      block.match(/Country\s*=\s*([A-Za-z0-9_]+)/) ||
      block.match(/CountryId\s*=\s*([A-Za-z0-9_]+)/) ||
      block.match(/Nationality\s*=\s*([A-Za-z0-9_]+)/) ||
      block.match(/MotherCountry\s*=\s*([A-Za-z0-9_]+)/);

    entries.push({
      id: rawId,
      name: nameMatch?.[1] || rawId,
      countryId: countryMatch?.[1] || "",
      rawBlock: block, // helpful later if you want to build from selected base division
    });
  }

  return entries;
}


//unique name generator

function makeUnique(base, existingList) {
  let name = base
  let i = 1

  while (existingList.includes(name)) {
    name = `${base}_${i}`
    i++
  }

  return name
}

//token length enforcer
function enforceTokenLength(value, length) {
  if (!value || value.length !== length) {
    throw new Error(`Token must be exactly ${length} characters`)
  }
  return value
}

//rule+matrixnaming
function generateRuleName(cfgName) {
  return `Descriptor_Deck_Division_${cfgName}_Rule`
}

function generateCostMatrixName(cfgName) {
  return `MatrixCostName_${cfgName}`
}
