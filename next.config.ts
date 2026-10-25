import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: { root: process.cwd() },
  outputFileTracingRoot: process.cwd(),
  images: { remotePatterns: [
    { protocol: "https", hostname: "www.noaa.gov", pathname: "/sites/default/files/**" },
    { protocol: "https", hostname: "www.nasa.gov", pathname: "/wp-content/uploads/**" },
  ] },
};

export default nextConfig;
