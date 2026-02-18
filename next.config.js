/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enables minimal runtime bundle for prod Docker "runner" stage
  output: 'standalone'
};

module.exports = nextConfig;
