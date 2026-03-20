import { useEffect, useState } from "react";
import DivisionBuilder from "./components/DivisionBuilder";

const createEmptyProject = () => ({
  meta: {
    modName: "sampleMod",
    version: "0.1.0",
  },
  division: {
    baseDivision: "",
    alliance: "NATO",
    countryId: "",
    divisionName: "",
    modeSuffix: "multi",
    descriptorExportName: "",
    cfgName: "",
    descriptorId: "",
    divisionNameToken: "",
    summaryTextToken: "",
    historyTextToken: "",
    deckBudget: 50,
    interfaceOrder: null,
    divisionTags: [],
    typeToken: "",
    divisionRule: "",
    costMatrix: "",
    emblemTexture: "",
    standoutUnits: [],
    useCustomEmblem: false,
    emblemFile: null,
    emblemPreviewUrl: "",
  },
  customCountries: [],
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
  customUnits: [],
  customWeapons: [],
  customAmmo: [],
  files: {
    uiSpecificCountriesText: "",
    divisionsText: "",
    deckSerializerText: "",
  },
  validation: {
    errors: [],
    warnings: [],
  },
});

export default function App() {
  const [project, setProject] = useState(createEmptyProject());
  const [showCountryEditor, setShowCountryEditor] = useState(false);

  useEffect(() => {
    async function loadFiles() {
      try {
        const [uiCountriesRes, divisionsRes] = await Promise.all([
          fetch("/UISpecificCountriesInfos.txt"),
          fetch("/Divisions.txt"),
        ]);

        const [uiSpecificCountriesText, divisionsText] = await Promise.all([
          uiCountriesRes.text(),
          divisionsRes.text(),
        ]);

        setProject((prev) => ({
          ...prev,
          files: {
            ...prev.files,
            uiSpecificCountriesText,
            divisionsText,
          },
        }));
      } catch (error) {
        console.error("Failed to load template files:", error);
      }
    }

    loadFiles();
  }, []);

  return (
    <DivisionBuilder
      project={project}
      setProject={setProject}
      showCountryEditor={showCountryEditor}
      setShowCountryEditor={setShowCountryEditor}
    />
  );
}