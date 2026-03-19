function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function sanitizeCountryTag(value) {
  return value.replace(/[^A-Za-z0-9_]/g, "").toUpperCase();
}

export function buildNameToken(countryTag) {
  return `Ctr${countryTag}`;
}

export function buildFlagTextureToken(countryTag) {
  return `CommonTexture_MotherCountryFlag_${countryTag}`;
}

export function buildFlagFileName(countryTag) {
  return `${countryTag}_FLAG.png`;
}

export function buildUnitNamesFile({ countryTag, unitToken }) {
  return `unnamed TUnitNameNationToDicoToken
(
    Nation = "${countryTag}"
    DicoToken = "${unitToken}"
)
`;
}

export function buildInterfaceCsv({ countryTag, countryName, nameToken }) {
  const token = nameToken || buildNameToken(countryTag);

  return `"TOKEN";"REFTEXT"
"${token}";"${countryName}"
`;
}

export function parseCountriesInfoEntries(fileText) {
  const regex =
    /\("([A-Z0-9_]+)",\s*TUISpecificCountryInfos\s*\(\s*FlagTexture\s*=\s*"([^"]+)"\s*Country\s*=\s*"([^"]+)"\s*NameToken\s*=\s*"([^"]+)"\s*Coalition\s*=\s*ECoalition\/([A-Z]+)\s*\)\s*\)/g;

  const results = [];
  let match;

  while ((match = regex.exec(fileText)) !== null) {
    results.push({
      tag: match[1],
      flagTextureToken: match[2],
      country: match[3],
      nameToken: match[4],
      coalition: match[5],
    });
  }

  return results;
}

export function parseTextureEntries(fileText) {
  const regex =
    /\("([^"]+)",\s*MAP\s*\[\(~\/ComponentState\/Normal,\s*TUIResourceTexture_Common\(FileName\s*=\s*"([^"]+)"\)\)\]\)/g;

  const results = [];
  let match;

  while ((match = regex.exec(fileText)) !== null) {
    results.push({
      textureToken: match[1],
      fileName: match[2],
    });
  }

  return results;
}

export function parseTextFormatEntries(fileText) {
  const regex =
    /\(\s*"([A-Z0-9_]+)",\s*TemplateTFS_Flag\(TextureToken\s*=\s*"([^"]+)"\)\s*\)/g;

  const results = [];
  let match;

  while ((match = regex.exec(fileText)) !== null) {
    results.push({
      tag: match[1],
      textureToken: match[2],
    });
  }

  return results;
}

export function getCountryTemplate(fileText, baseCountryTag) {
  const tag = sanitizeCountryTag(baseCountryTag);

  const countryInfo = parseCountriesInfoEntries(fileText).find((x) => x.tag === tag);
  const textureInfo = parseTextureEntries(fileText).find(
    (x) => x.textureToken === countryInfo?.flagTextureToken
  );
  const textFormatInfo = parseTextFormatEntries(fileText).find((x) => x.tag === tag);

  if (!countryInfo) {
    throw new Error(`Base country "${tag}" was not found in CountriesInfos.`);
  }

  return {
    baseCountryTag: tag,
    coalition: countryInfo.coalition,
    baseNameToken: countryInfo.nameToken,
    baseFlagTextureToken: countryInfo.flagTextureToken,
    baseFlagFileName: textureInfo?.fileName || null,
    hasTextFormatEntry: Boolean(textFormatInfo),
  };
}

export function buildCountriesInfoEntry({
  countryTag,
  coalition,
  nameToken,
  flagTextureToken,
}) {
  return `        ("${countryTag}", TUISpecificCountryInfos
            (
                FlagTexture = "${flagTextureToken}"
                Country = "${countryTag}"
                NameToken = "${nameToken}"
                Coalition = ECoalition/${coalition}
            )
        ),`;
}

export function buildTextureEntry({
  flagTextureToken,
  flagFileName,
}) {
  return `        ("${flagTextureToken}",  MAP [(~/ComponentState/Normal, TUIResourceTexture_Common(FileName = "GameData:/Assets/2D/Interface/Common/Flags/${flagFileName}"))]),`;
}

