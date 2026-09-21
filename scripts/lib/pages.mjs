/**
 * The body of each prerendered page.
 *
 * Written for extraction, not for decoration. Every page leads with plain
 * sentences that answer the question its URL implies ("Fire is weak to Water
 * and Earth") before it shows a table, because that sentence is what an AI
 * answer engine quotes and what Google pulls into a snippet. The tables are
 * real <table> markup with scoped headers so the numbers survive being read by
 * something that never paints a pixel.
 *
 * On the look: no element or multiplier colour is written into markup here.
 * An element carries data-el and a number carries data-verdict; the stylesheet
 * turns those into the tint, the border and the glow. See section 2 and 10 of
 * src/aniimo-dark.css.
 */
import { BANDS, band, formatMultiplier, moveElements, displayName, paths } from './matchups.mjs';
import { esc, list, elChip, elPlate, roleChip, roleBadge, roleLabel, verdictAttr, crumbs, hero, oneLine } from './html.mjs';
import { abs, SITE_NAME } from './site.mjs';

const pct = (n) => formatMultiplier(n);

/* ------------------------------------------------------------------ pieces */

/** The 9x9 grid. Rows attack, columns defend. */
function matrixTable(chart) {
  // Full names rather than the app's four-letter abbreviations: "Lightning"
  // and "Light" both cut down to "Ligh", which a reader with no colour cue
  // cannot tell apart. The wrapper scrolls if the row is too wide.
  const head = chart.order
    .map(
      (d) =>
        `<th scope="col"><span class="matrix-table__head">${elPlate(d, 'xs')}<span>${esc(d)}</span></span></th>`,
    )
    .join('');

  const rows = chart
    .matrix()
    .map(
      (row) =>
        `<tr><th scope="row">${elChip(row.element)}</th>${row.cells
          .map((c) => {
            const neutral = band(c.multiplier).key === 'x1';
            const text = neutral ? '·' : pct(c.multiplier);
            return `<td${verdictAttr(c.multiplier)}><span title="${esc(row.element)} → ${esc(c.element)}: ${esc(pct(c.multiplier))}">${text}</span></td>`;
          })
          .join('')}</tr>`,
    )
    .join('\n');

  return `<div class="table-scroll"><table class="matrix-table">
<caption>Damage multiplier for each attacking element against each defending element. Rows attack, columns defend.</caption>
<thead><tr><th scope="col">Atk ╲ Def</th>${head}</tr></thead>
<tbody>${rows}</tbody></table></div>
${legend()}`;
}

const legend = () => `<div class="legend">
<span data-verdict="bad"><b></b>1.6× super effective</span>
<span data-verdict="flat"><b></b>1× neutral</span>
<span data-verdict="good"><b></b>0.625× resisted</span>
</div>`;

/** Incoming damage: what every attacking element does to this defender. */
function spreadTable(chart, up, defenders, caption) {
  const rows = chart
    .defenceSpread(defenders)
    .map((m) => {
      const v = verdictAttr(m.multiplier);
      return `<tr${v}><th scope="row">${elChip(m.element, `${up}${paths.element(m.element)}`)}</th>
<td class="num">${esc(pct(m.multiplier))}</td>
<td><span class="mult-pill"${v}>${esc(band(m.multiplier).blurb)}</span></td></tr>`;
    })
    .join('\n');

  return `<table class="data-table"><caption>${esc(caption)}</caption>
<thead><tr><th scope="col">Attacking element</th><th scope="col" class="num">Damage</th><th scope="col">Result</th></tr></thead>
<tbody>${rows}</tbody></table>`;
}

/** Outgoing damage: what this attacking element does to each single defender. */
function offenceTable(chart, up, attacker) {
  const rows = chart
    .attackSpread(attacker)
    .map((m) => {
      const v = verdictAttr(m.multiplier);
      return `<tr${v}><th scope="row">${elChip(m.element, `${up}${paths.element(m.element)}`)}</th>
<td class="num">${esc(pct(m.multiplier))}</td>
<td><span class="mult-pill"${v}>${esc(band(m.multiplier).blurb)}</span></td></tr>`;
    })
    .join('\n');

  return `<table class="data-table"><caption>What ${esc(attacker)} moves deal to each defending element.</caption>
<thead><tr><th scope="col">Defending element</th><th scope="col" class="num">Damage</th><th scope="col">Result</th></tr></thead>
<tbody>${rows}</tbody></table>`;
}

/**
 * Collapsible Q&A plus the matching FAQPage payload.
 *
 * <details> rather than a scripted accordion: the header's FAQ link lands here
 * and has to open with scripting off.
 */
function faq(items) {
  const html = items
    .map((i) => `<details><summary>${esc(i.q)}</summary><p>${i.aHtml ?? esc(i.a)}</p></details>`)
    .join('\n');

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((i) => ({
      '@type': 'Question',
      name: i.q,
      acceptedAnswer: { '@type': 'Answer', text: oneLine(i.a) },
    })),
  };

  return {
    html: `<h2>Common questions</h2>\n<div class="faq--details">${html}</div>`,
    jsonLd,
  };
}

const breadcrumbs = (trail) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: trail.map((t, i) => ({
    '@type': 'ListItem',
    position: i + 1,
    name: t.name,
    item: abs(t.rel),
  })),
});

