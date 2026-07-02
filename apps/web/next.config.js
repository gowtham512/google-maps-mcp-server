/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.API_PROXY_URL || "http://127.0.0.1:3000"}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
