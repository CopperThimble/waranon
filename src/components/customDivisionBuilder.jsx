import { useEffect, useMemo, useState } from "react";
import { parseDivisionEntries } from "../generators/divisions";
import { buildLocalizationMap } from "../generators/localization";
import { parseCountriesInfoEntries } from "../generators/country";

const MODE_OPTIONS = ["multi", "solo", "challenge"];
const COALITION_OPTIONS = ["NATO", "PACT"];
const TOKEN_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function sanitizeNameForId(value) {
  return value
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}

function randomToken(prefix = "") {
  let result = prefix.toUpperCase().slice(0, 10);

  while (result.length < 10) {
    result += TOKEN_CHARS[Math.floor(Math.random() * TOKEN_CHARS.length)];
  }

  return result.slice(0, 10);
}

function ensureUniqueToken(baseToken, usedTokens) {
  let token = baseToken.slice(0, 10);
  let attempt = 0;

  while (usedTokens.includes(token)) {
    const suffix = String(attempt).padStart(2, "0");
    token = `${baseToken.slice(0, 8)}${suffix}`.slice(0, 10);
    attempt += 1;
  }

  return token;
}

function buildCfgName({ countryId, divisionName, modeSuffix }) {
  const safeName = sanitizeNameForId(divisionName) || "CustomDivision";
  return `${countryId}_${safeName}_${modeSuffix}`;
}

function buildExportName(cfgName) {
  return `Descriptor_Deck_Division_${cfgName}`;
}

function buildDivisionRuleName(cfgName) {
  return `Descriptor_Deck_Division_${cfgName}_Rule`;
}

function buildCostMatrixName(cfgName) {
  return `MatrixCostName_${cfgName}`;
}

function buildEmblemTextureName(cfgName) {
  return `Texture_Division_Emblem_${cfgName}`;
}

function buildEmblemFileName(cfgName, originalFileName) {
  const extension = originalFileName?.toLowerCase().endsWith(".png")
    ? ".png"
    : ".png";

  return `${sanitizeNameForId(cfgName)}${extension}`;
}

function getNextInterfaceOrder(divisions, customDivisions) {
  const allOrders = [
    ...divisions.map((d) => d.interfaceOrder || 0),
    ...(customDivisions || []).map((d) => d.interfaceOrder || 0),
  ];

  return Math.max(0, ...allOrders) + 1;
}

function getUsedTokens(divisions, customDivisions) {
  return [
    ...divisions.flatMap((d) => [
      d.divisionNameToken,
      d.summaryTextToken,
      d.historyTextToken,
    ]),
    ...(customDivisions || []).flatMap((d) => [
      d.divisionNameToken,
      d.summaryTextToken,
      d.historyTextToken,
    ]),
  ].filter(Boolean);
}

