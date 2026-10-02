/** pnpm deploy — backup bookmark + migrations + forced publish (code and data). */
import { sh } from './lib/run.ts';
sh('pnpm exec tsx scripts/db-backup.ts');
sh('pnpm exec wrangler d1 migrations apply pixuvo-production --remote');
sh('pnpm exec tsx scripts/publish.ts --target remote --deploy --force');
