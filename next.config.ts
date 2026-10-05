import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  register: true,
  scope: "/",
  sw: "sw.js",
  disable: process.env.NODE_ENV === "development",
  extendDefaultRuntimeCaching: true,
  workboxOptions: {
    navigateFallbackDenylist: [/^\/api\//],
    // Listed before the plugin defaults, so it wins over the default 24h "apis" cache:
    // account and alert data must never be served stale from the service worker.
    runtimeCaching: [
      {
        urlPattern: ({ sameOrigin, url: { pathname } }) =>
          sameOrigin && pathname.startsWith("/api/"),
        handler: "NetworkOnly",
        method: "GET",
      },
    ],
  },
});

const nextConfig: NextConfig = {
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'storage.googleapis.com',
        pathname: '/**',
      },
    ],
    localPatterns: [
      {
        pathname: '/assets/**',
        search: '',
      },
      {
        pathname: '/icons/**',
        search: '',
      },
    ],
  },
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=0, must-revalidate',
          },
          {
            key: 'Service-Worker-Allowed',
            value: '/',
          },
        ],
      },
      {
        source: '/manifest.json',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ]
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
  // Increase timeout for external API calls (helps with OAuth)
  httpAgentOptions: {
    keepAlive: true,
  },
};

export default withPWA(nextConfig);
