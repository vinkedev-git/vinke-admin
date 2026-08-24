import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  turbopack: {},
  eslint: {
    ignoreDuringBuilds: true,
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
  outputFileTracingIncludes: {
    "/api/admin/questions/import": [
      "./scripts/sync-questions-from-xlsx.mjs",
      "./node_modules/xlsx/**/*",
      "./node_modules/adler-32/**/*",
      "./node_modules/cfb/**/*",
      "./node_modules/codepage/**/*",
      "./node_modules/crc-32/**/*",
      "./node_modules/ssf/**/*",
      "./node_modules/wmf/**/*",
      "./node_modules/word/**/*",
    ],
  },
};

export default nextConfig;
