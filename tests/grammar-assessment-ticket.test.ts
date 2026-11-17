import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GRAMMAR_TEST_SIZE } from "../src/lib/grammar/gate";
import {
  resolveGrammarSigningKey,
  signGrammarAssessmentTicket,
  verifyGrammarAssessmentTicket,
  type GrammarAssessmentTicket,
} from "../src/lib/grammar/assessment-ticket";

const now = 1_770_000_000_000;
const firstKey = "x".repeat(64);
const rotatedKey = "y".repeat(64);
const ticket = (): GrammarAssessmentTicket => ({
  userId: "learner-one",
  target: "B1",
  ids: Array.from({ length: GRAMMAR_TEST_SIZE }, (_, i) => `question-${i}`),
  expires: now + 30 * 60_000,
});

describe("Grammar assessment dedicated signing key", () => {
  it("requires a dedicated 32-byte-or-longer live signing key", () => {
    expect(() => resolveGrammarSigningKey(undefined, false)).toThrow(/not configured/);
    expect(() => resolveGrammarSigningKey("", false)).toThrow(/not configured/);
    expect(() => resolveGrammarSigningKey("short", false)).toThrow(/too short/);
    expect(() => resolveGrammarSigningKey(" "+firstKey, false)).toThrow(/not configured/);
    expect(resolveGrammarSigningKey(firstKey, false)).toBe(firstKey);
  });

  it("uses the isolated, predictable demo key only in demo mode", () => {
    const demoKey = resolveGrammarSigningKey(undefined, true);
    expect(demoKey).toBe(resolveGrammarSigningKey(firstKey, true));
    expect(() => resolveGrammarSigningKey(demoKey, false)).toThrow();
    expect(demoKey).not.toBe(firstKey);
  });

  it("round-trips a 30-minute ticket for the correct user and target", () => {
    const value = ticket();
    const signed = signGrammarAssessmentTicket(value, firstKey);
    expect(signed.split(".")).toHaveLength(2);
    expect(verifyGrammarAssessmentTicket(signed, value.userId, "B1", firstKey, now)).toEqual(value);
    expect(verifyGrammarAssessmentTicket(signed, "learner-two", "B1", firstKey, now)).toBeNull();
    expect(verifyGrammarAssessmentTicket(signed, value.userId, "B2", firstKey, now)).toBeNull();
  });

  it("rejects old-key tickets after rotation rather than falling back", () => {
    const signed = signGrammarAssessmentTicket(ticket(), firstKey);
    expect(verifyGrammarAssessmentTicket(signed, "learner-one", "B1", rotatedKey, now)).toBeNull();
  });

  it("rejects expired, altered, malformed and oversized tokens", () => {
    const signed = signGrammarAssessmentTicket(ticket(), firstKey);
    expect(verifyGrammarAssessmentTicket(signed, "learner-one", "B1", firstKey, now + 30 * 60_000)).toBeNull();
    expect(verifyGrammarAssessmentTicket(signed + "x", "learner-one", "B1", firstKey, now)).toBeNull();
    expect(verifyGrammarAssessmentTicket(signed + ".extra", "learner-one", "B1", firstKey, now)).toBeNull();
    expect(verifyGrammarAssessmentTicket("x".repeat(8193), "learner-one", "B1", firstKey, now)).toBeNull();
  });

  it("rejects duplicate question IDs and implausible future expiry", () => {
    const repeated = ticket();
    repeated.ids[1] = repeated.ids[0];
    expect(verifyGrammarAssessmentTicket(signGrammarAssessmentTicket(repeated, firstKey), "learner-one", "B1", firstKey, now)).toBeNull();
    const future = ticket();
    future.expires = now + 90 * 60_000;
    expect(verifyGrammarAssessmentTicket(signGrammarAssessmentTicket(future, firstKey), "learner-one", "B1", firstKey, now)).toBeNull();
  });

  it("does not read Supabase service-role credentials in either signing module", () => {
    for (const path of ["src/lib/grammar/placement.ts", "src/lib/grammar/assessment-ticket.ts"]) {
      const code = readFileSync(join(process.cwd(), path), "utf8");
      expect(code).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
      expect(code).not.toContain("process.env.NEXT_PUBLIC_SUPABASE");
    }
  });
});
