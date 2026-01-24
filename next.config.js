/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Vercel deployment configuration
  experimental: {
    // Exclude problematic packages from server-side bundling
    serverComponentsExternalPackages: ['discord.js', 'undici'],
  },

  // Webpack configuration for handling problematic packages
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Mark discord.js and its dependencies as external
      // These use WebSockets which don't work in serverless
      config.externals = config.externals || [];
      config.externals.push({
        'discord.js': 'commonjs discord.js',
        'undici': 'commonjs undici',
      });
    }

    // Handle @deno/shim-deno used by yahoo-finance2
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
    };

    return config;
  },

  // Disable ESLint during builds (optional, for faster builds)
  eslint: {
    ignoreDuringBuilds: true,
  },

  // Disable TypeScript errors during builds (we check separately)
  typescript: {
    ignoreBuildErrors: true,
  },
};

module.exports = nextConfig;
