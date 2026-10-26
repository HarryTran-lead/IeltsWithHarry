import { describe, expect, it } from "vitest";
import { createConnector, type SourceId } from "../src/lib/ielts-bank/connectors";

describe("live licensed source audit", () => {
  it.skipIf(!process.env.IELTS_LIVE_AUDIT)("reads current manifests, checks licenses, and normalizes source records", async () => {
    for (const id of ["bandready", "ielts-ai-dataset"] as SourceId[]) {
      const connector = createConnector(id);
      const manifest = await connector.fetchManifest();
      const counts: Record<string, number> = {};
      let warnings = 0;
      const warningTypes: Record<string, number> = {};
      const warningExamples: string[] = [];
      const mockCounts: string[] = [];
      for (const path of manifest.paths) {
        const rows = connector.parseContent(path, await connector.downloadContent(path, manifest.version));
        for (const row of rows) for (const exam of connector.normalizeContent(path, row, manifest.version)) {
          counts[exam.skill] = (counts[exam.skill] || 0) + 1;
          if (exam.mode === "synthetic_mock") mockCounts.push(`${exam.skill}:${exam.content.sections.length}/${exam.content.sections.flatMap((s) => s.questions).length}`);
          for (const warning of connector.validateContent(exam)) { warnings++; const type = warning.split(":")[0]; warningTypes[type] = (warningTypes[type] || 0) + 1; if (warningExamples.length < 20) warningExamples.push(`${path}:${exam.externalId}:${warning}`); }
        }
      }
      expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
      console.log(JSON.stringify({ source: id, version: manifest.version, paths: manifest.paths.length, normalized: counts, warnings, warningTypes, mockCounts, warningExamples: warningExamples.slice(0, 5) }));
    }
  }, 120000);
});
