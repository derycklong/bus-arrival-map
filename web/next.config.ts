import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.10.76"],
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://127.0.0.1:8000/api/:path*",
      },
    ];
  },
};

export default nextConfig;
