// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://pixuvo.com',
  // Mixed rendering: pages opt into prerender explicitly (see ARCHITECTURE.md).
  output: 'server',
  adapter: cloudflare({
    // Own images are optimised at build time; partner thumbnails are hotlinked
    // as-is. No runtime Cloudflare Images binding.
    imageService: { build: 'compile', runtime: 'passthrough' },
  }),
  // No Astro sessions: they would provision a KV namespace we do not want.
  session: false,
  trailingSlash: 'always',
  build: { format: 'directory' },
  // No inline scripts: keeps the CSP free of 'unsafe-inline' for scripts.
  vite: {
    plugins: [tailwindcss()],
    build: { assetsInlineLimit: 0 },
    // Part of every edge-cache key, so a code deploy never serves HTML rendered by the previous build.
    define: { __BUILD_ID__: JSON.stringify(process.env.BUILD_ID ?? String(Date.now())) },
  },
});
