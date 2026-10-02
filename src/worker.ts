/**
 * Worker entrypoint: Astro handles every HTTP request; the daily Cron Trigger
 * (wrangler.jsonc → triggers.crons) only starts the GitHub sync workflow —
 * the import itself never runs inside the Worker.
 */
import { handle } from '@astrojs/cloudflare/handler';
import { dispatchSync, type DispatchEnv } from './lib/server/dispatch';

export default {
  fetch: handle,
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      dispatchSync(env as unknown as DispatchEnv).then((r) => console.log('daily sync dispatch', JSON.stringify(r))),
    );
  },
} satisfies ExportedHandler<Env>;
