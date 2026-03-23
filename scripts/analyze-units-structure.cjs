#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const MAX_OPTION_SET_VALUES = 50;
const MAX_EXAMPLES = 5;

function readFileSafe(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch (error) {
    console.error(`Failed to read file: ${filePath}`);
    console.error(error.message);
    process.exit(1);
  }
}

function collectEntityBlocks(text) {
  const lines = text.split(/\r?\n/);
  const blocks = [];

  let currentName = null;
  let currentLines = [];

  for (const line of lines) {
    const headerMatch = line.match(
      /^export\s+([A-Za-z0-9_]+)\s+is\s+TEntityDescriptor\b/,
    );

    if (headerMatch) {
      if (currentName) {
        blocks.push({
          id: currentName,
          text: currentLines.join("\n"),
        });
      }

      currentName = headerMatch[1];
      currentLines = [line];
      continue;
    }

    if (currentName) {
      currentLines.push(line);
    }
  }

  if (currentName) {
    blocks.push({
      id: currentName,
      text: currentLines.join("\n"),
    });
  }

  return blocks;
}

function detectValueType(rawValue) {
  const value = rawValue.trim();

  if (/^(True|False)$/i.test(value)) return "boolean";
  if (/^-?\d+(\.\d+)?$/.test(value)) return "number";
  if (/^GUID:\{[^}]+\}$/.test(value)) return "guid";
  if (/^'.*'$/.test(value)) return "single_quoted_string";
  if (/^".*"$/.test(value)) return "double_quoted_string";
  if (/^[A-Za-z0-9_]+\/[A-Za-z0-9_]+$/.test(value)) return "enum_path";
  if (/^\$\/[A-Za-z0-9_/.\-]+$/.test(value)) return "resource_ref";
  if (/^~\/[A-Za-z0-9_/.\-]+$/.test(value)) return "local_ref";
  if (/^\[.*\]$/.test(value)) return "inline_array";
  if (/^\(.*\)$/.test(value)) return "inline_block";
  return "unknown";
}

function normalizeValue(rawValue, type) {
  const value = rawValue.trim();

  if (type === "single_quoted_string" || type === "double_quoted_string") {
    return value.slice(1, -1);
  }

  if (type === "boolean") {
    return /^true$/i.test(value);
  }

  if (type === "number") {
    return Number(value);
  }

  return value;
}

function ensureField(schema, fieldName) {
  if (!schema[fieldName]) {
    schema[fieldName] = {
      count: 0,
      types: new Set(),
      values: new Set(),
      valuesTruncated: false,
      min: null,
      max: null,
      examples: [],
      sources: new Set(),
    };
  }

  return schema[fieldName];
}

function ensureModule(moduleSchema, moduleName) {
  if (!moduleSchema[moduleName]) {
    moduleSchema[moduleName] = {
      count: 0,
      inlineFields: {},
    };
  }

  return moduleSchema[moduleName];
}

function addExample(field, value) {
  if (field.examples.length >= MAX_EXAMPLES) return;
  if (!field.examples.includes(value)) {
    field.examples.push(value);
  }
}

function addValueToField(field, type, value, sourceLabel) {
  field.count += 1;
  field.types.add(type);
  field.sources.add(sourceLabel);

  if (type === "number") {
    field.min = field.min === null ? value : Math.min(field.min, value);
    field.max = field.max === null ? value : Math.max(field.max, value);
  } else if (
    type === "boolean" ||
    type === "single_quoted_string" ||
    type === "double_quoted_string" ||
    type === "enum_path"
  ) {
    if (field.values.size < MAX_OPTION_SET_VALUES) {
      field.values.add(String(value));
    } else {
      field.valuesTruncated = true;
    }
  }

  addExample(field, String(value));
}

function parseSimpleAssignmentsFromLine(line) {
  const assignments = [];
  const match = line.match(/^([A-Za-z0-9_]+)\s*=\s*(.+)$/);

  if (!match) return assignments;

  assignments.push({
    fieldName: match[1],
    rawValue: match[2].trim(),
  });

  return assignments;
}

function parseInlineModuleAssignments(line) {
  const results = [];

  // matches:
  // TFormationModuleDescriptor(TypeUnitFormation = 'Artillerie')
  // TDangerousnessModuleDescriptor(Dangerousness  = 39)
  // TUnitUpkeepModuleDescriptor( UpkeepPercentage = 1.0 )
  const moduleMatch = line.match(/^([A-Za-z0-9_~/$]+)\s*\((.*)\)\s*,?\s*$/);

  if (!moduleMatch) return results;

  const moduleName = moduleMatch[1];
  const inside = moduleMatch[2].trim();

  if (!inside || !inside.includes("=")) {
    return results;
  }

  const assignments = [];
  const regex = /([A-Za-z0-9_]+)\s*=\s*([^,]+?)(?=(?:\s+[A-Za-z0-9_]+\s*=)|$)/g;

  let match;
  while ((match = regex.exec(inside)) !== null) {
    assignments.push({
      fieldName: match[1],
      rawValue: match[2].trim(),
    });
  }

  if (assignments.length > 0) {
    results.push({
      moduleName,
      assignments,
    });
  }

  return results;
}

