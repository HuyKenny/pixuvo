/** POST /api/admin/<action>/ — form posts from the admin UI. Auth is enforced in middleware (Access JWT). */
import type { APIRoute } from 'astro';
import * as A from '../../../lib/server/admin';
import { q } from '../../../lib/server/db';
import { getEnv } from '../../../lib/server/env';
import { sameOrigin } from '../../../lib/server/http';
export const prerender = false;

function back(ret: string, r: A.ActionResult): Response {
  const safe = /^\/admin\/[a-z0-9\-/?=&%._]*$/i.test(ret) ? ret : '/admin/';
  const u = new URL(safe, 'https://pixuvo.com');
  u.searchParams.set('msg', r.message);
  u.searchParams.set('ok', r.ok ? '1' : '0');
  return new Response(null, { status: 303, headers: { location: u.pathname + u.search, 'cache-control': 'no-store' } });
}

export const POST: APIRoute = async ({ request, params, locals }) => {
  if (!sameOrigin(request)) return new Response('Cross-site request refused', { status: 403 });
  const actor = locals.adminEmail;
  if (!actor) return new Response('Unauthorized', { status: 401 });
  const ct = request.headers.get('content-type') ?? '';
  if (!ct.includes('application/x-www-form-urlencoded') && !ct.includes('multipart/form-data')) return new Response('Bad request', { status: 400 });
  const f = await request.formData();
  const s = (k: string) => String(f.get(k) ?? '');
  const n = (k: string) => Number(f.get(k));
  const ret = s('return');
  const db = q();
  let r: A.ActionResult;
  switch (params.action) {
    case 'games-status':
      r = await A.setGameStatus(db, actor, f.getAll('id').map(Number), s('status'));
      break;
    case 'game-edit':
      r = await A.editGame(db, actor, n('id'), { title: s('title'), description: s('description'), instructions: s('instructions'), categories: f.get('save_categories') ? f.getAll('categories').map(String) : undefined });
      break;
    case 'override-clear':
      r = await A.clearOverride(db, actor, n('id'), s('field'));
      break;
    case 'source-status':
      r = await A.setSourceStatus(db, actor, n('source'), s('status') === 'active' ? 'active' : 'disabled');
      break;
    case 'primary-source':
      r = await A.setPrimarySource(db, actor, n('id'), n('source'));
      break;
    case 'provider':
      r = await A.updateProvider(db, actor, s('id'), { publish_status: s('publish_status'), monetize_status: s('monetize_status'), consent_mode: s('consent_mode'), notes: s('notes') });
      break;
    case 'merge':
      r = await A.mergeGames(db, actor, n('keep'), n('dup'), n('candidate') || null);
      break;
    case 'duplicate-reject':
      r = await A.rejectDuplicate(db, actor, n('candidate'));
      break;
    case 'report-status': {
      const st = s('status');
      r = st === 'resolved' || st === 'dismissed' || st === 'open' ? await A.setReportStatus(db, actor, n('id'), st) : { ok: false, message: 'Invalid status.' };
      break;
    }
    case 'landing':
      r = await A.saveLanding(db, actor, { slug: s('slug'), h1: s('h1'), title: s('title'), description: s('description'), intro: s('intro'), all: f.getAll('all').map(String), status: s('status'), indexable: f.get('indexable') === '1' });
      break;
    case 'redirect':
      r = await A.addRedirect(db, actor, s('old'), s('target'));
      break;
    case 'setting':
      r = await A.saveSetting(db, actor, s('key'), s('value'));
      break;
    case 'request-sync': {
      const env = getEnv();
      if (!env.GH_DISPATCH_TOKEN || !env.GH_REPO) {
        r = { ok: false, message: 'GitHub dispatch token is not configured (see CREDENTIALS_REQUIRED.md).' };
        break;
      }
      const res = await fetch(`https://api.github.com/repos/${env.GH_REPO}/actions/workflows/sync.yml/dispatches`, {
        method: 'POST',
        headers: { authorization: `Bearer ${env.GH_DISPATCH_TOKEN}`, accept: 'application/vnd.github+json', 'user-agent': 'pixuvo-admin', 'x-github-api-version': '2022-11-28' },
        body: JSON.stringify({ ref: 'main' }),
      });
      r = res.status === 204 ? { ok: true, message: 'Sync requested — watch the Imports table in a few minutes.' } : { ok: false, message: `GitHub refused the dispatch (${res.status}).` };
      break;
    }
    default:
      return new Response('Unknown action', { status: 404 });
  }
  return back(ret, r);
};