const rosterList = (up, aniimo) =>
  `<ul class="roster">${aniimo
    .map((a) => `<li><a href="${up}${paths.aniimo(a)}">${esc(displayName(a))}</a></li>`)
    .join('')}</ul>`;

/**
 * One Aniimo tile: art with its element and role badges pinned to it, the
 * number and name, and a five-column bar - one column per damage band - whose
 * icons say which elements land where. Nothing is hidden behind a hover.
 *
 * This is the static twin of <Tile> in src/components/AniimoGrid.tsx, which
 * replaces it once the app boots. Same classes, same nesting, same order - the
 * `.tile` block in src/aniimo-site.css paints both, and the two have to be
 * edited together.
 *
 * The bar is a picture of the numbers, so it is aria-hidden and the same facts
 * are given once in a sentence beside it. The table further down the roster
 * page states them again in plain view.
 */
export function aniimoTile(chart, up, a) {
  const src = a.head ?? a.image;

  const column = ({ band: b, entries }) => `<span class="tile__band"${verdictAttr(b.mult)}>
<span class="tile__bandMult">${esc(b.label)}</span>
<span class="tile__bandEls">${
    entries.length
      ? entries.map((e) => elPlate(e.element, 'xxs')).join('')
      : '<span class="tile__bandNone">·</span>'
  }</span></span>`;

  return `<a class="tile" data-el="${esc(String(a.elements[0] ?? '').toLowerCase())}" href="${up}${paths.aniimo(a)}">
<span class="tile__figure">
${
    src
      ? `<img class="tile__art" src="${esc(src)}" alt="" width="64" height="64" loading="lazy" decoding="async" referrerpolicy="no-referrer">`
      : `<span class="tile__art">${esc(a.name.slice(0, 2))}</span>`
  }
<span class="tile__els">${a.elements.map((el) => elPlate(el, 'xs')).join('')}</span>
${a.roles.map(roleBadge).join('')}
<span class="sr-only">${esc(a.elements.join('/'))} type${
    a.roles.length ? `, ${esc(a.roles.map(roleLabel).join(' and '))} role` : ''
  }.</span>
</span>
${a.number ? `<span class="tile__no">No. ${esc(a.number)}</span>` : ''}
<span class="tile__name">${esc(displayName(a))}</span>
<span class="sr-only">${esc(spokenSpread(chart, a.elements))}</span>
<span class="tile__spread" aria-hidden="true">${chart.spreadByBand(a.elements).map(column).join('')}</span>
</a>`;
}

/**
 * What the five columns on every tile mean, said once above the grid rather
 * than 226 times inside it. Mirrored by <TileLegend> in
 * src/components/AniimoGrid.tsx.
 */
const tileLegend = () => `<p class="tile-legend">
<span>Each tile's bar reads left to right, most damage taken to least:</span>
${BANDS.map((b) => `<span${verdictAttr(b.mult)}><b>${esc(b.label)}</b> ${esc(b.blurb.toLowerCase())}</span>`).join('')}
</p>`;

/**
 * What the spread bar says, in a sentence. Mirrored by spokenSpread() in
 * src/components/AniimoGrid.tsx.
 */
function spokenSpread(chart, elements) {
  const { most, least } = chart.extremes(elements);
  const one = (e) => (e.elements.length ? `${e.label} ${list(e.elements)} at ${formatMultiplier(e.multiplier)}.` : '');
  return `${one(most)} ${one(least)}`.trim();
}

/** The FAQ card. Carries the id the header's FAQ link points at. */
const faqSection = (q) => `<section class="card card--flow" id="faq">${q.html}</section>`;

/** The one-line "this element at a glance" facts, reused in prose and tables. */
export function elementFacts(chart, el) {
  return {
    weakTo: chart.weakTo(el),
    resists: chart.resists(el),
    strongAgainst: chart.strongAgainst(el),
    resistedBy: chart.resistedBy(el),
  };
}

/* ------------------------------------------------------------------- pages */

