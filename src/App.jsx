import JSZip from "jszip";
import { useEffect, useState } from "react";
import {
  parseCountriesInfoEntries,
  generateNewCountryData,
  applyNewCountryToUiSpecificCountriesFile,
} from "./generators/country";

export default function App() {
  const [existingText, setExistingText] = useState("");
  const [availableCountries, setAvailableCountries] = useState([]);
  const [output, setOutput] = useState("");
  const [baseCountry, setBaseCountry] = useState("BEL");
  const [newTag, setNewTag] = useState("SWE");
  const [newName, setNewName] = useState("Sweden");

  async function handleExport() {
  if (!existingText) {
    alert("File not loaded yet!");
    return;
  }

  try {
    const generated = generateNewCountryData({
      fileText: existingText,
      baseCountryTag: baseCountry,
      newCountryTag: newTag,
      newCountryName: newName,
      unitToken: "NAMES_ABCD",
      useCustomFlag: false,
      addTextFormatEntry: true,
    });

    const updatedText = applyNewCountryToUiSpecificCountriesFile(
      existingText,
      generated
    );

    const zip = new JSZip();

    const modName = "sampleMod"; // keep simple for now

    const root = zip.folder(modName);

    // 1. Updated UISpecificCountriesInfos.ndf
    root.file(
      "GameData/Generated/UserInterface/UISpecificCountriesInfos.ndf",
      updatedText
    );

    // 2. UnitNames file
    root.file(
      `GameData/Generated/Gameplay/Gfx/UnitNames/UnitNames_${generated.countryTag}.NDF`,
      generated.unitNamesFile
    );

    // 3. Localization CSV
    root.file(
      `GameData/Localisation/${modName}/INTERFACE_OUTGAME.csv`,
      generated.interfaceCsv
    );

    // Generate zip
    const blob = await zip.generateAsync({ type: "blob" });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `${modName}_${generated.countryTag}.zip`;
    link.click();

    URL.revokeObjectURL(url);
  } catch (error) {
    alert("Export failed: " + error.message);
  }
}

  useEffect(() => {
    fetch("/UISpecificCountriesInfos.txt")
      .then((res) => res.text())
      .then((text) => setExistingText(text))
      .catch((err) => console.error("Failed to load file:", err));
  }, []);

  useEffect(() => {
    if (!existingText) return;

    try {
      const countries = parseCountriesInfoEntries(existingText);
      setAvailableCountries(countries);

      if (countries.length > 0 && !countries.some((c) => c.tag === baseCountry)) {
        setBaseCountry(countries[0].tag);
      }
    } catch (error) {
      console.error("Failed to parse countries:", error);
    }
  }, [existingText]);

  useEffect(() => {
    if (!existingText || !baseCountry) return;

    try {
      const generated = generateNewCountryData({
        fileText: existingText,
        baseCountryTag: baseCountry,
        newCountryTag: newTag,
        newCountryName: newName,
        unitToken: "NAMES_ABCD",
        useCustomFlag: false,
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