// Source: wiki.aniimo.com (official). Nuxt app; every route serves a
// `_payload.json` next to it, so we read structured data instead of parsing HTML.
import { payloadData } from './devalue.mjs';
import { mapWithProgress } from './http.mjs';

export const WIKI_ORIGIN = 'https://wiki.aniimo.com';

// The wiki labels elements with internal codenames; map them to in-game names.
export const WIKI_ELEMENT = {
  'attributes-fire': 'Fire',
  'attributes-water': 'Water',
  'attributes-grass': 'Grass',
  'attributes-electric': 'Lightning',
  'attributes-rock': 'Earth',
  'attributes-wind': 'Wind',
  'attributes-dark': 'Dark',
  'attributes-ice': 'Ice',
  'attributes-holy': 'Light',
};

// Numeric element ids used by `skill.source.attributes`. Derived from the skill
// icon ids (1005300_Skill_10500080 -> 105 -> Fire) and verified in sync.mjs
// against the element badges aniimoguide renders for the same skills.
export const SKILL_ELEMENT_ID = {
  2: 'Ice', 3: 'Water', 4: 'Lightning', 5: 'Fire', 6: 'Grass',
  8: 'Earth', 9: 'Wind', 12: 'Dark', 13: 'Light',
};

const payloadUrl = (p) => `${WIKI_ORIGIN}${p}/_payload.json`;
const formPath = (entryId, morphology) =>
  `/item/${entryId}/${morphology.toLowerCase().replace(/\s+/g, '-')}`;

function mapElements(keys) {
  return (keys ?? []).map((k) => WIKI_ELEMENT[k]).filter(Boolean);
}

const isVideo = (url) => typeof url === 'string' && /\.(mp4|webm|mov)(\?|$)/i.test(url);

/** First candidate that is a real still image. */
const pickImage = (...urls) => urls.find((u) => typeof u === 'string' && u && !isVideo(u)) ?? null;

// Walk the nested component tree, collecting every skill-ish node while
// remembering which section (and tab) it was found under. Sections come from
// `crumbTitle` components; tab objects live under `props.tabs`.
function collectSkills(node, section, out) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { for (const n of node) collectSkills(n, section, out); return; }

  const props = node.props ?? {};
  let here = section;
  if (node.type === 'crumbTitle' && props.title) here = props.title;
  else if (!node.type && node.title && node.children) here = node.title; // a tab

  if (props.descTitle) {
    const src = props.source ?? {};
    const ids = (src.attributes ?? []).map(Number).filter((n) => Number.isFinite(n));
    out.push({
      name: String(props.descTitle).trim(),
      description: String(props.descContent ?? '').trim(),
      section: here ?? null,
      icon: props.icon ?? null,
      power: src.power === '' || src.power == null ? null : Number(src.power),
      cost: src.consume === '' || src.consume == null ? null : Number(src.consume),
      elementIds: ids,
      elements: ids.map((id) => SKILL_ELEMENT_ID[id]).filter(Boolean),
      unmappedElementIds: ids.filter((id) => !SKILL_ELEMENT_ID[id]),
    });
  }

  collectSkills(node.children, here, out);
  collectSkills(node.components, here, out);
  collectSkills(props.tabs, here, out);
  collectSkills(props.children, here, out);
}

// The `aniimoInfo` component carries the profile fields (official art, weight,
// gender) that are not in `searchKey`.
function findInfo(node) {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const n of node) { const hit = findInfo(n); if (hit) return hit; }
    return null;
  }
  if (node.type === 'aniimoInfo' && node.props?.formData) return node.props.formData;
  for (const key of ['children', 'components']) {
    const hit = findInfo(node[key]);
    if (hit) return hit;
  }
  return null;
}

function parseForm(detail) {
  const key = Object.keys(detail).find((k) => k.startsWith('aniimo-detail'));
  const d = key ? detail[key] : null;
  if (!d?.searchKey) return null;
  const sk = d.searchKey;
  const info = findInfo(d.directories) ?? {};

  const skills = [];
  collectSkills(d.directories, null, skills);

  // The wiki repeats a node id when a component is reused; de-dupe on name+icon.
  const seen = new Set();
  const unique = skills.filter((s) => {
    const k = `${s.name}::${s.icon}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  return {
    wikiId: d.id,
    entryId: sk.entryId,
    name: sk.name,
    morphology: sk.currentMorphology,
    stage: sk.currentStage,
    sortOrder: sk.sortOrder,
    elements: mapElements(sk.attributes),
    roles: (sk.position ?? []).map((p) => p.replace('position-', '')),
    description: sk.description ?? '',
    // `illustrationImage` is a VFX clip (.mp4), not a still - keep it apart
    // from the stage render so nothing tries to put a video in an <img>.
    image: pickImage(info.noGenderImage, info.maleImage, sk.imageUrl),
    animation: isVideo(info.illustrationImage) ? info.illustrationImage : null,
    portrait: sk.imageUrl ?? null,
    head: null, // filled in by images.mjs once the derived URL is verified
    gender: info.gender ?? [],
    weight: [info.weightMin, info.weightMax].filter((n) => typeof n === 'number' && n > 0),
    forms: (d.morphologyList ?? []).filter((m) => m.visible).map((m) => m.currentMorphology),
    skills: unique,
  };
}

export async function scrapeWiki(client) {
  const index = payloadData(await client.get(payloadUrl(''), { json: true }));
  const roster = (index['aniimo-wiki-list-en'] ?? []).filter((e) => e.visible !== false);
  if (!roster.length) throw new Error('wiki: index payload had no aniimo list');
  console.log(`  index: ${roster.length} base entries`);

  // Pass 1: the base form of each entry also tells us which other forms exist.
  const bases = await mapWithProgress(roster, 'base forms', async (entry) => {
    const id = entry.searchKey.entryId;
    const data = payloadData(await client.get(payloadUrl(formPath(id, 'Basic Form')), { json: true }));
    return parseForm(data);
  });

  // Pass 2: fetch every non-basic form discovered above.
  const extra = [];
  for (const base of bases) {
    if (!base) continue;
    for (const form of base.forms) {
      if (form !== 'Basic Form') extra.push({ entryId: base.entryId, form });
    }
  }
  const variants = await mapWithProgress(extra, 'variant forms', async ({ entryId, form }) => {
    try {
      const data = payloadData(await client.get(payloadUrl(formPath(entryId, form)), { json: true }));
      return parseForm(data);
    } catch {
      return null; // a listed form without its own page; not fatal
    }
  });

  return [...bases, ...variants].filter(Boolean);
}