export function homePage({ chart, roster, meta, up }) {
  const rows = chart.order
    .map((el) => {
      const f = elementFacts(chart, el);
      const href = `${up}${paths.element(el)}`;
      const chips = (els) =>
        `<span class="glance__chips">${els.map((e) => elChip(e, `${up}${paths.element(e)}`)).join('')}</span>`;
      return `<tr>
<td data-label="Element"><span class="glance__el">${elPlate(el, 'sm')}<a href="${esc(href)}">${esc(el)}</a></span></td>
<td data-label="Weak to">${chips(f.weakTo)}</td>
<td data-label="Resists">${chips(f.resists)}</td>
<td data-label="Strong against">${chips(f.strongAgainst)}</td>
</tr>`;
    })
    .join('\n');

  const q = faq([
    {
      q: 'How does type effectiveness work in Aniimo?',
      a: `Aniimo uses three damage bands read attacker to defender. A super-effective hit deals 1.6x damage, a resisted hit deals 0.625x, and everything else deals 1x. There is no immunity and nothing deals 0 damage.`,
    },
    {
      q: 'What happens against a dual-element Aniimo?',
      a: `Both halves are read at once and the two multipliers are multiplied together. That gives five possible results: 2.56x when the attack is strong against both elements, 1.6x, 1x, 0.625x, and 0.39x when both halves resist it.`,
    },
    {
      q: 'How many elements does Aniimo have?',
      a: `Nine: ${list(chart.order)}. Every element resists itself except Dark, and Dark and Light are the only pair that hit each other for 1.6x.`,
    },
    {
      q: 'Does an Aniimo only use moves of its own element?',
      a: `No, and this is the trap. Move elements are independent of the Aniimo's own typing. Fire Emberpup carries the Earth move Pebble Kick, and Water/Ice Glacy carries the Light move Glimmer Shot, so both cover matchups their typing does not suggest. The calculator scores offence from the moves an Aniimo actually has.`,
    },
    {
      q: 'Is the strongest multiplier always the best move?',
      a: `No. Effective damage is move power multiplied by the matchup, and a high-power resisted move often beats a weak super-effective one. The calculator ranks an Aniimo's moves by power times multiplier against the exact defender you pick, which is why the super-effective option sometimes comes last.`,
    },
  ]);

  const body = `${hero(`<h1>Aniimo type effectiveness chart and weakness calculator</h1>
<p class="lede">Pick an element pairing, or search any of the ${meta.counts.forms} Aniimo forms, and see exactly
what hits it hardest — and what its own moves can hit back.</p>

<div class="answer">
<p><strong>Aniimo has nine elements:</strong> ${list(chart.order)}.</p>
<p><strong>The multipliers are 1.6× (super effective), 1× (neutral) and 0.625× (resisted).</strong>
Nothing is immune and nothing deals zero damage.</p>
<p><strong>Against a dual-element Aniimo both matchups multiply</strong>, so the range widens to
2.56× at best and 0.39× at worst.</p>
</div>

<p><a class="btn btn--primary" href="${up}chart/">See the full 9×9 chart</a></p>`)}

<main class="page page--narrow section">
<section class="card">
<div class="card__head"><h2>Every Aniimo element at a glance</h2></div>
<div class="card__body">
<p class="muted">Weak to means that element deals 1.6× to it. Resists means it takes 0.625×.</p>
<div class="table-scroll"><table class="glance">
<thead><tr><th scope="col">Element</th><th scope="col">Weak to (takes 1.6×)</th><th scope="col">Resists (takes 0.625×)</th><th scope="col">Strong against (deals 1.6×)</th></tr></thead>
<tbody>${rows}</tbody></table></div>
</div>
</section>

<section class="card card--flow">
<h2>The full element chart</h2>
<p class="muted">Rows attack, columns defend. Read across a row to see what that element does to everything else.</p>
${matrixTable(chart)}
</section>

<section class="card card--flow">
<h2>Look up a single element</h2>
<div class="chips">${chart.order.map((el) => elChip(el, `${up}${paths.element(el)}`)).join('')}</div>
<h3>Or a dual-element pairing</h3>
<ul class="roster">${chart
    .pairs()
    .filter(([a, b]) => roster.some((r) => r.elements.length === 2 && r.elements.includes(a) && r.elements.includes(b)))
    .map(([a, b]) => `<li><a href="${up}${paths.dual(chart.order, a, b)}">${esc(a)} / ${esc(b)}</a></li>`)
    .join('')}</ul>
<h3>Or a specific Aniimo</h3>
<p><a class="btn btn--primary" href="${up}aniimo/">All ${meta.counts.forms} Aniimo and their weaknesses</a></p>
<p class="muted">Every form as a tile, including regional and Prismana variants, with what deals it the most
damage and what it resists.</p>
</section>

${faqSection(q)}
</main>`;

  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: SITE_NAME,
      alternateName: 'Aniimo Type Effectiveness Calculator',
      url: abs(''),
      applicationCategory: 'GameApplication',
      operatingSystem: 'Any',
      browserRequirements: 'Requires JavaScript for the interactive calculator.',
      description:
        'Element matchup calculator for Aniimo: the defensive spread for any element pairing, plus what each Aniimo’s own moves can hit.',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      isAccessibleForFree: true,
      inLanguage: 'en',
      about: { '@type': 'VideoGame', name: 'Aniimo' },
    },
    q.jsonLd,
  ];

  return { body, jsonLd };
}

