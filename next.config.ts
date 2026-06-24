import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  output: "standalone",
  experimental: { serverActions: { bodySizeLimit: "15mb" } },
  async headers() {
    return [{ source: "/yorumlar", headers: [{ key: "Cache-Control", value: "private, no-cache, no-store, max-age=0, must-revalidate" }] }];
  },
};
export default nextConfig;
