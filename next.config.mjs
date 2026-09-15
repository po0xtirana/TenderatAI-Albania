/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // Keep the development cache separate so a local build cannot invalidate a running dev server.
  // Keep dev and production artifacts isolated from OneDrive's stale `.next` placeholder.
  distDir: process.env.NODE_ENV === 'development' ? '.next-dev' : '.next-build',
  serverExternalPackages: ['pdf-parse', 'pdfjs-dist'],
  experimental: {
    serverActions: { bodySizeLimit: '50mb' }
  }
};

export default nextConfig;
