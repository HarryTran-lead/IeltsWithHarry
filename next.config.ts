import type { NextConfig } from "next";
import { assertDeploymentEnvironment } from "./src/lib/deployment-environment";

assertDeploymentEnvironment(process.env);

const avatarOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL;
const avatarPattern = avatarOrigin ? new URL("/storage/v1/object/public/user-avatars/**", avatarOrigin) : null;

const skillLabFiles = ["./content/dictation-skill-lab/lessons/*.json", "./content/dictation-skill-lab/audio-manifest.json"];

const nextConfig: NextConfig = {
  turbopack: { root: process.cwd() },
  outputFileTracingRoot: process.cwd(),
  // Lesson files with answer keys are read from disk by their APIs only; they are not in public/.
  outputFileTracingIncludes: {
    "/api/book2/**": ["./content/book2/lessons/**/*.json"],
    "/api/dictation/skill-lab": skillLabFiles,
    "/api/dictation/skill-lab/**": skillLabFiles,
  },
  images: { remotePatterns: [
    { protocol: "https", hostname: "www.noaa.gov", pathname: "/sites/default/files/**" },
    { protocol: "https", hostname: "www.nasa.gov", pathname: "/wp-content/uploads/**" },
    { protocol: "https", hostname: "assets.science.nasa.gov", pathname: "/dynamicimage/assets/**" },
    { protocol: "https", hostname: "oceanservice.noaa.gov", pathname: "/**" },
    ...(avatarPattern ? [avatarPattern] : []),
  ] },
};

export default nextConfig;