export function buildTextFormatEntry({
  countryTag,
  flagTextureToken,
}) {
  return `    (
        "${countryTag}",
        TemplateTFS_Flag(TextureToken = "${flagTextureToken}")
    ),`;
}

/**
 * Inserts a new line before the closing ] of a MAP block.
 */
function appendEntryToNamedMap(fileText, mapHeaderText, entryText) {
  const startIndex = fileText.indexOf(mapHeaderText);
  if (startIndex === -1) {
    throw new Error(`Could not find section header: ${mapHeaderText}`);
  }

  const bracketStart = fileText.indexOf("[", startIndex);
  if (bracketStart === -1) {
    throw new Error(`Could not find [ for section: ${mapHeaderText}`);
  }

  let depth = 0;
  let closingIndex = -1;

  for (let i = bracketStart; i < fileText.length; i++) {
    const char = fileText[i];
    if (char === "[") depth++;
    if (char === "]") {
      depth--;
      if (depth === 0) {
        closingIndex = i;
        break;
      }
    }
  }

  if (closingIndex === -1) {
    throw new Error(`Could not find closing ] for section: ${mapHeaderText}`);
  }

  const before = fileText.slice(0, closingIndex);
  const after = fileText.slice(closingIndex);

  return `${before}${entryText}\n${after}`;
}

export function appendCountryInfoEntry(fileText, entryText) {
  return appendEntryToNamedMap(fileText, "CountriesInfos = MAP", entryText);
}

export function appendTextureEntry(fileText, entryText) {
  return appendEntryToNamedMap(fileText, "Textures = MAP", entryText);
}

export function appendTextFormatEntry(fileText, entryText) {
  return appendEntryToNamedMap(fileText, "CountriesTextFormatScriptMap is MAP", entryText);
}

export function generateNewCountryData({
  fileText,
  baseCountryTag,
  newCountryTag,
  newCountryName,
  unitToken,
  useCustomFlag = false,
  customFlagFileName = null,
  addTextFormatEntry = true,
}) {
  const template = getCountryTemplate(fileText, baseCountryTag);
  const countryTag = sanitizeCountryTag(newCountryTag);
  const nameToken = buildNameToken(countryTag);

  const flagTextureToken = useCustomFlag
    ? buildFlagTextureToken(countryTag)
    : template.baseFlagTextureToken;

  const flagFileName = useCustomFlag
    ? customFlagFileName || buildFlagFileName(countryTag)
    : template.baseFlagFileName;

  const countriesInfoEntry = buildCountriesInfoEntry({
    countryTag,
    coalition: template.coalition,
    nameToken,
    flagTextureToken,
  });

  const textureEntry =
    useCustomFlag && flagFileName
      ? buildTextureEntry({
          flagTextureToken,
          flagFileName: flagFileName.split("/").pop(),
        })
      : null;

  const textFormatEntry = addTextFormatEntry
    ? buildTextFormatEntry({
        countryTag,
        flagTextureToken,
      })
    : null;

  const unitNamesFile = buildUnitNamesFile({
    countryTag,
    unitToken,
  });

  const interfaceCsv = buildInterfaceCsv({
    countryTag,
    countryName: newCountryName,
    nameToken,
  });

  return {
    template,
    countryTag,
    countryName: newCountryName,
    nameToken,
    unitToken,
    flagTextureToken,
    flagFileName,
    countriesInfoEntry,
    textureEntry,
    textFormatEntry,
    unitNamesFile,
    interfaceCsv,
  };
}

export function applyNewCountryToUiSpecificCountriesFile(fileText, generated) {
  let updated = fileText;

  updated = appendCountryInfoEntry(updated, generated.countriesInfoEntry);

  if (generated.textureEntry) {
    updated = appendTextureEntry(updated, generated.textureEntry);
  }

  if (generated.textFormatEntry) {
    updated = appendTextFormatEntry(updated, generated.textFormatEntry);
  }

  return updated;
}