/** H67: strictly read-only, admin-only staging preflight. Never authorizes scoring. */
export type H67Environment = Record<string, string | undefined>;

export function isH67ReadOnlyPreflightEnabled(env: H67Environment): boolean {
  return env.H67_ADMIN_PREFLIGHT_ENABLED === "true"
    && env.H61_LEARNER_RELEASE !== "true"
    && env.H61_AUTO_GRADING !== "true"
    && env.H64_GATEWAY_ENABLED !== "true";
}

export function h67SafeStatus(): {
  milestone: string; mode: string; securityGate: string; learnerRelease: boolean; goldLabels: string;
} {
  return {
    milestone: "H67",
    mode: "READ_ONLY_PREFLIGHT",
    securityGate: "NO_GO",
    learnerRelease: false,
    goldLabels: "NOT_VERIFIED",
  };
}
