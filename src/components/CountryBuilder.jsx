import { useEffect, useMemo, useState } from "react";
import {
  parseCountriesInfoEntries,
  generateNewCountryData,
  validateNewCountryData,
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
  const [unitToken, setUnitToken] = useState("NAMES_ABCD");

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

  const validation = useMemo(() => {
    try {
      return validateNewCountryData({
        fileText: uiSpecificCountriesText,
        newCountryTag: newTag,
        newCountryName: newName,
        unitToken,
        useCustomFlag,
        customFlagFileName: customFlagFile ? customFlagFile.name : null,
      });
    } catch (error) {
      return {
        isValid: false,
        errors: [error.message],
        warnings: [],
        normalized: null,
      };
    }
  }, [
    uiSpecificCountriesText,
    newTag,
    newName,
    unitToken,
    useCustomFlag,
    customFlagFile,
  ]);

  const previewData = useMemo(() => {
    try {
      return generateNewCountryData({
        fileText: uiSpecificCountriesText,
        baseCountryTag: baseCountry,
        newCountryTag: newTag,
        newCountryName: newName,
        unitToken,
        useCustomFlag,
        customFlagFileName: customFlagFile ? customFlagFile.name : null,
        addTextFormatEntry: true,
      });
    } catch (error) {
      return null;
    }
  }, [
    uiSpecificCountriesText,
    baseCountry,
    newTag,
    newName,
    unitToken,
    useCustomFlag,
    customFlagFile,
  ]);

  function handleSave() {
    try {
      const generated = generateNewCountryData({
        fileText: uiSpecificCountriesText,
        baseCountryTag: baseCountry,
        newCountryTag: newTag,
        newCountryName: newName,
        unitToken,
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
          <label>Unit Token</label>
          <br />
          <input
            value={unitToken}
            onChange={(e) => setUnitToken(e.target.value.toUpperCase())}
            style={{ width: "100%", padding: "8px", marginTop: "4px" }}
            placeholder="NAMES_ABCD"
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

        {(validation.errors.length > 0 || validation.warnings.length > 0) && (
          <div
            style={{
              padding: "12px",
              border: "1px solid #666",
              borderRadius: "10px",
              background: "#0f0f0f",
            }}
          >
            {validation.errors.length > 0 && (
              <div style={{ marginBottom: validation.warnings.length ? "8px" : 0 }}>
                <div style={{ fontWeight: "bold", marginBottom: "6px" }}>Errors</div>
                {validation.errors.map((error, index) => (
                  <div key={index} style={{ color: "#ff8f8f", fontSize: "13px" }}>
                    {error}
                  </div>
                ))}
              </div>
            )}

            {validation.warnings.length > 0 && (
              <div>
                <div style={{ fontWeight: "bold", marginBottom: "6px" }}>Warnings</div>
                {validation.warnings.map((warning, index) => (
                  <div key={index} style={{ color: "#ffd27f", fontSize: "13px" }}>
                    {warning}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {previewData && (
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

            <div><strong>Country Tag:</strong> {previewData.countryTag}</div>
            <div><strong>Name Token:</strong> {previewData.nameToken}</div>
            <div><strong>Unit Token:</strong> {previewData.unitToken}</div>
            <div><strong>Flag Texture Token:</strong> {previewData.flagTextureToken}</div>
            <div><strong>Flag File Name:</strong> {previewData.flagFileName || "(using base flag)"}</div>

            <div style={{ marginTop: "10px", fontWeight: "bold" }}>
              UISpecificCountriesInfos Entry
            </div>
            <pre style={previewStyles.pre}>{previewData.countriesInfoEntry}</pre>

            {previewData.textureEntry && (
              <>
                <div style={{ marginTop: "10px", fontWeight: "bold" }}>
                  Texture Entry
                </div>
                <pre style={previewStyles.pre}>{previewData.textureEntry}</pre>
              </>
            )}

            {previewData.textFormatEntry && (
              <>
                <div style={{ marginTop: "10px", fontWeight: "bold" }}>
                  CountriesTextFormatScriptMap Entry
                </div>
                <pre style={previewStyles.pre}>{previewData.textFormatEntry}</pre>
              </>
            )}

            <div style={{ marginTop: "10px", fontWeight: "bold" }}>
              UnitNames File
            </div>
            <pre style={previewStyles.pre}>{previewData.unitNamesFile}</pre>

            <div style={{ marginTop: "10px", fontWeight: "bold" }}>
              INTERFACE_OUTGAME.csv Row(s)
            </div>
            <pre style={previewStyles.pre}>{previewData.interfaceCsv}</pre>
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: "8px" }}>
        <button type="button" onClick={handleSave} disabled={!validation.isValid}>
          Save Country
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

const previewStyles = {
  pre: {
    marginTop: "6px",
    padding: "10px",
    borderRadius: "8px",
    background: "#0b0b0b",
    border: "1px solid #444",
    color: "#ddd",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    fontSize: "12px",
    overflowX: "auto",
  },
};