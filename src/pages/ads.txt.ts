import type { APIRoute } from 'astro';
import { renderAdsTxt } from '../config/ads-txt';
export const prerender = true;
export const GET: APIRoute = () => new Response(renderAdsTxt(), { headers: { 'content-type': 'text/plain; charset=utf-8' } });
