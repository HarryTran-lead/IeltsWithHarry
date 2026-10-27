import { describe, expect, it } from "vitest";
import { assertDeploymentEnvironment } from "../src/lib/deployment-environment";

const prodUrl = "https://vpkhriywprepuhrbarye.supabase.co";
const devUrl = "https://abcdefghijklmnopqrst.supabase.co";

describe("deployment environment isolation", () => {
  it("accepts production only with its own database", () => {
    expect(() => assertDeploymentEnvironment({ VERCEL_ENV: "production", NEXT_PUBLIC_DEMO_MODE: "false", NEXT_PUBLIC_SUPABASE_URL: prodUrl })).not.toThrow();
    expect(() => assertDeploymentEnvironment({ VERCEL_ENV: "production", NEXT_PUBLIC_DEMO_MODE: "true", NEXT_PUBLIC_SUPABASE_URL: prodUrl })).toThrow();
    expect(() => assertDeploymentEnvironment({ VERCEL_ENV: "production", NEXT_PUBLIC_DEMO_MODE: "false", NEXT_PUBLIC_SUPABASE_URL: devUrl })).toThrow();
  });

  it("rejects production Supabase from every preview", () => {
    expect(() => assertDeploymentEnvironment({ VERCEL_ENV: "preview", NEXT_PUBLIC_DEMO_MODE: "true", NEXT_PUBLIC_SUPABASE_URL: prodUrl })).toThrow();
  });

  it("permits an isolated demo preview or a fully configured dev preview", () => {
    expect(() => assertDeploymentEnvironment({ VERCEL_ENV: "preview", NEXT_PUBLIC_DEMO_MODE: "true" })).not.toThrow();
    expect(() => assertDeploymentEnvironment({ VERCEL_ENV: "preview", NEXT_PUBLIC_DEMO_MODE: "false", NEXT_PUBLIC_SUPABASE_URL: devUrl })).toThrow();
    expect(() => assertDeploymentEnvironment({ VERCEL_ENV: "preview", NEXT_PUBLIC_DEMO_MODE: "false", NEXT_PUBLIC_SUPABASE_URL: devUrl, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "public", SUPABASE_SERVICE_ROLE_KEY: "server-only" })).not.toThrow();
  });
});
