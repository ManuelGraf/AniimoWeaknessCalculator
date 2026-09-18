// The element chart is small, stable and hand-verified, so it lives in
// data/elements.json rather than being scraped on every run. This module
// re-derives it from aniimoguide's element page and shouts if the two drift.
//
// The page states each matchup twice - once in prose per element, once as an
// "offensive coverage" tally - so both are checked against our copy.
const SOURCE = 'https://aniimoguide.com/elements';

const stripTags = (html) =>
  html.replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, '|');

const decode = (s) =>
  s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
   .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
   .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)));

export async function verifyChart(client, chart) {
  let html;
  try {
    html = await client.get(SOURCE);
  } catch (err) {
    return { ok: false, reason: `could not fetch ${SOURCE}: ${err.message}` };
  }

  const piped = decode(stripTags(html));
  const flat = piped.replace(/\|/g, ' ').replace(/\s+/g, ' ');
  const names = chart.order;
  const differences = [];

  const mentioned = (text) => names.filter((n) => new RegExp(`\\b${n}\\b`).test(text));

  let parsedAny = false;
  for (const el of names) {
    const prose = new RegExp(
      `${el} is strong against (.+?), dealing 1\\.6. damage, and weak to (.+?), ` +
      `which deals? 1\\.6. to it\\. (.+?) resist ${el} down to 0\\.625`,
    ).exec(flat);
    if (!prose) continue;
    parsedAny = true;

    const strong = mentioned(prose[1]);
    const weakTo = mentioned(prose[2]);
    // "Water, Earth, Light and another Fire resist Fire" - the self-resist is
    // spelled "another <element>".
    const resistText = prose[3].replace(new RegExp(`another ${el}`), el);
    const resistedBy = mentioned(resistText);

    const ours = chart.elements[el];
    const cmp = (a, b) => [...a].sort().join(',') === [...b].sort().join(',');

    if (!cmp(strong, ours.strongAgainst)) {
      differences.push(`${el} strongAgainst: ours=[${ours.strongAgainst}] source=[${strong}]`);
    }
    if (!cmp(resistedBy, ours.resistedBy)) {
      differences.push(`${el} resistedBy: ours=[${ours.resistedBy}] source=[${resistedBy}]`);
    }
    // Weaknesses are the mirror of everyone else's strengths; this catches a
    // one-sided edit to either column.
    const derived = names.filter((a) => chart.elements[a].strongAgainst.includes(el));
    if (!cmp(weakTo, derived)) {
      differences.push(`${el} weakTo: derived=[${derived}] source=[${weakTo}]`);
    }
  }

  if (!parsedAny) {
    return { ok: false, reason: 'element page layout changed; prose matchups not found', source: SOURCE };
  }

  // Second, independent check: the page's own coverage tally.
  for (const el of names) {
    const row = new RegExp(`\\|${el}\\|(\\d)\\|(\\d)\\|`).exec(piped);
    if (!row) continue;
    const ours = chart.elements[el];
    if (Number(row[1]) !== ours.strongAgainst.length) {
      differences.push(`${el} coverage hits: ours=${ours.strongAgainst.length} source=${row[1]}`);
    }
    if (Number(row[2]) !== ours.resistedBy.length) {
      differences.push(`${el} coverage resisted: ours=${ours.resistedBy.length} source=${row[2]}`);
    }
  }

  return { ok: differences.length === 0, source: SOURCE, differences };
}
