import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The build must not depend on a reachable database (spec 002 AC-5), so nothing
  // here may introduce a data source. Keep this file boring.
  reactStrictMode: true,
};

export default nextConfig;
