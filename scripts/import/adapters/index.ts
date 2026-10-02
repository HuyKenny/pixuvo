import type { ProviderAdapter } from '../types.ts';
import { gamemonetize } from './gamemonetize.ts';
import { gamepix } from './gamepix.ts';
import { famobi, gamedistribution } from './inactive.ts';
import { playgama } from './playgama.ts';

export const ADAPTERS: Record<string, ProviderAdapter> = { gamemonetize, gamepix, playgama, gamedistribution, famobi };
