import { useEffect, useMemo, useState } from "react";
import {
  parseCountriesInfoEntries,
  generateNewCountryData,
} from "../generators/country";

export default function CountryBuilder({
  uiSpecificCountriesText,
  onSave,
  onCancel,
}) {
  const availableCountries = useMemo(() => {
    if (!uiSpecificCountriesText) return [];

    try {
      return parseCountriesInfoEntries(uiSpecificCountriesText);
    } catch (error) {
      console.error("Failed to parse countries:", error);
      return [];
    }
  }, [uiSpecificCountriesText]);

  const [baseCountry, setBaseCountry] = useState("BEL");
  const [newTag, setNewTag] = useState("ABC");
  const [newName, setNewName] = useState("New Country");

  const [useCustomFlag, setUseCustomFlag] = useState(false);
  const [customFlagFile, setCustomFlagFile] = useState(null);
  const [flagPreviewUrl, setFlagPreviewUrl] = useState("");

  useEffect(() => {
    if (
      availableCountries.length > 0 &&
      !availableCountries.some((c) => c.tag === baseCountry)
    ) {
      setBaseCountry(availableCountries[0].tag);
    }
  }, [availableCountries, baseCountry]);

  useEffect(() => {
    if (!customFlagFile) {
      setFlagPreviewUrl("");
      return;
    }

    const objectUrl = URL.createObjectURL(customFlagFile);
    setFlagPreviewUrl(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [customFlagFile]);

  function handleSave() {
    try {
      const generated = generateNewCountryData({
        fileText: uiSpecificCountriesText,
        baseCountryTag: baseCountry,
        newCountryTag: newTag,
        newCountryName: newName,
        unitToken: "NAMES_ABCD",
        useCustomFlag,
        customFlagFileName: customFlagFile ? customFlagFile.name : null,
        addTextFormatEntry: true,
      });

      onSave({
        countryTag: generated.countryTag,
        countryName: generated.countryName,
        baseCountryTag: baseCountry,
        coalition: generated.template.coalition,
        nameToken: generated.nameToken,
        unitToken: generated.unitToken,
        useCustomFlag,
        flagFile: customFlagFile,
        flagPreviewUrl,
        generated,
      });
    } catch (error) {
      alert(error.message);
    }
  }

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Add Custom Country</h2>

      <div style={{ display: "grid", gap: "12px", marginBottom: "16px" }}>
        <div>
          <label>Base Country</label>
          <br />
          <select
            value={baseCountry}
            onChange={(e) => setBaseCountry(e.target.value)}
            style={{ width: "100%", padding: "8px", marginTop: "4px" }}
          >
            {availableCountries.map((country) => (
              <option key={country.tag} value={country.tag}>
                {country.tag} ({country.coalition})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label>New Country Tag</label>
          <br />
          <input
            value={newTag}
            onChange={(e) => setNewTag(e.target.value.toUpperCase())}
            style={{ width: "100%", padding: "8px", marginTop: "4px" }}
          />
        </div>

        <div>
          <label>New Country Name</label>
          <br />
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            style={{ width: "100%", padding: "8px", marginTop: "4px" }}
          />
        </div>

        <div>
          <label>
            <input
              type="checkbox"
              checked={useCustomFlag}
              onChange={(e) => setUseCustomFlag(e.target.checked)}
              style={{ marginRight: "8px" }}
            />
            Use custom flag PNG
          </label>
        </div>

        {useCustomFlag && (
          <div>
            <label>Flag PNG</label>
            <br />
            <input
              type="file"
              accept=".png,image/png"
              onChange={(e) => {
                const file = e.target.files?.[0] || null;
                setCustomFlagFile(file);
              }}
              style={{ marginTop: "4px" }}
            />
          </div>
        )}

        {useCustomFlag && flagPreviewUrl && (
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
              Flag Preview
            </div>
            <img
              src={flagPreviewUrl}
              alt="Flag preview"
              style={{
                maxWidth: "180px",
                height: "auto",
                border: "1px solid #999",
                background: "#fff",
                padding: "4px",
              }}
            />
            {customFlagFile && (
              <div style={{ marginTop: "8px", fontSize: "12px", color: "#ccc" }}>
                {customFlagFile.name}
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: "8px" }}>
        <button type="button" onClick={handleSave}>
          Save Country
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}