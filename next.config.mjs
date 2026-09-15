/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // Keep the development cache separate so a local build cannot invalidate a running dev server.
  // Keep dev and production artifacts isolated from OneDrive's stale `.next` placeholder.
  // Vercel's deployment runtime requires the conventional `.next` directory.
  // Local development and local production builds remain isolated from it to
  // avoid OneDrive cache collisions with a running dev server.
  distDir: process.env.NODE_ENV === 'development' ? '.next-dev' : process.env.VERCEL ? '.next' : '.next-build',
  serverExternalPackages: ['pdf-parse', 'pdfjs-dist', '@napi-rs/canvas'],
  outputFileTracingIncludes: {
    '/api/bulletins/**': ['./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs']
  },
  experimental: {
    serverActions: { bodySizeLimit: '50mb' }
  }
};

export default nextConfig;
