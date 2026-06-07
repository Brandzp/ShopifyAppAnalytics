import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
  // Limit build-time page-data collection to a single worker. On
  // memory-constrained hosts the default multi-worker fan-out can OOM-kill
  // workers during "Collecting page data" (silent crash, no BUILD_ID).
  // Serial collection is slightly slower but reliable.
  experimental: {
    cpus: 1,
    workerThreads: false
  },
  // Native server-only modules — keep external so Next doesn't try to bundle them.
  // Playwright: Instagram crawler. Sharp: Creative image compositor.
  // fluent-ffmpeg + ffmpeg-static: Creative video pipeline.
  serverExternalPackages: [
    "playwright",
    "playwright-core",
    "sharp",
    "fluent-ffmpeg",
    "ffmpeg-static"
  ]
};

export default nextConfig;
