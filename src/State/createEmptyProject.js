const createEmptyProject = () => ({
  meta: {
    modName: "sampleMod",
    version: "0.1.0",
  },

  division: {
    // selected template division from Divisions.txt
    baseDivision: "",

    // user-facing division settings
    alliance: "NATO",
    countryId: "",
    divisionName: "",
    modeSuffix: "multi",

    // generated / unique identifiers
    descriptorExportName: "",
    cfgName: "",
    descriptorId: "",
    divisionNameToken: "",
    summaryTextToken: "",
    historyTextToken: "",

    // editable settings
    deckBudget: 50,
    interfaceOrder: null,

    // inherited/cloned values from base division
    divisionTags: [],
    typeToken: "",
    divisionRule: "",
    costMatrix: "",
    emblemTexture: "",
    standoutUnits: [],

    // optional uploaded emblem
    useCustomEmblem: false,
    emblemFile: null,
    emblemPreviewUrl: "",
  },

  customCountries: [
    // {
    //   countryTag: "ROK",
    //   countryName: "Republic of Korea",
    //   baseCountryTag: "BEL",
    //   coalition: "NATO",
    //   nameToken: "CtrROK",
    //   unitToken: "NAMES_ROKD",
    //   useCustomFlag: true,
    //   flagFile: File | null,
    //   flagPreviewUrl: "",
    // }
  ],

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