export function chartPage({ chart, meta, up }) {
  const prose = chart.order
    .map((el) => {
      const f = elementFacts(chart, el);
      const neutral = chart.order.filter(
        (d) => !f.strongAgainst.includes(d) && !f.resistedBy.includes(d),
      );
      return `<li><strong>${esc(el)}</strong> deals 1.6× to ${esc(list(f.strongAgainst))},
0.625× to ${esc(list(f.resistedBy))}${neutral.length ? `, and 1× to ${esc(list(neutral))}` : ''}.
It takes 1.6× from ${esc(list(f.weakTo))} and 0.625× from ${esc(list(f.resists))}.</li>`;
    })
    .join('\n');

  const q = faq([
    {
      q: 'How do you read the Aniimo element chart?',
      a: 'Rows are the attacking element and columns are the defending element. The cell where they meet is the damage multiplier the attacker deals: 1.6x super effective, 1x neutral, 0.625x resisted.',
    },
    {
      q: 'Is the Aniimo element chart symmetrical?',
      a: 'No, it is directional. Lightning deals 1.6x to Water but Water deals 1x back. Dark and Light are the only pair that hit each other for 1.6x in both directions.',
    },
    {
      q: 'Do elements resist themselves in Aniimo?',
      a: 'Every element resists itself for 0.625x except Dark, which takes neutral damage from Dark.',
    },
  ]);

  const body = `${hero(`${crumbs([{ name: 'Home', href: up }, { name: 'Element chart' }])}
<h1>Aniimo element chart</h1>
<p class="lede">The full 9×9 grid of damage multipliers. Rows attack, columns defend.</p>
<div class="answer">
<p>A super-effective hit deals <strong>1.6×</strong>, a resisted hit <strong>0.625×</strong>, everything else <strong>1×</strong>.
Against a dual-element defender the two multipliers are multiplied, giving <strong>2.56×</strong>, 1.6×, 1×, 0.625× or <strong>0.39×</strong>.</p>
</div>`)}

<main class="page page--narrow section">
<section class="card card--flow" data-app-owns>
${matrixTable(chart)}
</section>

<section class="card card--flow">
<h2>Every matchup in words</h2>
<div class="prose"><ul>${prose}</ul></div>
</section>

${faqSection(q)}
</main>`;

  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'Dataset',
      name: 'Aniimo element effectiveness chart',
      description:
        'Damage multipliers for all nine Aniimo elements, attacker against defender: 1.6x super effective, 1x neutral, 0.625x resisted.',
      url: abs(paths.chart),
      license: 'https://creativecommons.org/licenses/by/4.0/',
      isAccessibleForFree: true,
      creator: { '@type': 'Person', name: 'Manuel Graf' },
      dateModified: meta.generatedAt,
      variableMeasured: 'damage multiplier',
      about: { '@type': 'VideoGame', name: 'Aniimo' },
    },
    breadcrumbs([
      { name: 'Home', rel: paths.home },
      { name: 'Element chart', rel: paths.chart },
    ]),
    q.jsonLd,
  ];

  return { body, jsonLd };
}

export function elementPage({ chart, el, roster, up }) {
  const f = elementFacts(chart, el);
  const mine = roster.filter((a) => a.elements.includes(el));
  const pure = roster.filter((a) => a.elements.length === 1 && a.elements[0] === el);

  const partners = chart.order
    .filter((o) => o !== el)
    .filter((o) => roster.some((a) => a.elements.length === 2 && a.elements.includes(el) && a.elements.includes(o)));

  const q = faq([
    {
      q: `What is ${el} weak to in Aniimo?`,
      a: `${el} Aniimo take 1.6x damage from ${list(f.weakTo)}. Those are the only elements that are super effective against a pure ${el} defender.`,
    },
    {
      q: `What does ${el} resist in Aniimo?`,
      a: `${el} takes only 0.625x damage from ${list(f.resists)}. Everything else deals neutral 1x damage.`,
    },
    {
      q: `What is ${el} strong against in Aniimo?`,
      a: `${el} moves deal 1.6x damage to ${list(f.strongAgainst)}, and are resisted down to 0.625x by ${list(f.resistedBy)}.`,
    },
    {
      q: `How much damage does ${el} take from a dual-element attack?`,
      a: `A ${el} Aniimo with a second element multiplies both matchups. Against a dual ${el} defender an attack can reach 2.56x if it is super effective against both halves, or drop to 0.39x if both halves resist it.`,
    },
  ]);

  const body = `${hero(`${crumbs([{ name: 'Home', href: up }, { name: 'Element chart', href: `${up}chart/` }, { name: el }])}
<div class="form-hero">
${elPlate(el, 'lg')}
<div class="form-hero__body">
<h1>${esc(el)} type effectiveness in Aniimo</h1>
<p class="muted">${mine.length} Aniimo forms carry the ${esc(el)} element${pure.length !== mine.length ? `, ${pure.length} of them as a pure ${esc(el)} type` : ''}.</p>
</div>
</div>

<div class="answer">
<p><strong>${esc(el)} is weak to ${esc(list(f.weakTo))}</strong> — those deal 1.6× to it.</p>
<p><strong>${esc(el)} resists ${esc(list(f.resists))}</strong>, taking only 0.625×.</p>
<p><strong>${esc(el)} moves are strong against ${esc(list(f.strongAgainst))}</strong> (1.6×) and are resisted by ${esc(list(f.resistedBy))} (0.625×).</p>
</div>

<p data-app-owns><a class="btn btn--primary" href="${up}#/defense/${el.toLowerCase()}">Open this in the calculator</a></p>`)}

<main class="page page--narrow section">
<div class="cols" data-app-owns>
<section class="card card--flow">
<h2>Damage taken by a ${esc(el)} Aniimo</h2>
${spreadTable(chart, up, [el], `What each attacking element deals to a pure ${el} defender.`)}
</section>

<section class="card card--flow">
<h2>Damage dealt by ${esc(el)} moves</h2>
${offenceTable(chart, up, el)}
</section>
</div>

${
  partners.length
    ? `<section class="card card--flow">
<h2>${esc(el)} dual-element pairings</h2>
<p class="muted">Both matchups multiply, so a dual type can take 2.56× or as little as 0.39×.</p>
<ul class="roster">${partners
        .map(
          (o) =>
            `<li><a href="${up}${paths.dual(chart.order, el, o)}">${esc(el)} / ${esc(o)}</a></li>`,
        )
        .join('')}</ul>
</section>`
    : ''
}

<section class="card card--flow">
<h2>Every ${esc(el)} Aniimo</h2>
${mine.length ? rosterList(up, mine) : '<p class="muted">No Aniimo currently carries this element.</p>'}
</section>

${faqSection(q)}
</main>`;

  const jsonLd = [
    breadcrumbs([
      { name: 'Home', rel: paths.home },
      { name: 'Element chart', rel: paths.chart },
      { name: el, rel: paths.element(el) },
    ]),
    q.jsonLd,
  ];

  return { body, jsonLd, facts: f, count: mine.length };
}

