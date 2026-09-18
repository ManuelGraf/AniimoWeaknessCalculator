// Fold the two sources into one roster.
//
// wiki.aniimo.com is official and tags every combat skill with its element, so
// it wins on anything it knows. aniimoguide.com is a community site that tracks
// newer Aniimo sooner and carries base stats the wiki does not publish, so it
// fills the gaps.
import { GUIDE_ORIGIN } from './guide.mjs';

export const formKey = (name, morphology) =>
  `${String(name).toLowerCase().trim()}::${String(morphology || 'Basic Form').toLowerCase().trim()}`;

const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Skills that exist to move, buff or heal carry no element and can never score
// an elemental hit; keep them out of the offensive maths.
const OFFENSIVE_SECTIONS = new Set(['Combat', 'Innate']);

function cleanSkill(s, source) {
  return {
    name: s.name,
    description: s.description ?? '',
    section: s.section ?? null,
    element: s.elements?.[0] ?? null,
    power: Number.isFinite(s.power) ? s.power : null,
    cost: Number.isFinite(s.cost) ? s.cost : null,
    offensive: OFFENSIVE_SECTIONS.has(s.section) && !!s.elements?.[0],
    source,
  };
}

const absolute = (url) =>
  !url ? null : /^https?:\/\//.test(url) ? url : `${GUIDE_ORIGIN}${url.startsWith('/') ? '' : '/'}${url}`;

export function mergeRosters(wikiForms, guideForms) {
  const wikiByKey = new Map(wikiForms.map((w) => [formKey(w.name, w.morphology), w]));
  const guideByKey = new Map(guideForms.map((g) => [formKey(g.name, g.morphology), g]));
  const keys = [...new Set([...wikiByKey.keys(), ...guideByKey.keys()])];

  const roster = keys.map((key) => {
    const w = wikiByKey.get(key) ?? null;
    const g = guideByKey.get(key) ?? null;

    // Prefer the wiki's skills: every one of its combat skills is element-tagged.
    const skills = w?.skills?.length
      ? w.skills.map((s) => cleanSkill(s, 'wiki'))
      : (g?.skills ?? []).map((s) => cleanSkill(s, 'guide'));

    const name = w?.name ?? g.name;
    const morphology = w?.morphology ?? g.morphology ?? 'Basic Form';

    return {
      id: g?.slug ?? slugify(`${name}-${morphology === 'Basic Form' ? '' : morphology}`).replace(/-form$/, ''),
      name,
      morphology,
      number: w?.entryId ?? g?.number ?? null,
      isBasic: morphology === 'Basic Form',
      stage: g?.stage ?? w?.stage ?? null,
      elements: (w?.elements?.length ? w.elements : g?.elements) ?? [],
      roles: (w?.roles?.length ? w.roles : g?.roles) ?? [],
      description: w?.description || g?.description || '',
      stats: g?.stats ?? null,
      habitats: g?.habitats ?? [],
      // Official art first, community art as the backstop. Most Prismana and
      // weather forms have no wiki head icon, so they fall through to the guide.
      image: w?.image ?? absolute(g?.image) ?? null,
      head: w?.head ?? absolute(g?.head) ?? w?.image ?? null,
      animation: w?.animation ?? null,
      skills,
      sources: [w && 'wiki', g && 'guide'].filter(Boolean),
    };
  });

  // Stable, dex-like ordering: numbered entries first, base form before variants.
  roster.sort((a, b) => {
    const na = Number(a.number), nb = Number(b.number);
    const aNum = Number.isFinite(na), bNum = Number.isFinite(nb);
    if (aNum && bNum && na !== nb) return na - nb;
    if (aNum !== bNum) return aNum ? -1 : 1;
    if (a.name !== b.name) return a.name.localeCompare(b.name);
    if (a.isBasic !== b.isBasic) return a.isBasic ? -1 : 1;
    return a.morphology.localeCompare(b.morphology);
  });

  return roster;
}

// Checks that must hold for the app to be trustworthy. Anything returned here
// is a real data problem, not a style nit.
export function validate(roster, chart) {
  const known = new Set(chart.order);
  const errors = [];
  const warnings = [];

  const ids = new Set();
  for (const a of roster) {
    if (ids.has(a.id)) errors.push(`duplicate id: ${a.id}`);
    ids.add(a.id);

    if (!a.elements.length) errors.push(`${a.name} (${a.morphology}): no elements`);
    for (const el of a.elements) {
      if (!known.has(el)) errors.push(`${a.name} (${a.morphology}): unknown element "${el}"`);
    }
    if (a.elements.length > 2) warnings.push(`${a.name} (${a.morphology}): ${a.elements.length} elements`);

    for (const s of a.skills) {
      if (s.element && !known.has(s.element)) {
        errors.push(`${a.name}: skill "${s.name}" has unknown element "${s.element}"`);
      }
      if (s.section === 'Combat' && !s.element) {
        warnings.push(`${a.name}: combat skill "${s.name}" has no element`);
      }
    }
    if (!a.skills.some((s) => s.offensive)) {
      warnings.push(`${a.name} (${a.morphology}): no element-tagged offensive skill`);
    }
  }

  // The chart must stay internally consistent: if A is strong against B then B
  // must take 1.6x from A, and nothing may be both strong and resisted.
  for (const [el, def] of Object.entries(chart.elements)) {
    for (const t of def.strongAgainst) {
      if (!known.has(t)) errors.push(`chart: ${el} strong against unknown "${t}"`);
      if (def.resistedBy.includes(t)) errors.push(`chart: ${el} both strong against and resisted by ${t}`);
    }
    for (const t of def.resistedBy) {
      if (!known.has(t)) errors.push(`chart: ${el} resisted by unknown "${t}"`);
    }
  }

  return { errors, warnings };
}
