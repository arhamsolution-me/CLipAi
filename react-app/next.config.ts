import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    'yt-dlp-exec',
    'fluent-ffmpeg',
    'ffmpeg-static',
    '@aws-sdk/client-s3',
    '@aws-sdk/s3-request-presigner',
  ],
  // @ts-ignore
  allowedDevOrigins: ['localhost', '127.0.0.1', '0.0.0.0'],
};

export default nextConfig;
