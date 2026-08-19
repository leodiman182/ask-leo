import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    unoptimized: true,
  },
  outputFileTracingIncludes: {
    // The knowledge base is read at runtime, so it has to ship with the route.
    "/api/chat": ["./src/data/knowledge/**/*"],
  },
};

export default nextConfig;