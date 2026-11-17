import { describe, expect, it } from "vitest";
import { h67SafeStatus, isH67ReadOnlyPreflightEnabled } from "./preflight";

describe("H67 staging read-only preflight gate", () => {
  it("defaults to off", () => {
    expect(isH67ReadOnlyPreflightEnabled({})).toBe(false);
  });
  it("requires explicit opt-in", () => {
    expect(isH67ReadOnlyPreflightEnabled({ H67_ADMIN_PREFLIGHT_ENABLED: "true" })).toBe(true);
    expect(isH67ReadOnlyPreflightEnabled({ H67_ADMIN_PREFLIGHT_ENABLED: "TRUE" })).toBe(false);
  });
  it("does not allow learner release", () => {
    expect(isH67ReadOnlyPreflightEnabled({
      H67_ADMIN_PREFLIGHT_ENABLED: "true", H61_LEARNER_RELEASE: "true",
    })).toBe(false);
  });
  it("does not allow auto grading", () => {
    expect(isH67ReadOnlyPreflightEnabled({
      H67_ADMIN_PREFLIGHT_ENABLED: "true", H61_AUTO_GRADING: "true",
    })).toBe(false);
  });
  it("does not coexist with unverified write gateway", () => {
    expect(isH67ReadOnlyPreflightEnabled({
      H67_ADMIN_PREFLIGHT_ENABLED: "true", H64_GATEWAY_ENABLED: "true",
    })).toBe(false);
  });
  it("never returns a green release state", () => {
    const status = h67SafeStatus();
    expect(status.securityGate).toBe("NO_GO");
    expect(status.learnerRelease).toBe(false);
    expect(status.goldLabels).toBe("NOT_VERIFIED");
    expect(JSON.stringify(status)).not.toMatch(/studentText|answerText|secret/);
  });
});
