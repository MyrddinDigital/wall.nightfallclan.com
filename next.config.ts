import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  sassOptions: {},
  async redirects() {
    return [
      {
        source: "/graph",
        destination: "/wall/graph",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
