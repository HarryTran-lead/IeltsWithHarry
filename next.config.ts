import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: { root: process.cwd() },
  outputFileTracingRoot: process.cwd(),
  images: { remotePatterns: [
    { protocol: "https", hostname: "www.noaa.gov", pathname: "/sites/default/files/**" },
    { protocol: "https", hostname: "www.nasa.gov", pathname: "/wp-content/uploads/**" },
    { protocol: "https", hostname: "assets.science.nasa.gov", pathname: "/dynamicimage/assets/**" },
    { protocol: "https", hostname: "oceanservice.noaa.gov", pathname: "/**" },
  ] },
};

export default nextConfig;
