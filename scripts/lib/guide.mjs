// Source: aniimoguide.com (community). A Next.js app that streams its data as
// RSC flight chunks; the whole Aniidex - including regional/Prismana forms the
// official wiki has not published yet - sits in one page payload.
import { mapWithProgress } from './http.mjs';

export const GUIDE_ORIGIN = 'https://aniimoguide.com';

const BACKSLASH = '\\';

// Concatenate every `self.__next_f.push([1, "<chunk>"])` string literal.
export function readFlight(html) {
  const out = [];
  const re = /self\.__next_f\.push\(\[1\s*,\s*"/g;
  let m;
  while ((m = re.exec(html))) {
    const start = m.index + m[0].length - 1; // sit on the opening quote
    const end = endOfJsonString(html, start);
    if (end < 0) continue;
    try { out.push(JSON.parse(html.slice(start, end))); } catch { /* skip */ }
    re.lastIndex = end;
  }
  return out.join('');
}

function endOfJsonString(s, start) {
  for (let i = start + 1; i < s.length; i++) {
    const c = s[i];
    if (c === BACKSLASH) { i++; continue; }
    if (c === '"') return i + 1;
  }
  return -1;
}

// Extract the balanced JSON object that begins at `start`.
function objectAt(s, start) {
  let depth = 0, inStr = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (c === BACKSLASH) i++;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}') {
      if (--depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}

export function parseAniidex(flight) {
  const found = new Map();
  const re = /\{"slug":"/g;
  let m;
  while ((m = re.exec(flight))) {
    const raw = objectAt(flight, m.index);
    if (!raw) continue;
    let obj;
    try { obj = JSON.parse(raw); } catch { continue; }
    if (obj && obj.name && Array.isArray(obj.elements) && obj.skills) found.set(obj.slug, obj);
  }
  return [...found.values()];
}

// aniimoguide renders a per-skill element badge; this is our fallback for
// Aniimo the official wiki does not carry yet.
const BADGE = /src="\/images\/elements\/\w+\.webp"\/><\/span>([A-Za-z]+)<\/span><h3 class="truncate font-title[^"]*">([^<]+)<\/h3>/g;

export function parseSkillBadges(html) {
  const map = new Map();
  let m;
  BADGE.lastIndex = 0;
  while ((m = BADGE.exec(html))) map.set(decodeEntities(m[2]).trim(), m[1]);
  BADGE.lastIndex = 0;
  return map;
}

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

export function normaliseEntry(o) {
  return {
    slug: o.slug,
    wikiId: o.wikiId ?? null,
    number: o.no ?? null,
    name: o.name,
    morphology: o.morphology ?? 'Basic Form',
    isBasic: !!o.isBasic,
    stage: o.stage ?? null,
    elements: o.elements ?? [],
    roles: (o.roles ?? []).map((r) => r.toLowerCase()),
    description: o.description ?? '',
    stats: o.stats ?? null,
    habitats: o.habitats ?? [],
    evolution: (o.evolution ?? []).map((e) => ({ name: e.name, slug: e.slug, stage: e.stage })),
    image: o.fullBody ?? o.halfBody ?? null,
    head: o.head ?? null,
    skills: ['combat', 'innate'].flatMap((cat) =>
      (o.skills?.[cat] ?? []).map((s) => ({
        name: String(s.name).trim(),
        description: s.description ?? '',
        section: cat === 'combat' ? 'Combat' : 'Innate',
        icon: s.icon ?? null,
        power: s.power === '' || s.power == null ? null : Number(s.power),
        cost: s.cost === '' || s.cost == null ? null : Number(s.cost),
        elements: [],
      }))),
  };
}

// One page holds the whole Aniidex, including every regional and Prismana form.
export async function fetchRoster(client) {
  const html = await client.get(`${GUIDE_ORIGIN}/aniidex`);
  const entries = parseAniidex(readFlight(html)).map(normaliseEntry);
  if (!entries.length) throw new Error('guide: aniidex payload yielded no entries');
  return entries;
}

// Skill elements are only rendered on the detail pages, so fetch those for the
// entries that need them (mutates `entries` in place).
export async function attachSkillElements(client, entries) {
  if (!entries.length) return entries;
  await mapWithProgress(entries, 'detail pages', async (entry) => {
    try {
      const page = await client.get(`${GUIDE_ORIGIN}/aniidex/${entry.slug}`);
      const badges = parseSkillBadges(page);
      for (const s of entry.skills) {
        const el = badges.get(s.name);
        if (el) s.elements = [el];
      }
    } catch { /* leave skills untyped; sync.mjs reports these */ }
  });
  return entries;
}