export function dualPage({ chart, a, b, roster, up }) {
  const defenders = [a, b];
  const spread = chart.defenceSpread(defenders);
  const grouped = (key) => spread.filter((m) => band(m.multiplier).key === key).map((m) => m.element);

  const quad = grouped('x256');
  const dbl = grouped('x16');
  const neutral = grouped('x1');
  const res = grouped('x0625');
  const res2 = grouped('x039');

  const mine = roster.filter(
    (r) => r.elements.length === 2 && r.elements.includes(a) && r.elements.includes(b),
  );

  const worst = [...quad, ...dbl];

  const q = faq([
    {
      q: `What is a ${a}/${b} Aniimo weak to?`,
      a: worst.length
        ? `A ${a}/${b} Aniimo takes the most damage from ${list(worst)}.${quad.length ? ` ${list(quad)} hit both halves for a full 2.56x.` : ''}`
        : `Nothing is super effective against a ${a}/${b} Aniimo. The best any element manages is neutral 1x damage, which makes the pairing unusually hard to punish.`,
    },
    {
      q: `What does a ${a}/${b} Aniimo resist?`,
      a: [res2.length ? `${list(res2)} are resisted twice, down to 0.39x.` : '', res.length ? `${list(res)} deal 0.625x.` : '']
        .filter(Boolean)
        .join(' ') || `A ${a}/${b} Aniimo resists nothing; every element deals at least neutral damage.`,
    },
    {
      q: `How are dual-element multipliers calculated in Aniimo?`,
      a: `The attack is scored against each half of the defender and the two results are multiplied. Super effective against both halves is 1.6 x 1.6 = 2.56x; resisted by both is 0.625 x 0.625 = 0.39x.`,
    },
  ]);

  const answerLines = [
    quad.length
      ? `<p><strong>${esc(list(quad))} deal 2.56×</strong> — they are super effective against both halves.</p>`
      : '',
    dbl.length ? `<p><strong>${esc(list(dbl))} deal 1.6×.</strong></p>` : '',
    !worst.length
      ? `<p><strong>Nothing is super effective against ${esc(a)}/${esc(b)}.</strong> The best any element manages is neutral 1×.</p>`
      : '',
    res2.length ? `<p><strong>${esc(list(res2))} are resisted twice, down to 0.39×.</strong></p>` : '',
    res.length ? `<p>${esc(list(res))} deal 0.625×.</p>` : '',
    neutral.length ? `<p class="muted">${esc(list(neutral))} deal neutral 1× damage.</p>` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const body = `${hero(`${crumbs([{ name: 'Home', href: up }, { name: 'Element chart', href: `${up}chart/` }, { name: `${a} / ${b}` }])}
<div class="form-hero">
${elPlate(a, 'lg')}${elPlate(b, 'lg')}
<div class="form-hero__body">
<h1>${esc(a)} / ${esc(b)} type effectiveness in Aniimo</h1>
<div class="chips">${elChip(a, `${up}${paths.element(a)}`)}${elChip(b, `${up}${paths.element(b)}`)}</div>
</div>
</div>

<div class="answer">${answerLines}</div>

<p class="muted">A dual-element defender is scored against both halves and the two multipliers are multiplied together.</p>
<p data-app-owns><a class="btn btn--primary" href="${up}#/defense/${a.toLowerCase()}+${b.toLowerCase()}">Open this in the calculator</a></p>`)}

<main class="page page--narrow section">
<section class="card card--flow" data-app-owns>
<h2>Damage taken by a ${esc(a)}/${esc(b)} Aniimo</h2>
${spreadTable(chart, up, defenders, `What each attacking element deals to a ${a}/${b} defender.`)}
</section>

<section class="card card--flow">
<h2>${esc(a)}/${esc(b)} Aniimo</h2>
${
  mine.length
    ? rosterList(up, mine)
    : `<p class="muted">No Aniimo currently has this exact pairing. The table above still applies to any future ${esc(a)}/${esc(b)} form.</p>`
}
<p class="muted">See also <a href="${up}${paths.element(a)}">${esc(a)}</a> and <a href="${up}${paths.element(b)}">${esc(b)}</a> on their own.</p>
</section>

${faqSection(q)}
</main>`;

  const jsonLd = [
    breadcrumbs([
      { name: 'Home', rel: paths.home },
      { name: 'Element chart', rel: paths.chart },
      { name: `${a} / ${b}`, rel: paths.dual(chart.order, a, b) },
    ]),
    q.jsonLd,
  ];

  return { body, jsonLd, worst, res: [...res, ...res2], count: mine.length };
}

export function aniimoPage({ chart, aniimo, roster, up }) {
  const name = displayName(aniimo);
  const els = aniimo.elements;
  const spread = chart.defenceSpread(els);
  const top = band(spread[0].multiplier);
  const worst = spread.filter((m) => band(m.multiplier).key === top.key).map((m) => m.element);
  const resisted = spread
    .filter((m) => ['x0625', 'x039'].includes(band(m.multiplier).key))
    .map((m) => m.element);

  const moves = aniimo.skills.filter((s) => s.offensive && s.element);
  const covers = moveElements(aniimo);

  // What the moves it actually has can reach, best multiplier per defender.
  const coverage = chart.order
    .map((d) => {
      let best = 0;
      let via = [];
      for (const e of covers) {
        const m = chart.pair(e, d);
        if (m > best) {
          best = m;
          via = [e];
        } else if (m === best) via.push(e);
      }
      return { defender: d, multiplier: covers.length ? best : 1, via };
    })
    .sort((x, y) => y.multiplier - x.multiplier || chart.order.indexOf(x.defender) - chart.order.indexOf(y.defender));

  const canHit = coverage.filter((c) => c.multiplier > 1.5).map((c) => c.defender);

  const otherForms = roster.filter((a) => a.name === aniimo.name && a.id !== aniimo.id);

  const movesTable = moves.length
    ? `<div class="table-scroll"><table class="data-table">
<caption>Every attacking move ${esc(name)} has, with the element that scores the matchup.</caption>
<thead><tr><th scope="col">Move</th><th scope="col">Element</th><th scope="col" class="num">Power</th><th scope="col">Strong against</th></tr></thead>
<tbody>${moves
        .map(
          (s) => `<tr><th scope="row">${esc(s.name)}</th>
<td>${elChip(s.element, `${up}${paths.element(s.element)}`)}</td>
<td class="num">${s.power ?? '—'}</td>
<td class="muted">${esc(list(chart.strongAgainst(s.element)))}</td></tr>`,
        )
        .join('\n')}</tbody></table></div>`
    : `<p class="muted">No element-tagged attacking moves are recorded for ${esc(name)}.</p>`;

  const coverageTable = covers.length
    ? `<table class="data-table"><caption>The best multiplier ${esc(name)} can reach against each defending element, using the move elements it actually has.</caption>
<thead><tr><th scope="col">Defender</th><th scope="col" class="num">Best</th><th scope="col">With</th></tr></thead>
<tbody>${coverage
        .map((c) => {
          const v = verdictAttr(c.multiplier);
          return `<tr${v}><th scope="row">${elChip(c.defender, `${up}${paths.element(c.defender)}`)}</th>
<td class="num">${esc(pct(c.multiplier))}</td>
<td class="muted">${esc(c.via.join(', ') || '—')}</td></tr>`;
        })
        .join('\n')}</tbody></table>`
    : '';

  const q = faq([
    {
      q: `What is ${name} weak to in Aniimo?`,
      a: `${name} is ${els.join('/')} type and takes the most damage from ${list(worst)} (${pct(spread[0].multiplier)}).`,
    },
    {
      q: `What does ${name} resist?`,
      a: resisted.length
        ? `${name} resists ${list(resisted)}, taking 0.625x or less from them.`
        : `${name} resists nothing; every element deals at least neutral damage to it.`,
    },
    {
      q: `What can ${name} hit hard?`,
      a: covers.length
        ? `${name} has ${covers.length === 1 ? 'one move element' : `${covers.length} move elements`} — ${list(covers)} — which ${canHit.length ? `covers ${list(canHit)} for 1.6x` : 'does not reach a super-effective matchup against any single element'}.`
        : `No element-tagged attacking moves are recorded for ${name}.`,
    },
  ]);

  const statsBlock = aniimo.stats
    ? `<dl class="stats">${[
        ['HP', aniimo.stats.hp],
        ['P.ATK', aniimo.stats.physicalAttack],
        ['M.ATK', aniimo.stats.magicAttack],
        ['P.DEF', aniimo.stats.physicalDefense],
        ['M.DEF', aniimo.stats.magicDefense],
        ['Haste', aniimo.stats.haste],
        ['Total', aniimo.stats.total],
      ]
        .map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`)
        .join('')}</dl>`
    : '';

  const body = `${hero(`${crumbs([{ name: 'Home', href: up }, { name: 'All Aniimo', href: `${up}aniimo/` }, { name }])}
<div class="form-hero">
${aniimo.image ? `<img class="form-hero__art" src="${esc(aniimo.image)}" alt="${esc(name)}" loading="lazy" decoding="async" referrerpolicy="no-referrer" width="108" height="108">` : elPlate(els[0], 'lg')}
<div class="form-hero__body">
<h1>${esc(name)} weaknesses and type effectiveness</h1>
<div class="form-hero__meta">
${aniimo.number ? `<span class="form-hero__no">No. ${esc(aniimo.number)}</span>` : ''}
<span class="muted">${esc(aniimo.morphology)}${aniimo.stage ? ` · ${esc(aniimo.stage)} stage` : ''}</span>
</div>
<div class="chips">${els.map((e) => elChip(e, `${up}${paths.element(e)}`)).join('')}${aniimo.roles.map(roleChip).join('')}</div>
</div>
</div>

<div class="answer">
<p><strong>${esc(name)} is ${esc(els.join('/'))} type.</strong></p>
<p><strong>It takes the most damage from ${esc(list(worst))}</strong> (${esc(pct(spread[0].multiplier))}).</p>
<p>${resisted.length ? `It resists ${esc(list(resisted))}.` : 'It resists nothing — every element deals at least neutral damage.'}</p>
${covers.length ? `<p><strong>Its own moves cover ${esc(list(covers))}</strong>${canHit.length ? `, which hits ${esc(list(canHit))} for 1.6×` : ''}.</p>` : ''}
</div>

${aniimo.description ? `<p class="lede">${esc(aniimo.description)}</p>` : ''}
${statsBlock}
<p data-app-owns><a class="btn btn--primary" href="${up}#/aniimo/${esc(aniimo.id)}">Open ${esc(aniimo.name)} in the calculator</a></p>`)}

