import type { NextConfig } from 'next';
// Both processes share the actual bound port. 8001 supports a separately
// started Python dev server when the launcher has not supplied a port yet.
const localAPI = process.env.THREADROOM_LOCAL_API
  ? `http://127.0.0.1:${process.env.THREADROOM_API_PORT || '8001'}` : undefined;
const config: NextConfig = {
  distDir: localAPI ? '.next' : '.next-build',
  devIndicators: { position: 'bottom-right' },
  images: { unoptimized: true },
  trailingSlash: false,
  allowedDevOrigins: ['127.0.0.1'],
  ...(localAPI ? {
    async rewrites() { return [{source: '/api/export', destination: `${localAPI}/api/export`}]; }
  } : {}),
};
export default config;
