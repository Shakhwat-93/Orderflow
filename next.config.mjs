/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  compress: true,
  poweredByHeader: false,
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? { exclude: ['error', 'warn'] } : false,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    optimizePackageImports: [
      'recharts',
      'framer-motion',
      'clsx',
      'tailwind-merge',
    ],
  },
  images: {
    remotePatterns: [
      {
        protocol: 'http',
        hostname: '*.sslip.io',
        pathname: '/**',
      },
      {
        protocol: 'http',
        hostname: '187.77.159.209',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
    ],
  },
  async headers() {
    return [
      {
        source: '/_next/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        source: '/(favicon.ico|manifest.webmanifest|notification.mp3|orderflow-logo.png|nova-ai-logo.png)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=86400, stale-while-revalidate=604800',
          },
        ],
      },
    ];
  },
  outputFileTracingRoot: process.cwd(),
  env: {
    APP_VERSION: '2.0.0-next-agency-speed',
  },
};

export default nextConfig;
