import { describe, expect, it } from "vitest";
import { h68Enabled, reviewSchema, validKey, validOrigin } from "./policy";
const valid = {
  probeId: "H57-001", fingerprint: "a".repeat(64), meaning: "PRESERVES_MEANING" as const,
  grammar: "ACCEPTABLE" as const, evidenceQuote: "the teacher",
  reason: "The meaning stays consistent with the source.", uncertaintyReason: "",
};
describe("H68 staged teacher review boundary", () => {
  it("disabled by default", () => expect(h68Enabled({})).toBe(false));
  it("can only be enabled explicitly", () => expect(h68Enabled({ H68_DEPLOYMENT_MODE: "STAGING", H68_REVIEW_WRITES_ENABLED: "true" })).toBe(true));
  it("refuses production despite a flag", () => expect(h68Enabled({ H68_DEPLOYMENT_MODE: "PRODUCTION", H68_REVIEW_WRITES_ENABLED: "true" })).toBe(false));
  it("cannot be enabled alongside grading", () => expect(h68Enabled({ H68_DEPLOYMENT_MODE: "STAGING", H68_REVIEW_WRITES_ENABLED: "true", H61_AUTO_GRADING: "true" })).toBe(false));
  it("cannot be enabled alongside learner release", () => expect(h68Enabled({ H68_DEPLOYMENT_MODE: "STAGING", H68_REVIEW_WRITES_ENABLED: "true", H61_LEARNER_RELEASE: "true" })).toBe(false));
  it("requires exact HTTPS origin", () => {
    expect(validOrigin("https://stage.example.org", "https://stage.example.org")).toBe(true);
    expect(validOrigin(null, "https://stage.example.org")).toBe(false);
    expect(validOrigin("https://evil.example.org", "https://stage.example.org")).toBe(false);
    expect(validOrigin("http://stage.example.org", "http://stage.example.org")).toBe(false);
    expect(validOrigin("https://stage.example.org", "https://stage.example.org/path")).toBe(false);
  });
  it("requires long idempotency key", () => {
    expect(validKey("1234567890abcdef")).toBe(true);
    expect(validKey("short")).toBe(false);
    expect(validKey("a".repeat(129))).toBe(false);
  });
  it("rejects additional fields", () => expect(reviewSchema.safeParse({ ...valid, approved: true }).success).toBe(false));
  it("validates editor-proof evidence", () => expect(reviewSchema.safeParse(valid).success).toBe(true));
  it("requires uncertainty reason", () => expect(reviewSchema.safeParse({ ...valid, meaning: "UNCERTAIN" }).success).toBe(false));
});