<main class="page page--narrow section">
<section class="card card--flow" data-app-owns>
<h2>Damage ${esc(name)} takes</h2>
${spreadTable(chart, up, els, `What each attacking element deals to ${name}.`)}
</section>

<section class="card card--flow" data-app-owns>
<h2>What ${esc(name)} can hit</h2>
<p class="muted">Scored from the elements its moves actually have, not from its own typing.</p>
${movesTable}
${coverageTable}
</section>

${
  otherForms.length
    ? `<section class="card card--flow">
<h2>Other ${esc(aniimo.name)} forms</h2>
${rosterList(up, otherForms)}
</section>`
    : ''
}

${
  aniimo.habitats.length
    ? `<section class="card card--flow">
<h2>Where to find ${esc(aniimo.name)}</h2>
<div class="prose"><p>${esc(list(aniimo.habitats))}.</p></div>
</section>`
    : ''
}

${faqSection(q)}
</main>`;

  const jsonLd = [
    breadcrumbs([
      { name: 'Home', rel: paths.home },
      { name: 'All Aniimo', rel: paths.roster },
      { name, rel: paths.aniimo(aniimo) },
    ]),
    q.jsonLd,
  ];

  // Kept deliberately short: the resistance list can run to five elements,
  // which pushes the whole line past what a search result will show.
  const description =
    `${name} is a ${els.join('/')} Aniimo and takes ${pct(spread[0].multiplier)} from ${list(worst)}. ` +
    `Full matchup table, move coverage and stats.`;

  return { body, jsonLd, description, worst, spread };
}

export function rosterPage({ chart, roster, meta, up }) {
  const byElement = chart.order
    .map((el) => ({ el, list: roster.filter((a) => a.elements.includes(el)) }))
    .filter((g) => g.list.length);

  const alphabetical = [...roster].sort((a, b) => displayName(a).localeCompare(displayName(b)));
  const byNumber = [...roster].sort(
    (a, b) => String(a.number ?? '').localeCompare(String(b.number ?? '')) || a.name.localeCompare(b.name),
  );

  const duals = roster.filter((a) => a.elements.length === 2);

  /* The two aggregates worth stating outright. An answer engine asked "what is
     the best attacking element in Aniimo" has nothing to quote unless the
     count is written down somewhere, and this is the page that can count. */
  const coverage = chart.order
    .map((attacker) => ({
      attacker,
      hits: roster.filter((a) => chart.against(attacker, a.elements) > 1).length,
      quad: roster.filter((a) => band(chart.against(attacker, a.elements)).key === 'x256').length,
    }))
    .sort((x, y) => y.hits - x.hits || chart.order.indexOf(x.attacker) - chart.order.indexOf(y.attacker));

  const bestAttacker = coverage[0];
  const commonest = [...byElement].sort((x, y) => y.list.length - x.list.length)[0];

  const coverageTable = `<table class="data-table">