export default function CustomDivisionBuilder({
  divisionsText,
  localizationText,
  uiSpecificCountriesText,
  customCountries = [],
  customDivisions = [],
  onSave,
  onCancel,
}) {
  const availableDivisions = useMemo(() => {
    if (!divisionsText) return [];

    try {
      return parseDivisionEntries(divisionsText);
    } catch (error) {
      console.error("Failed to parse divisions:", error);
      return [];
    }
  }, [divisionsText]);

  const availableCountries = useMemo(() => {
    if (!uiSpecificCountriesText) return [];

    try {
      return parseCountriesInfoEntries(uiSpecificCountriesText);
    } catch (error) {
      console.error("Failed to parse countries:", error);
      return [];
    }
  }, [uiSpecificCountriesText]);

  const mergedCountries = useMemo(() => {
    const builtIn = availableCountries.map((country) => ({
      tag: country.tag,
      coalition: country.coalition,
      isCustom: false,
    }));

    const custom = customCountries.map((country) => ({
      tag: country.countryTag,
      coalition: country.coalition,
      isCustom: true,
    }));

    const seen = new Set();
    const merged = [...builtIn, ...custom].filter((country) => {
      if (seen.has(country.tag)) return false;
      seen.add(country.tag);
      return true;
    });

    return merged;
  }, [availableCountries, customCountries]);

  const localizationMap = useMemo(() => {
    try {
      return buildLocalizationMap(localizationText);
    } catch (error) {
      console.error("Failed to parse localization:", error);
      return {};
    }
  }, [localizationText]);

  function getDivisionFriendlyName(entry) {
    return (
      localizationMap[entry.divisionNameToken] ||
      entry.cfgName ||
      entry.exportName ||
      "Unknown Division"
    );
  }

  const [baseDivisionId, setBaseDivisionId] = useState("");
  const [countryId, setCountryId] = useState("");
  const [coalition, setCoalition] = useState("NATO");
  const [divisionDisplayName, setDivisionDisplayName] = useState("");
  const [summaryText, setSummaryText] = useState("");
  const [historyText, setHistoryText] = useState("");
  const [deckBudget, setDeckBudget] = useState(50);
  const [deckSerializerValue, setDeckSerializerValue] = useState("");
  const [modeSuffix, setModeSuffix] = useState("multi");

  const [useCustomEmblem, setUseCustomEmblem] = useState(false);
  const [emblemFile, setEmblemFile] = useState(null);
  const [emblemPreviewUrl, setEmblemPreviewUrl] = useState("");

  useEffect(() => {
    if (availableDivisions.length > 0 && !baseDivisionId) {
      setBaseDivisionId(availableDivisions[0].id);
    }
  }, [availableDivisions, baseDivisionId]);

  const selectedBaseDivision = useMemo(() => {
    return availableDivisions.find((d) => d.id === baseDivisionId) || null;
  }, [availableDivisions, baseDivisionId]);

  useEffect(() => {
    if (!selectedBaseDivision) return;

    setCountryId((prev) => prev || selectedBaseDivision.countryId || "");
    setCoalition((prev) => prev || selectedBaseDivision.coalition || "NATO");

    const localizedBaseName =
      localizationMap[selectedBaseDivision.divisionNameToken] ||
      selectedBaseDivision.cfgName ||
      "";

    setDivisionDisplayName((prev) => prev || localizedBaseName);
  }, [selectedBaseDivision, localizationMap]);

  useEffect(() => {
    if (!emblemFile) {
      setEmblemPreviewUrl("");
      return;
    }

    const objectUrl = URL.createObjectURL(emblemFile);
    setEmblemPreviewUrl(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [emblemFile]);

  const previewValues = useMemo(() => {
    const safeCountryId = countryId || selectedBaseDivision?.countryId || "UNK";
    const safeDivisionName = divisionDisplayName || "Custom Division";
    const cfgName = buildCfgName({
      countryId: safeCountryId,
      divisionName: safeDivisionName,
      modeSuffix,
    });

    const exportName = buildExportName(cfgName);
    const descriptorId = crypto.randomUUID();
    const usedTokens = getUsedTokens(availableDivisions, customDivisions);

    const divisionNameToken = ensureUniqueToken(randomToken("DIV"), usedTokens);

    const summaryTextToken = ensureUniqueToken(randomToken("SUM"), usedTokens);

    const historyTextToken = ensureUniqueToken(randomToken("HIS"), usedTokens);

    const interfaceOrder = getNextInterfaceOrder(
      availableDivisions,
      customDivisions,
    );

    const emblemTexture = buildEmblemTextureName(cfgName);
    const emblemFileName = emblemFile
      ? buildEmblemFileName(cfgName, emblemFile.name)
      : null;

    return {
      cfgName,
      exportName,
      descriptorId,
      divisionNameToken,
      summaryTextToken,
      historyTextToken,
      interfaceOrder,
      divisionRule: buildDivisionRuleName(cfgName),
      costMatrix: buildCostMatrixName(cfgName),
      emblemTexture,
      emblemFileName,
    };
  }, [
    countryId,
    selectedBaseDivision,
    divisionDisplayName,
    modeSuffix,
    availableDivisions,
    customDivisions,
    emblemFile,
  ]);

  function handleSave() {
    if (!selectedBaseDivision) {
      alert("Please select a base division.");
      return;
    }

    if (!countryId) {
      alert("Please select a country.");
      return;
    }

    if (!divisionDisplayName.trim()) {
      alert("Division name is required.");
      return;
    }

    if (!summaryText.trim()) {
      alert("Summary text is required.");
      return;
    }

    if (!historyText.trim()) {
      alert("History text is required.");
      return;
    }

    if (!Number.isFinite(Number(deckBudget))) {
      alert("Deck budget must be a number.");
      return;
    }

    if (
      deckSerializerValue !== "" &&
      !Number.isInteger(Number(deckSerializerValue))
    ) {
      alert("Deck serializer value must be a whole number.");
      return;
    }

    if (useCustomEmblem && !emblemFile) {
      alert("Custom emblem is enabled, but no PNG file was selected.");
      return;
    }

    if (
      useCustomEmblem &&
      emblemFile &&
      !emblemFile.name.toLowerCase().endsWith(".png")
    ) {
      alert("Custom emblem file must be a PNG.");
      return;
    }

    const divisionTags = [
      "DEFAULT",
      countryId,
      coalition,
      selectedBaseDivision.typeToken || "UNKNOWN",
    ];

    const newCustomDivision = {
      id: crypto.randomUUID(),
      sourceType: "custom",
      baseDivisionId: selectedBaseDivision.id,
      baseDivision: selectedBaseDivision,

      exportName: previewValues.exportName,
      descriptorId: previewValues.descriptorId,
      cfgName: previewValues.cfgName,

      divisionNameToken: previewValues.divisionNameToken,
      divisionNameText: divisionDisplayName.trim(),

      descriptionHintTitleToken: previewValues.divisionNameToken,

      interfaceOrder: previewValues.interfaceOrder,
      coalition,
      divisionTags,

      deckBudget: Number(deckBudget),
      deckSerializerValue:
        deckSerializerValue === "" ? null : Number(deckSerializerValue),

      divisionRule: previewValues.divisionRule,
      costMatrix: previewValues.costMatrix,

      useCustomEmblem,
      emblemTexture: useCustomEmblem
        ? previewValues.emblemTexture
        : selectedBaseDivision.emblemTexture || "",
      emblemFile,
      emblemFileName: useCustomEmblem ? previewValues.emblemFileName : null,
      emblemPreviewUrl,

      typeToken: selectedBaseDivision.typeToken || "",
      summaryTextToken: previewValues.summaryTextToken,
      summaryText: summaryText.trim(),

      historyTextToken: previewValues.historyTextToken,
      historyText: historyText.trim(),

      countryId,

      standoutUnits: selectedBaseDivision.standoutUnits || [],
      maxActivationPoints: Number(deckBudget),
      modeSuffix,
    };

    onSave(newCustomDivision);
  }

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Add Custom Division</h2>

      <div style={{ display: "grid", gap: "12px", marginBottom: "16px" }}>
        <div>
          <label>Base Division</label>
          <br />
          <select
            value={baseDivisionId}
            onChange={(e) => setBaseDivisionId(e.target.value)}
            style={{ width: "100%", padding: "8px", marginTop: "4px" }}
          >
            {availableDivisions.map((division) => (
              <option key={division.id} value={division.id}>
                {getDivisionFriendlyName(division)} ({division.countryId})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label>Country</label>
          <br />
          <select
            value={countryId}
            onChange={(e) => setCountryId(e.target.value)}
            style={{ width: "100%", padding: "8px", marginTop: "4px" }}
          >
            <option value="">Select country</option>
            {mergedCountries.map((country) => (
              <option key={country.tag} value={country.tag}>
                {country.tag} ({country.coalition})
                {country.isCustom ? " (custom)" : ""}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label>Coalition</label>
          <br />
          <select
            value={coalition}
            onChange={(e) => setCoalition(e.target.value)}
            style={{ width: "100%", padding: "8px", marginTop: "4px" }}
          >
            {COALITION_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label>Mode</label>
          <br />
          <select
            value={modeSuffix}
            onChange={(e) => setModeSuffix(e.target.value)}
            style={{ width: "100%", padding: "8px", marginTop: "4px" }}
          >
            {MODE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label>Division Name</label>
          <br />
          <input
            value={divisionDisplayName}
            onChange={(e) => setDivisionDisplayName(e.target.value)}
            style={{ width: "100%", padding: "8px", marginTop: "4px" }}
            placeholder="16e Mecanisee"
          />
        </div>

        <div>
          <label>Deck Budget</label>
          <br />
          <input
            type="number"
            value={deckBudget}
            onChange={(e) => setDeckBudget(Number(e.target.value))}
            style={{ width: "100%", padding: "8px", marginTop: "4px" }}
          />
        </div>

        <div>
          <label>Deck Serializer Value</label>
          <br />
          <input
            type="number"
            value={deckSerializerValue}
            onChange={(e) => setDeckSerializerValue(e.target.value)}
            style={{ width: "100%", padding: "8px", marginTop: "4px" }}
            placeholder="422"
          />
        </div>

        <div>
          <label>Summary Text</label>
          <br />
          <textarea
            value={summaryText}
            onChange={(e) => setSummaryText(e.target.value)}
            style={{
              width: "100%",
              padding: "8px",
              marginTop: "4px",
              minHeight: "80px",
            }}
            placeholder="Summary text for UNITS.csv"
          />
        </div>

        <div>
          <label>History Text</label>
          <br />
          <textarea
            value={historyText}
            onChange={(e) => setHistoryText(e.target.value)}
            style={{
              width: "100%",
              padding: "8px",
              marginTop: "4px",
              minHeight: "100px",
            }}
            placeholder="History text for UNITS.csv"
          />
        </div>

        <div>
          <label>
            <input
              type="checkbox"
              checked={useCustomEmblem}
              onChange={(e) => setUseCustomEmblem(e.target.checked)}
              style={{ marginRight: "8px" }}
            />
            Use custom emblem PNG
          </label>
        </div>

        {useCustomEmblem && (
          <div>
            <label>Emblem PNG</label>
            <br />
            <input
              type="file"
              accept=".png,image/png"
              onChange={(e) => {
                const file = e.target.files?.[0] || null;
                setEmblemFile(file);
              }}
              style={{ marginTop: "4px" }}
            />
          </div>
        )}

        {useCustomEmblem && emblemPreviewUrl && (
          <div
            style={{
              marginTop: "8px",
              padding: "12px",
              border: "1px solid #666",
              borderRadius: "10px",
              background: "#0f0f0f",
            }}
          >
            <div style={{ marginBottom: "8px", fontWeight: "bold" }}>
              Emblem Preview
            </div>
            <img
              src={emblemPreviewUrl}
              alt="Emblem preview"
              style={{
                maxWidth: "180px",
                height: "auto",
                border: "1px solid #999",
                background: "#fff",
                padding: "4px",
              }}
            />
            {emblemFile && (
              <div
                style={{ marginTop: "8px", fontSize: "12px", color: "#ccc" }}
              >
                {emblemFile.name}
              </div>
            )}
          </div>
        )}

        <div
          style={{
            marginTop: "8px",
            padding: "12px",
            border: "1px solid #666",
            borderRadius: "10px",
            background: "#0f0f0f",
          }}
        >
          <div style={{ marginBottom: "8px", fontWeight: "bold" }}>
            Generated Preview
          </div>

          <div>
            <strong>Export Name:</strong> {previewValues.exportName}
          </div>
          <div>
            <strong>DescriptorId:</strong> {previewValues.descriptorId}
          </div>
          <div>
            <strong>CfgName:</strong> {previewValues.cfgName}
          </div>
          <div>
            <strong>Division Name Token:</strong>{" "}
            {previewValues.divisionNameToken}
          </div>
          <div>
            <strong>Summary Token:</strong> {previewValues.summaryTextToken}
          </div>
          <div>
            <strong>History Token:</strong> {previewValues.historyTextToken}
          </div>
          <div>
            <strong>Interface Order:</strong> {previewValues.interfaceOrder}
          </div>
          <div>
            <strong>Division Rule:</strong> {previewValues.divisionRule}
          </div>
          <div>
            <strong>Cost Matrix:</strong> {previewValues.costMatrix}
          </div>
          <div>
            <strong>Emblem Texture:</strong> {previewValues.emblemTexture}
          </div>
          <div>
            <strong>Emblem File:</strong>{" "}
            {previewValues.emblemFileName || "(using base emblem)"}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: "8px" }}>
        <button type="button" onClick={handleSave}>
          Save Division
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
