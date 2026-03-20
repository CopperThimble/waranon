import JSZip from "jszip";
import { useEffect, useState } from "react";
import {
  parseCountriesInfoEntries,
  generateNewCountryData,
  applyNewCountryToUiSpecificCountriesFile,
} from "./generators/country";

export default function App() {
  // Raw contents of UISpecificCountriesInfos.txt
  const [existingText, setExistingText] = useState("");

  // Parsed list of countries from the file (used for dropdown)
  const [availableCountries, setAvailableCountries] = useState([]);

  // Output preview (updated file contents)
  const [output, setOutput] = useState("");

  // User-selected base country (to clone from)
  const [baseCountry, setBaseCountry] = useState("BEL");

  // New country tag (e.g. SWE, ABC, etc.)
  const [newTag, setNewTag] = useState("SWE");

  // New country display name
  const [newName, setNewName] = useState("Sweden");

  // Uploaded PNG file (if using custom flag)
  const [customFlagFile, setCustomFlagFile] = useState(null);

  // Whether user wants to use a custom flag
  const [useCustomFlag, setUseCustomFlag] = useState(false);

  /**
   * EXPORT FUNCTION
   * Builds the mod folder structure and downloads it as a zip
   */
  async function handleExport() {
    // Safety check: file must be loaded first
    if (!existingText) {
      alert("File not loaded yet!");
      return;
    }

    // If custom flag is enabled, ensure a file was selected
    if (useCustomFlag && !customFlagFile) {
      alert("Please select a PNG file first.");
      return;
    }

    try {
      // Generate all required data for the new country
      const generated = generateNewCountryData({
        fileText: existingText,
        baseCountryTag: baseCountry,
        newCountryTag: newTag,
        newCountryName: newName,
        unitToken: "NAMES_ABCD",
        useCustomFlag,
        customFlagFileName: customFlagFile ? customFlagFile.name : null,
        addTextFormatEntry: true,
      });

      // Apply changes to UISpecificCountriesInfos file
      const updatedText = applyNewCountryToUiSpecificCountriesFile(
        existingText,
        generated
      );

      // Create zip file
      const zip = new JSZip();

      // Root mod folder name (inside zip)
      const modName = "sampleMod";

      // Create root folder
      const root = zip.folder(modName);

      if (!root) {
        throw new Error("Failed to create mod root folder.");
      }

      // Add updated UISpecificCountriesInfos.ndf
      root.file(
        "GameData/Generated/UserInterface/UISpecificCountriesInfos.ndf",
        updatedText
      );

      // Add UnitNames file
      root.file(
        `GameData/Generated/Gameplay/Gfx/UnitNames/UnitNames_${generated.countryTag}.NDF`,
        generated.unitNamesFile
      );

      // Add localization CSV
      root.file(
        `GameData/Localisation/${modName}/INTERFACE_OUTGAME.csv`,
        generated.interfaceCsv
      );

      // Debug logs (can remove later)
      console.log("useCustomFlag:", useCustomFlag);
      console.log("customFlagFile:", customFlagFile);
      console.log("generated.flagFileName:", generated.flagFileName);

      // If using custom flag, include PNG in correct folder
      if (useCustomFlag && customFlagFile) {
        root.file(
          `GameData/Assets/2D/Interface/Common/Flags/${generated.flagFileName}`,
          customFlagFile
        );

        console.log(
          "PNG added to zip at:",
          `GameData/Assets/2D/Interface/Common/Flags/${generated.flagFileName}`
        );
      }

      // Generate zip blob
      const blob = await zip.generateAsync({ type: "blob" });

      // Trigger browser download
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = `${modName}_${generated.countryTag}.zip`;
      link.click();

      // Clean up memory
      URL.revokeObjectURL(url);
    } catch (error) {
      alert("Export failed: " + error.message);
      console.error(error);
    }
  }

  /**
   * Load base UISpecificCountriesInfos file from /public
   */
  useEffect(() => {
    fetch("/UISpecificCountriesInfos.txt")
      .then((res) => res.text())
      .then((text) => setExistingText(text))
      .catch((err) => console.error("Failed to load file:", err));
  }, []);

  /**
   * Parse available countries from the file
   * This populates the dropdown
   */
  useEffect(() => {
    if (!existingText) return;

    try {
      const countries = parseCountriesInfoEntries(existingText);
      setAvailableCountries(countries);

      // If current baseCountry is invalid, default to first available
      if (
        countries.length > 0 &&
        !countries.some((c) => c.tag === baseCountry)
      ) {
        setBaseCountry(countries[0].tag);
      }
    } catch (error) {
      console.error("Failed to parse countries:", error);
    }
  }, [existingText]);

  /**
   * Generate preview output whenever inputs change
   */
  useEffect(() => {
    if (!existingText || !baseCountry) return;

    try {
      const generated = generateNewCountryData({
        fileText: existingText,
        baseCountryTag: baseCountry,
        newCountryTag: newTag,
        newCountryName: newName,
        unitToken: "NAMES_ABCD",
        useCustomFlag: false, // preview does NOT include custom flag logic yet
        addTextFormatEntry: true,
      });

      const updatedText = applyNewCountryToUiSpecificCountriesFile(
        existingText,
        generated
      );

      setOutput(updatedText);
    } catch (error) {
      setOutput(`Error: ${error.message}`);
    }
  }, [existingText, baseCountry, newTag, newName]);

  return (
    <div style={{ padding: 20, fontFamily: "Arial, sans-serif" }}>
      <h1>WARNO Test</h1>

      {/* Toggle for using custom flag */}
      <div>
        <label>
          <input
            type="checkbox"
            checked={useCustomFlag}
            onChange={(e) => setUseCustomFlag(e.target.checked)}
            style={{ marginRight: 8 }}
          />
          Use custom flag PNG
        </label>
      </div>

      {/* File upload (only shown if enabled) */}
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
            style={{ marginTop: 4 }}
          />
        </div>
      )}

      {/* Main inputs */}
      <div style={{ display: "grid", gap: 12, maxWidth: 500, marginBottom: 20 }}>
        <div>
          <label>Base Country</label>
          <br />
          <select
            value={baseCountry}
            onChange={(e) => setBaseCountry(e.target.value)}
            style={{ width: "100%", padding: 8, marginTop: 4 }}
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
            style={{ width: "100%", padding: 8, marginTop: 4 }}
          />
        </div>

        <div>
          <label>New Country Name</label>
          <br />
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            style={{ width: "100%", padding: 8, marginTop: 4 }}
          />
        </div>
      </div>

      {/* Export button */}
      <button
        onClick={handleExport}
        style={{
          padding: "10px 16px",
          marginBottom: "16px",
          cursor: "pointer",
          fontWeight: "bold",
        }}
      >
        Export Mod ZIP
      </button>

      {/* Output preview */}
      <pre
        style={{
          whiteSpace: "pre-wrap",
          background: "#111",
          color: "#0f0",
          padding: "10px",
          maxHeight: "500px",
          overflow: "auto",
        }}
      >
        {output || "Loading..."}
      </pre>
    </div>
  );
}