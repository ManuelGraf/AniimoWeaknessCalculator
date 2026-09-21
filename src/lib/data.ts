/** Loading and searching the generated database. */
import type { Aniimo, ChartData, Meta } from '../types';

export interface Database {
  chart: ChartData;
  roster: Aniimo[];
  meta: Meta;
}

/**
 * Prerendered pages live at their own paths (`/element/fire/`), so `data/` has
 * to be resolved against the site root rather than the current directory. The
 * prerenderer sets `__SITE_ROOT__` to the right number of `../`; the dev server
 * and the plain index page have none and stay where they are.
 */
const url = (file: string) =>
  new URL(`${window.__SITE_ROOT__ ?? './'}data/${file}`, document.baseURI).href;

export async function loadDatabase(): Promise<Database> {
  const [chart, roster, meta] = await Promise.all([
    fetchJson<ChartData>('elements.json'),
    fetchJson<Aniimo[]>('aniimo.json'),
    fetchJson<Meta>('meta.json'),
  ]);
  return { chart, roster, meta };
}

async function fetchJson<T>(file: string): Promise<T> {
  const res = await fetch(url(file));
  if (!res.ok) throw new Error(`Could not load data/${file} (HTTP ${res.status}). Run \`npm run sync\`.`);
  return (await res.json()) as T;
}

/**
 * "Water, Earth and Light" - for the sentences that have to read as prose.
 * Mirrors list() in scripts/lib/html.mjs, which writes the same sentences onto
 * the static pages.
 */
export const list = (items: readonly string[], conjunction = 'and'): string => {
  const a = items.filter(Boolean);
  if (!a.length) return 'nothing';
  if (a.length === 1) return a[0]!;
  return `${a.slice(0, -1).join(', ')} ${conjunction} ${a[a.length - 1]}`;
};

export const displayName = (a: Aniimo): string =>
  a.isBasic ? a.name : `${a.name} (${a.morphology.replace(/ Form$/, '')})`;

/**
 * Rank matches so that what you typed lands where you expect: exact name, then
 * name prefix, then word-start inside the name, then anything containing it.
 * Base forms outrank their regional variants at equal score.
 */
export function searchRoster(roster: Aniimo[], query: string, limit = 40): Aniimo[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const scored: Array<{ a: Aniimo; score: number }> = [];

  for (const a of roster) {
    const name = a.name.toLowerCase();
    const full = displayName(a).toLowerCase();

    let score = -1;
    if (name === q) score = 0;
    else if (name.startsWith(q)) score = 1;
    else if (new RegExp(`\\b${escapeRegExp(q)}`).test(name)) score = 2;
    else if (name.includes(q)) score = 3;
    else if (full.includes(q)) score = 4;
    else if (a.morphology.toLowerCase().includes(q)) score = 5;
    else if (a.elements.some((e) => e.toLowerCase().startsWith(q))) score = 6;
    if (score < 0) continue;

    scored.push({ a, score: score * 10 + (a.isBasic ? 0 : 1) });
  }

  return scored
    .sort((x, y) => x.score - y.score || x.a.name.localeCompare(y.a.name))
    .slice(0, limit)
    .map((s) => s.a);
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The distinct elements an Aniimo actually has attacking moves for. */
export const moveElements = (a: Aniimo) => [
  ...new Set(a.skills.filter((s) => s.offensive && s.element).map((s) => s.element!)),
];
