import { useState } from "react";
import DivisionBuilder from "./components/DivisionBuilder";
import uiSpecificCountriesText from "./templates/UISpecificCountriesInfos.txt?raw";
import divisionsText from "./templates/Divisions.txt?raw";
import localizationText from "./templates/localizationexample.txt?raw";
import divisionRulesText from "./templates/DivisionRules.txt?raw";
import unitsText from "./templates/UniteDescriptor.txt?raw";
import deckSerializerText from "./templates/DeckSerializer.txt?raw";

function createEmptyProject() {
  return {
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
    customDivisions: [],
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
      uiSpecificCountriesText,
      divisionsText,
      localizationText,
      divisionRulesText,
      unitsText,
      deckSerializerText,
    },
    validation: {
      errors: [],
      warnings: [],
    },
  };
}

export default function App() {
  const [project, setProject] = useState(createEmptyProject());
  const [showCountryEditor, setShowCountryEditor] = useState(false);
  const [showDivisionEditor, setShowDivisionEditor] = useState(false);

  return (
    <DivisionBuilder
      project={project}
      setProject={setProject}
      showCountryEditor={showCountryEditor}
      setShowCountryEditor={setShowCountryEditor}
      showDivisionEditor={showDivisionEditor}
      setShowDivisionEditor={setShowDivisionEditor}
    />
  );
}
