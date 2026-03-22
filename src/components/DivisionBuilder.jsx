import { useMemo } from "react";
import CountryBuilder from "./CountryBuilder";
import { exportMod } from "../logic/exportMod";
import JSZip from "jszip";
import {
  parseCountriesInfoEntries,
  applyNewCountryToUiSpecificCountriesFile,
} from "../generators/country";
import { parseDivisionEntries } from "../generators/divisions";

const categories = ["log", "inf", "art", "tnk", "rec", "aa", "hel", "air"];

export default function DivisionBuilder({
  project,
  setProject,
  showCountryEditor,
  setShowCountryEditor,
}) {
  const division = project.division;

  const parsedCountries = useMemo(() => {
    const text = project.files.uiSpecificCountriesText;
    if (!text) return [];

    try {
      return parseCountriesInfoEntries(text);
    } catch (error) {
      console.error("Failed to parse countries:", error);
      return [];
    }
  }, [project.files.uiSpecificCountriesText]);

  //parse divisions and filter divisions
  const parsedDivisions = useMemo(() => {
    const text = project.files.divisionsText;
    if (!text) return [];

    try {
      return parseDivisionEntries(text);
    } catch (error) {
      console.error("Failed to parse divisions:", error);
      return [];
    }
  }, [project.files.divisionsText]);

  const filteredDivisions = useMemo(() => {
    if (!division.countryId) return [];

    return parsedDivisions.filter(
      (entry) => entry.countryId === division.countryId,
    );
  }, [parsedDivisions, division.countryId]);

  function updateDivisionField(field, value) {
    setProject((prev) => ({
      ...prev,
      division: {
        ...prev.division,
        [field]: value,
      },
    }));
  }

  function handleCountryChange(value) {
    if (value === "__ADD_CUSTOM_COUNTRY__") {
      setShowCountryEditor(true);
      return;
    }

    setProject((prev) => ({
      ...prev,
      division: {
        ...prev.division,
        countryId: value,
        divisionId: "",
      },
    }));
  }

  async function handleExport() {
    try {
      const blob = await exportMod(project);

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = `${project.meta?.modName || "mod"}.zip`;
      link.click();

      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <h1 style={styles.title}>Division Builder</h1>

        <div style={styles.topBar}>
          <div style={styles.fieldBox}>
            <label style={styles.label}>Division Alliance</label>
            <select
              value={division.alliance}
              onChange={(e) => updateDivisionField("alliance", e.target.value)}
              style={styles.select}
            >
              <option value="NATO">NATO</option>
              <option value="PACT">PACT</option>
            </select>
          </div>

          <div style={styles.fieldBox}>
            <label style={styles.label}>Division Country</label>
            <select
              value={division.countryId}
              onChange={(e) => handleCountryChange(e.target.value)}
              style={styles.select}
            >
              <option value="">Select country</option>

              {parsedCountries.map((country) => (
                <option key={country.tag} value={country.tag}>
                  {country.tag} ({country.coalition})
                </option>
              ))}

              {project.customCountries.map((country) => (
                <option key={country.countryTag} value={country.countryTag}>
                  {country.countryTag} (custom)
                </option>
              ))}

              <option value="__ADD_CUSTOM_COUNTRY__">
                + Add Custom Country
              </option>
            </select>
          </div>

          <div style={styles.fieldBox}>
            <label style={styles.label}>Base Division</label>
            <select
              value={division.divisionId || ""}
              onChange={(e) =>
                updateDivisionField("divisionId", e.target.value)
              }
              style={styles.select}
              disabled={!division.countryId}
            >
              <option value="">
                {division.countryId
                  ? "Select division"
                  : "Select country first"}
              </option>

              {filteredDivisions.map((baseDivision) => (
                <option key={baseDivision.id} value={baseDivision.id}>
                  {baseDivision.name}
                </option>
              ))}
            </select>
          </div>

          <div style={styles.fieldBox}>
            <label style={styles.label}>Deck Budget</label>
            <input
              type="number"
              value={division.deckBudget}
              onChange={(e) =>
                updateDivisionField("deckBudget", Number(e.target.value))
              }
              style={styles.input}
            />
          </div>

          <div style={styles.exportBox}>
            <button
              type="button"
              style={styles.exportButton}
              onClick={handleExport}
            >
              Export Division
            </button>
          </div>
        </div>

        <div style={styles.grid}>
          {categories.map((category) => (
            <div key={category} style={styles.column}>
              <div style={styles.columnHeader}>{category.toUpperCase()}</div>

              {(project.unitsByCategory[category] || []).map((unit, index) => (
                <div key={index} style={styles.unitCard}>
                  <div style={styles.unitIcon}>icon</div>
                  <div style={styles.unitName}>{unit.name || "unit name"}</div>
                </div>
              ))}

              <button type="button" style={styles.addButton}>
                +
              </button>
            </div>
          ))}
        </div>

        {showCountryEditor && (
          <div style={styles.modal}>
            <div style={styles.modalCard}>
              <CountryBuilder
                uiSpecificCountriesText={project.files.uiSpecificCountriesText}
                onCancel={() => setShowCountryEditor(false)}
                onSave={(customCountry) => {
                  setProject((prev) => ({
                    ...prev,
                    customCountries: [...prev.customCountries, customCountry],
                    division: {
                      ...prev.division,
                      countryId: customCountry.countryTag,
                    },
                  }));

                  setShowCountryEditor(false);
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "#0b0b0b",
    color: "#ffffff",
    padding: "24px",
    fontFamily: "Arial, sans-serif",
  },
  container: {
    maxWidth: "1400px",
    margin: "0 auto",
  },
  title: {
    marginBottom: "24px",
    color: "#ffffff",
  },
  topBar: {
    display: "grid",
    gridTemplateColumns: "repeat(5, minmax(160px, 1fr))",
    gap: "16px",
    marginBottom: "28px",
    alignItems: "end",
  },
  fieldBox: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  label: {
    fontSize: "13px",
    fontWeight: "bold",
  },
  input: {
    padding: "10px",
    borderRadius: "10px",
    border: "1px solid #666",
    background: "#111",
    color: "#fff",
  },
  select: {
    padding: "10px",
    borderRadius: "10px",
    border: "1px solid #666",
    background: "#111",
    color: "#fff",
  },
  exportBox: {
    display: "flex",
    alignItems: "end",
  },
  exportButton: {
    width: "100%",
    padding: "14px",
    borderRadius: "12px",
    border: "1px solid #888",
    background: "#111",
    color: "#fff",
    fontWeight: "bold",
    cursor: "pointer",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(8, minmax(120px, 1fr))",
    gap: "0",
    border: "1px solid #888",
  },
  column: {
    borderRight: "1px solid #888",
    minHeight: "260px",
    display: "flex",
    flexDirection: "column",
  },
  columnHeader: {
    borderBottom: "1px solid #888",
    padding: "8px",
    textAlign: "center",
    fontWeight: "bold",
  },
  unitCard: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    borderBottom: "1px solid #666",
    minHeight: "58px",
  },
  unitIcon: {
    borderRight: "1px solid #666",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    fontSize: "12px",
  },
  unitName: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    fontSize: "12px",
    textAlign: "center",
    padding: "4px",
  },
  addButton: {
    marginTop: "auto",
    border: "none",
    borderTop: "1px solid #666",
    background: "#111",
    color: "#fff",
    fontSize: "20px",
    cursor: "pointer",
    padding: "8px",
  },
  modal: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.6)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  modalCard: {
    width: "600px",
    maxWidth: "90vw",
    background: "#111",
    border: "1px solid #666",
    borderRadius: "14px",
    padding: "20px",
  },
};
