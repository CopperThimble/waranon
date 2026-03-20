import {
  generateNewCountryData,
  applyNewCountryToUiSpecificCountriesFile,
} from "./generators/country";

const existingText = `PASTE YOUR UISpecificCountriesInfos.txt CONTENT HERE`;

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

console.log("=== CountriesInfos entry ===");
console.log(generated.countriesInfoEntry);

console.log("=== Texture entry ===");
console.log(generated.textureEntry);

console.log("=== Text format entry ===");
console.log(generated.textFormatEntry);

console.log("=== UnitNames file ===");
console.log(generated.unitNamesFile);

console.log("=== Interface CSV ===");
console.log(generated.interfaceCsv);

const updatedText = applyNewCountryToUiSpecificCountriesFile(existingText, generated);

console.log("=== Updated UISpecificCountriesInfos.txt ===");
console.log(updatedText);