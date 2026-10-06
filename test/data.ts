import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// The roster is re-scraped every week, and a source can drop a move or a form
// for a while. Tests read a frozen copy of it, so they check the code and never
// block a data refresh. The live data is guarded by validate() in
// scripts/lib/merge.mjs instead. The element chart is maintained by hand, so
// the real one is used. Refresh the copy on purpose with `npm run fixtures`.
const SCRAPED = new Set(['aniimo.json', 'meta.json']);

export const dataFile = (name: string): string =>
  readFileSync(resolve(process.cwd(), SCRAPED.has(name) ? 'test/fixtures' : 'public/data', name), 'utf8');
