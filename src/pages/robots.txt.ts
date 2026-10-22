import type { APIRoute } from 'astro';
export const prerender = true;
export const GET: APIRoute = () => {
  // Preview builds must never be indexed. Search and personal pages are NOT disallowed:
  // they carry "noindex" and crawlers have to be able to read it.
  const body = import.meta.env.PUBLIC_NOINDEX === '1'
    ? 'User-agent: *\nDisallow: /\n'
    : [
        // Crawlers that bring no visitors but render thousands of on-demand pages (Worker CPU + D1 reads on the
        // paid plan; Applebot alone was ~60 % of all requests, Oct 2026). Compliant bots obey this.
        ...['Applebot', 'AhrefsBot', 'SemrushBot', 'Amazonbot', 'Amzn-SearchBot'].flatMap((ua) => [`User-agent: ${ua}`, 'Disallow: /', '']),
        'User-agent: *', 'Disallow: /admin/', 'Disallow: /api/', 'Disallow: /random/', 'Disallow: /*/random/', '', 'Sitemap: https://pixuvo.com/sitemap.xml', ''].join('\n');
  return new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
};