function analyzeBlocks(blocks) {
  const schema = {};
  const moduleSchema = {};

  for (const block of blocks) {
    const lines = block.text.split(/\r?\n/);

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;
      if (line.startsWith("//")) continue;

      // 1. top-level simple assignments
      const topLevelAssignments = parseSimpleAssignmentsFromLine(line);
      for (const assignment of topLevelAssignments) {
        const type = detectValueType(assignment.rawValue);
        const value = normalizeValue(assignment.rawValue, type);
        const field = ensureField(schema, assignment.fieldName);

        addValueToField(field, type, value, "top_level");
      }

      // 2. inline module assignments
      const inlineModules = parseInlineModuleAssignments(line);
      for (const inlineModule of inlineModules) {
        const mod = ensureModule(moduleSchema, inlineModule.moduleName);
        mod.count += 1;

        for (const assignment of inlineModule.assignments) {
          const type = detectValueType(assignment.rawValue);
          const value = normalizeValue(assignment.rawValue, type);

          const globalField = ensureField(schema, assignment.fieldName);
          addValueToField(globalField, type, value, `module:${inlineModule.moduleName}`);

          if (!mod.inlineFields[assignment.fieldName]) {
            mod.inlineFields[assignment.fieldName] = {
              count: 0,
              types: new Set(),
              values: new Set(),
              valuesTruncated: false,
              min: null,
              max: null,
              examples: [],
            };
          }

          const moduleField = mod.inlineFields[assignment.fieldName];
          moduleField.count += 1;
          moduleField.types.add(type);

          if (type === "number") {
            moduleField.min =
              moduleField.min === null ? value : Math.min(moduleField.min, value);
            moduleField.max =
              moduleField.max === null ? value : Math.max(moduleField.max, value);
          } else if (
            type === "boolean" ||
            type === "single_quoted_string" ||
            type === "double_quoted_string" ||
            type === "enum_path"
          ) {
            if (moduleField.values.size < MAX_OPTION_SET_VALUES) {
              moduleField.values.add(String(value));
            } else {
              moduleField.valuesTruncated = true;
            }
          }

          addExample(moduleField, String(value));
        }
      }
    }
  }

  return {
    schema: finalizeSchema(schema),
    modules: finalizeModuleSchema(moduleSchema),
  };
}

function finalizeSchema(schema) {
  const out = {};

  for (const [fieldName, field] of Object.entries(schema)) {
    out[fieldName] = {
      count: field.count,
      types: Array.from(field.types).sort(),
      optionSetValues: Array.from(field.values).sort(),
      optionSetValuesTruncated: field.valuesTruncated,
      min: field.min,
      max: field.max,
      examples: field.examples,
      sources: Array.from(field.sources).sort(),
    };
  }

  return out;
}

function finalizeModuleSchema(moduleSchema) {
  const out = {};

  for (const [moduleName, moduleInfo] of Object.entries(moduleSchema)) {
    const inlineFields = {};

    for (const [fieldName, field] of Object.entries(moduleInfo.inlineFields)) {
      inlineFields[fieldName] = {
        count: field.count,
        types: Array.from(field.types).sort(),
        optionSetValues: Array.from(field.values).sort(),
        optionSetValuesTruncated: field.valuesTruncated,
        min: field.min,
        max: field.max,
        examples: field.examples,
      };
    }

    out[moduleName] = {
      count: moduleInfo.count,
      inlineFields,
    };
  }

  return out;
}

function buildTopLevelSummary(blocks, analysis) {
  return {
    totalEntityDescriptors: blocks.length,
    fieldsDiscovered: Object.keys(analysis.schema).length,
    inlineModulesDiscovered: Object.keys(analysis.modules).length,
    descriptorExamples: blocks.slice(0, 10).map((b) => b.id),
  };
}

function main() {
  const inputPath = process.argv[2];
  const outputPath = process.argv[3];

  if (!inputPath) {
    console.error(
      "Usage: node scripts/analyze-units-structure.cjs <input-file> [output-json]",
    );
    process.exit(1);
  }

  const resolvedInput = path.resolve(inputPath);
  const text = readFileSafe(resolvedInput);

  const blocks = collectEntityBlocks(text);
  const analysis = analyzeBlocks(blocks);

  const report = {
    inputFile: resolvedInput,
    generatedAt: new Date().toISOString(),
    summary: buildTopLevelSummary(blocks, analysis),
    schema: analysis.schema,
    modules: analysis.modules,
  };

  const json = JSON.stringify(report, null, 2);

  if (outputPath) {
    const resolvedOutput = path.resolve(outputPath);
    fs.mkdirSync(path.dirname(resolvedOutput), { recursive: true });
    fs.writeFileSync(resolvedOutput, json, "utf8");
    console.log(`Wrote structure report to ${resolvedOutput}`);
  } else {
    console.log(json);
  }
}

main();