<caption>How many of the ${roster.length} forms each attacking element is super effective against, counting both halves of a dual.</caption>
<thead><tr><th scope="col">Attacking element</th><th scope="col" class="num">Forms hit</th><th scope="col" class="num">Of those, 2.56x</th></tr></thead>
<tbody>${coverage
    .map(
      (c) => `<tr><th scope="row">${elChip(c.attacker, `${up}${paths.element(c.attacker)}`)}</th>
<td class="num">${c.hits}</td>
<td class="num">${c.quad || '—'}</td></tr>`,
    )
    .join('\n')}</tbody></table>`;

  /* The extraction target. Every form, its typing, what hits it hardest and
     what it shrugs off, in one plain table that needs no icon-reading and no
     JavaScript. This is the part of the page an AI answer is built from. */
  const weaknessTable = `<div class="table-scroll"><table class="data-table">
<caption>Every Aniimo form with the elements that deal it the most and the least damage.</caption>
<thead><tr><th scope="col">Aniimo</th><th scope="col">Element</th><th scope="col">Takes most damage from</th><th scope="col">Resists</th></tr></thead>
<tbody>${alphabetical
    .map((a) => {
      const { most, least } = chart.extremes(a.elements);
      const cell = (e) =>
        e.elements.length
          ? `<span class="cell-mult"${verdictAttr(e.multiplier)}>${esc(formatMultiplier(e.multiplier))}</span> ${esc(list(e.elements))}`
          : '<span class="muted">—</span>';
      return `<tr><th scope="row"><a href="${up}${paths.aniimo(a)}">${esc(displayName(a))}</a>${
        a.number ? ` <span class="tile__no">No. ${esc(a.number)}</span>` : ''
      }</th>
<td>${a.elements.map((el) => elChip(el, `${up}${paths.element(el)}`)).join('')}</td>
<td>${cell(most)}</td>
<td>${cell(least)}</td></tr>`;
    })
    .join('\n')}</tbody></table></div>`;

  const q = faq([
    {
      q: 'How many Aniimo are there?',
      a: `${meta.counts.forms} forms are currently documented, counting regional and Prismana variants as separate forms. ${duals.length} of them carry two elements.`,
    },
    {
      q: 'What is the best attacking element in Aniimo?',
      a: `${bestAttacker.attacker} is super effective against the most forms — ${bestAttacker.hits} of ${roster.length}${bestAttacker.quad ? `, ${bestAttacker.quad} of them for a full 2.56x` : ''}. Coverage is only half the story though: an Aniimo attacks with the elements its moves have, not with its own typing, so what it can actually reach depends on its move list.`,
    },
    {
      q: 'Which Aniimo take 2.56x damage?',
      a: `Only dual-element forms can. An attack that is super effective against both halves is multiplied twice, 1.6 x 1.6 = 2.56x, and ${duals.length} of the ${roster.length} forms are dual-element. A single-element Aniimo never takes more than 1.6x.`,
    },
    {
      q: 'Which element do the most Aniimo have?',
      a: `${commonest.el}, with ${commonest.list.length} forms. Every element has at least one.`,
    },
    {
      q: 'Can an Aniimo be immune to an element?',
      a: `No. Aniimo has no immunities; the lowest any matchup goes is 0.39x, which needs both halves of a dual-element form to resist the same attack.`,
    },
  ]);

  const body = `${hero(`${crumbs([{ name: 'Home', href: up }, { name: 'All Aniimo' }])}
<h1>All ${meta.counts.forms} Aniimo and their weaknesses</h1>
<p class="lede">Every Aniimo form in the game, including regional and Prismana variants, with what deals it
the most damage and what it resists. Open one for its full matchup table and what its own moves can hit.</p>

<div class="answer">
<p><strong>There are ${meta.counts.forms} Aniimo forms across nine elements</strong> — ${esc(list(chart.order))} — of which
${duals.length} carry two elements and ${roster.length - duals.length} carry one.</p>
<p><strong>${esc(bestAttacker.attacker)} attacks are super effective against more forms than any other element</strong>
(${bestAttacker.hits} of ${roster.length}${bestAttacker.quad ? `, ${bestAttacker.quad} of them for 2.56×` : ''}).</p>
<p>Only a dual-element form can take 2.56×, and nothing in the game is immune: the floor is 0.39×.</p>
</div>`)}

