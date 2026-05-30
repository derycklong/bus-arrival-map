import type { NextConfig } from "next";

const isDockerBuild = process.env.DOCKER_BUILD === "1";

const nextConfig: NextConfig = {
  ...(isDockerBuild ? { output: "export" } : { devIndicators: false, allowedDevOrigins: ["192.168.10.76"] }),
  ...(!isDockerBuild
    ? {
        async rewrites() {
          return [
            {
              source: "/api/:path*",
              destination: "http://127.0.0.1:8000/api/:path*",
            },
          ];
        },
      }
    : {}),
};

export default nextConfig;
