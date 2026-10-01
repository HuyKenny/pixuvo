import type { ProviderAdapter } from '../types.ts';
import { gamemonetize } from './gamemonetize.ts';
import { gamepix } from './gamepix.ts';
import { famobi, gamedistribution, playgama } from './inactive.ts';

export const ADAPTERS: Record<string, ProviderAdapter> = { gamemonetize, gamepix, playgama, gamedistribution, famobi };
