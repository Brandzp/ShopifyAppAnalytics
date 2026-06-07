import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
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
