/** Offline aggregate-only evaluation: npx tsx scripts/evaluate-writing.ts deidentified-gold.json */
import { readFileSync } from "node:fs";
import { evaluateByTask, evaluationRowSchema } from "../src/lib/writing-grading/evaluation";

const path = process.argv[2];
if (!path) throw new Error("Usage: npx tsx scripts/evaluate-writing.ts deidentified-gold.json");
const raw = JSON.parse(readFileSync(path, "utf8"));
if (!Array.isArray(raw)) throw new Error("Expected a JSON array of deidentified human-labeled rows");
const rows = raw.map((row) => evaluationRowSchema.parse(row));
console.log(JSON.stringify({ generated_at: new Date().toISOString(), metrics: evaluateByTask(rows) }, null, 2));
