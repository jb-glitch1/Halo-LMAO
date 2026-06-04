/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  eslint: { ignoreDuringBuilds: true },
  transpilePackages: ["three"],
};
module.exports = nextConfig;
