import type { APIRoute } from 'astro';
export const prerender = true;
export const GET: APIRoute = () =>
  new Response(JSON.stringify({
    name: 'Pixuvo', short_name: 'Pixuvo', start_url: '/', display: 'standalone', background_color: '#f4f6fb', theme_color: '#141a46',
    icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: '/logo-512.png', sizes: '512x512', type: 'image/png' }],
  }), { headers: { 'content-type': 'application/manifest+json' } });
