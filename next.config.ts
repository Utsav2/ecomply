import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The fixture repo, platform registry, and recorded run are read from disk
  // at request time; file tracing cannot see those dynamic reads, and it
  // excludes env-like files (the fixture's .env.example is a scan target).
  // Force everything into every serverless function bundle — an incomplete
  // fixture silently breaks the completeness claim.
  outputFileTracingIncludes: {
    "/**/*": [
      "./fixture/**/*",
      "./fixture/NonCompliantWebApp/.env.example",
      "./platform/**/*",
      "./data/**/*",
    ],
  },
};

export default nextConfig;
