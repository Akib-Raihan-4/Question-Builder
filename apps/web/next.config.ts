import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets `NEXT_DIST_DIR=.next-build next build` run without clobbering a running dev server.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  /* config options here */
};

export default nextConfig;
