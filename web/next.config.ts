import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ffmpeg-static ships a binary; keep it external and copy it into the server bundle.
  serverExternalPackages: ["ffmpeg-static"],
  outputFileTracingIncludes: {
    "/api/**/*": ["./node_modules/ffmpeg-static/ffmpeg"],
  },
};

export default nextConfig;
