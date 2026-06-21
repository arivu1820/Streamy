/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  // Emit a self-contained server bundle for the production Docker stage
  // (web/.next/standalone). No effect on `next dev`; safe locally.
  output: 'standalone',
  env: {
    NEXT_PUBLIC_API_BASE: process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000',
  },
};
module.exports = nextConfig;
