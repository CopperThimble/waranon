import { useEffect, useMemo, useState } from "react";
import { parseDivisionEntries } from "../generators/divisions";
import { buildLocalizationMap } from "../generators/localization";

export default function CustomDivisionBuilder({
  divisionsText,
  localizationText,
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
  const [customCfgName, setCustomCfgName] = useState("");
  const [customDivisionNameToken, setCustomDivisionNameToken] = useState("");
  const [customSummaryTextToken, setCustomSummaryTextToken] = useState("");
  const [customHistoryTextToken, setCustomHistoryTextToken] = useState("");

  useEffect(() => {
    if (availableDivisions.length > 0 && !baseDivisionId) {
      setBaseDivisionId(availableDivisions[0].id);
    }
  }, [availableDivisions, baseDivisionId]);

  const selectedBaseDivision = useMemo(() => {
    return availableDivisions.find((d) => d.id === baseDivisionId) || null;
  }, [availableDivisions, baseDivisionId]);

  function handleSave() {
    if (!selectedBaseDivision) {
      alert("Please select a base division.");
      return;
    }

    if (!customCfgName.trim()) {
      alert("Custom cfgName is required.");
      return;
    }

    const newCustomDivision = {
      id: crypto.randomUUID(),
      sourceType: "custom",
      baseDivisionId: selectedBaseDivision.id,
      exportName: selectedBaseDivision.exportName,
      cfgName: customCfgName.trim(),
      divisionNameToken:
        customDivisionNameToken.trim() || selectedBaseDivision.divisionNameToken,
      summaryTextToken:
        customSummaryTextToken.trim() || selectedBaseDivision.summaryTextToken,
      historyTextToken:
        customHistoryTextToken.trim() || selectedBaseDivision.historyTextToken,
      countryId: selectedBaseDivision.countryId,
      coalition: selectedBaseDivision.coalition,
      typeToken: selectedBaseDivision.typeToken,
      deckBudget: 50,
      interfaceOrder: selectedBaseDivision.interfaceOrder,
      standoutUnits: [],
      unitsByCategory: {
        log: [],
        inf: [],
        art: [],
        tnk: [],
        rec: [],
        aa: [],
        hel: [],
        air: [],
      },
      baseDivision: selectedBaseDivision,
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
          <label>Custom CfgName</label>
          <br />
          <input
            value={customCfgName}
            onChange={(e) => setCustomCfgName(e.target.value)}
            style={{ width: "100%", padding: "8px", marginTop: "4px" }}
            placeholder="MY_CUSTOM_DIVISION"
          />
        </div>

        <div>
          <label>Division Name Token</label>
          <br />
          <input
            value={customDivisionNameToken}
            onChange={(e) => setCustomDivisionNameToken(e.target.value)}
            style={{ width: "100%", padding: "8px", marginTop: "4px" }}
            placeholder={selectedBaseDivision?.divisionNameToken || ""}
          />
        </div>

        <div>
          <label>Summary Text Token</label>
          <br />
          <input
            value={customSummaryTextToken}
            onChange={(e) => setCustomSummaryTextToken(e.target.value)}
            style={{ width: "100%", padding: "8px", marginTop: "4px" }}
            placeholder={selectedBaseDivision?.summaryTextToken || ""}
          />
        </div>

        <div>
          <label>History Text Token</label>
          <br />
          <input
            value={customHistoryTextToken}
            onChange={(e) => setCustomHistoryTextToken(e.target.value)}
            style={{ width: "100%", padding: "8px", marginTop: "4px" }}
            placeholder={selectedBaseDivision?.historyTextToken || ""}
          />
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