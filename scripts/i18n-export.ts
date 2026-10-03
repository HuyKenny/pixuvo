/** Writes the English source (UI + docs) as flat JSON for translators: tmp/i18n/en-messages.json, en-docs.json. */
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import en from '../src/i18n/messages/en.ts';
mkdirSync('tmp/i18n', { recursive: true });
writeFileSync('tmp/i18n/en-messages.json', JSON.stringify(en, null, 1));
writeFileSync('tmp/i18n/en-docs.json', readFileSync('src/i18n/docs/en.json', 'utf8'));
console.log(Object.keys(en).length, 'message keys');
