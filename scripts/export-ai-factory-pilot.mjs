import fs from "node:fs";
import ts from "typescript";

const source = fs.readFileSync(new URL("../src/lib/ai-factory/pilot.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const moduleExports = {};
new Function("exports", compiled)(moduleExports);
const file = process.argv[2];
if (!file) throw new Error("Usage: node scripts/export-ai-factory-pilot.mjs OUTPUT.json");
fs.writeFileSync(file, JSON.stringify({ ...moduleExports.pilotPayload, pilot: true }, null, 2));
console.log(file);