<main class="page page--narrow section">
<section class="card card--flow" data-app-owns>
<h2>Every Aniimo at a glance</h2>
${tileLegend()}
<ul class="tile-grid">${byNumber.map((a) => `<li>${aniimoTile(chart, up, a)}</li>`).join('\n')}</ul>
</section>

<section class="card card--flow">
<h2>Weakness of every Aniimo</h2>
${weaknessTable}
</section>

<section class="card card--flow">
<h2>Which element hits the most Aniimo</h2>
<p class="muted">Counted over the whole roster, reading both halves of a dual-element form.</p>
${coverageTable}
</section>

<section class="card card--flow">
<h2>By element</h2>
${byElement
    .map(
      (g) => `<h3>${elChip(g.el, `${up}${paths.element(g.el)}`)} <span class="muted">${g.list.length} forms</span></h3>
${rosterList(up, g.list)}`,
    )
    .join('\n')}
</section>

${faqSection(q)}
</main>`;

  const jsonLd = [
    breadcrumbs([
      { name: 'Home', rel: paths.home },
      { name: 'All Aniimo', rel: paths.roster },
    ]),
    {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: 'All Aniimo forms',
      numberOfItems: roster.length,
      itemListElement: alphabetical.map((a, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: displayName(a),
        url: abs(paths.aniimo(a)),
      })),
    },
    q.jsonLd,
  ];

  return { body, jsonLd };
}

export function notFoundPage({ up }) {
  const body = `${hero(`<h1>Page not found</h1>
<p class="lede">That URL is not part of the calculator.</p>
<p><a class="btn btn--primary" href="${up}">Back to the Aniimo weakness calculator</a></p>
<p class="muted"><a href="${up}chart/">Full element chart</a> · <a href="${up}aniimo/">All Aniimo</a></p>`)}`;
  return { body, jsonLd: [] };
}
