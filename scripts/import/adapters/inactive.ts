/**
 * Providers we cannot import yet. They expose the same interface so the
 * pipeline, admin and docs treat them uniformly, but `ready()` explains exactly
 * what is missing and `pages()` refuses to run. No endpoints are guessed here.
 */
import type { ProviderAdapter } from '../types.ts';

function inactive(id: string, reason: string): ProviderAdapter {
  return {
    id,
    feedHosts: [],
    embedHosts: [],
    imageHosts: [],
    minCompleteItems: Number.POSITIVE_INFINITY,
    ready: () => ({ ok: false, reason }),
    async *pages() {
      throw new Error(`${id}: ${reason}`);
    },
    parse: () => ({ ok: false, error: `${id}: adapter inactive` }),
  };
}

export const playgama = inactive(
  'playgama',
  'needs PLAYGAMA_CLID and a verified catalog export (the dashboard currently only offers a manual JSON download; its schema has not been provided yet)',
);
export const gamedistribution = inactive(
  'gamedistribution',
  'publisher application rejected (low traffic) — status awaiting_approval; no publishing or monetization allowed',
);
export const famobi = inactive('famobi', 'no approved publisher account (Famobi requires 50k+ monthly visits and an application)');
