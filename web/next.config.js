/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  // `standalone` is only needed for the self-contained Docker production image.
  // It is set by the web Dockerfile (NEXT_OUTPUT_STANDALONE=true). On Vercel the
  // variable is absent, so Next uses its native build output — which is what
  // Vercel expects. Forcing 'standalone' everywhere can confuse Vercel builds.
  output: process.env.NEXT_OUTPUT_STANDALONE === 'true' ? 'standalone' : undefined,
  env: {
    NEXT_PUBLIC_API_BASE: process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000',
  },
};
module.exports = nextConfig;
