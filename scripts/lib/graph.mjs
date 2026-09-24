/**
 * The element relation graph for the prerendered pages: its geometry, and the
 * markup the app's <ElementGraph> writes.
 *
 * Both halves are mirrors. graphModel() restates src/lib/graph.ts in plain JS,
 * and graphCard() restates src/components/ElementGraph.tsx as a template.
 * scripts/lib/graph.test.tsx holds them to the same geometry for every element
 * and the same markup, so a change made on one side only fails the build.
 *
 * The static copy has no behaviour of its own. On /chart/ it is marked
 * `data-app-owns` and the interactive one replaces it on boot; on an element
 * page it stays, drawn with that element already selected, and its nodes are
 * plain links to the other elements' pages.
 */
import { formatMultiplier, paths } from './matchups.mjs';
import { esc, elChip } from './html.mjs';

export const GRAPH_W = 600;
export const GRAPH_H = 800;

/** Node centres in viewBox units. Mirrors LAYOUT in src/lib/graph.ts. */
export const LAYOUT = {
  Light: [300, 55],
  Dark: [190, 165],
  Wind: [410, 165],
  Lightning: [300, 280],
  Grass: [55, 370],
  Ice: [545, 370],
  Water: [300, 445],
  Earth: [300, 595],
  Fire: [300, 745],
};

/** Hand-routed edges. Mirrors ROUTES in src/lib/graph.ts. */
export const ROUTES = {
  'Wind>Grass': [258, 177],
  'Water>Fire': [470, 595],
};

const TRIM = 42;
const HEAD_LENGTH = 14;
const HEAD_HALF_WIDTH = 7;
const PAIR_BEND = 0.18;
const RESIST_BENDS = [0.22, -0.22, 0.4, -0.4];

const r1 = (n) => Math.round(n * 10) / 10;
const pt = ([x, y]) => `${r1(x)} ${r1(y)}`;

function unit(a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  return [dx / len, dy / len];
}

function bezier(p0, c, p2, t) {
  const u = 1 - t;
  return [u * u * p0[0] + 2 * u * t * c[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p2[1]];
}

function bent(p0, p2, bend) {
  const [ux, uy] = unit(p0, p2);
  const len = Math.hypot(p2[0] - p0[0], p2[1] - p0[1]);
  const mx = (p0[0] + p2[0]) / 2;
  const my = (p0[1] + p2[1]) / 2;
  return [mx + uy * bend * len, my - ux * bend * len];
}

function clearance(p0, c, p2, ends, order) {
  let min = Infinity;
  for (const el of order) {
    if (ends.includes(el)) continue;
    const n = LAYOUT[el];
    for (let i = 1; i < 20; i++) {
      const p = bezier(p0, c, p2, i / 20);
      min = Math.min(min, Math.hypot(p[0] - n[0], p[1] - n[1]));
    }
  }
  return min;
}

function edge(from, to, kind, control, label, rel) {
  const p0 = LAYOUT[from];
  const p2 = LAYOUT[to];
  const out = unit(p0, control);
  const inward = unit(control, p2);

  const start = [p0[0] + out[0] * TRIM, p0[1] + out[1] * TRIM];
  const tip = [p2[0] - inward[0] * TRIM, p2[1] - inward[1] * TRIM];
  const end = [tip[0] - inward[0] * (HEAD_LENGTH - 4), tip[1] - inward[1] * (HEAD_LENGTH - 4)];
  const base = [tip[0] - inward[0] * HEAD_LENGTH, tip[1] - inward[1] * HEAD_LENGTH];
  const side = [-inward[1] * HEAD_HALF_WIDTH, inward[0] * HEAD_HALF_WIDTH];

  const [lx, ly] = bezier(start, control, tip, 0.5);

  return {
    from,
    to,
    kind,
    d: `M${pt(start)} Q${pt(control)} ${pt(end)}`,
    head: `M${pt(tip)} L${pt([base[0] + side[0], base[1] + side[1]])} L${pt([base[0] - side[0], base[1] - side[1]])}Z`,
    lx: r1(lx),
    ly: r1(ly),
    label,
    rel,
  };
}

/** Mirrors graphModel() in src/lib/graph.ts. */
export function graphModel(chart, active) {
  const { order, defs, multipliers } = chart;
  const strongLabel = formatMultiplier(multipliers.strong);
  const resistLabel = formatMultiplier(multipliers.resisted);

  const relOf = (from, to) => (active === null ? null : from === active ? 'out' : to === active ? 'in' : null);

  const edges = [];

  for (const from of order) {
    for (const to of defs[from].strongAgainst) {
      const p0 = LAYOUT[from];
      const p2 = LAYOUT[to];
      const routed = ROUTES[`${from}>${to}`];
      const opposed = defs[to].strongAgainst.includes(from);
      const control = routed ?? (opposed ? bent(p0, p2, PAIR_BEND) : [(p0[0] + p2[0]) / 2, (p0[1] + p2[1]) / 2]);
      edges.push(edge(from, to, 'strong', control, strongLabel, relOf(from, to)));
    }
  }

  if (active !== null) {
    const resisted = [
      ...defs[active].resistedBy.filter((d) => d !== active).map((d) => [active, d]),
      ...order.filter((a) => a !== active && defs[a].resistedBy.includes(active)).map((a) => [a, active]),
    ];

    for (const [from, to] of resisted) {
      const p0 = LAYOUT[from];
      const p2 = LAYOUT[to];
      let best = bent(p0, p2, RESIST_BENDS[0]);
      let bestClear = -1;
      for (const b of RESIST_BENDS) {
        const c = bent(p0, p2, b);
        const clear = clearance(p0, c, p2, [from, to], order);
        if (clear > bestClear + 0.5) {
          best = c;
          bestClear = clear;
        }
      }
      edges.push(edge(from, to, 'resist', best, resistLabel, relOf(from, to)));
    }
  }

  const linked = new Set();
  for (const e of edges) {
    if (e.rel) linked.add(e.from === active ? e.to : e.from);
  }

  const nodes = order.map((element) => ({
    element,
    x: LAYOUT[element][0],
    y: LAYOUT[element][1],
    rel: active === null ? null : element === active ? 'self' : linked.has(element) ? 'linked' : null,
    ring: element === active && defs[element].resistedBy.includes(element),
  }));

  return { nodes, edges };
}

/** Mirrors relations() in src/lib/graph.ts. */
export function relations(chart, el) {
  const { order, defs } = chart;
  return {
    strongAgainst: defs[el].strongAgainst,
    resistedBy: defs[el].resistedBy,
    weakTo: order.filter((a) => defs[a].strongAgainst.includes(el)),
    resists: order.filter((a) => defs[a].resistedBy.includes(el)),
  };
}

export const nodeLeft = (x) => `${r1((x / GRAPH_W) * 100)}%`;
export const nodeTop = (y) => `${r1((y / GRAPH_H) * 100)}%`;
/** Mirrors labelRect() in src/lib/graph.ts. */
export function labelRect(e) {
  const w = e.label.length * 11 + 16;
  return { x: r1(e.lx - w / 2), y: r1(e.ly - 13), width: w, height: 26 };
}

/* ------------------------------------------------------------------ markup */

/** Mirrors CREDIT_URL in ElementGraph.tsx. */
const CREDIT_URL = 'https://www.reddit.com/user/88IllusionllI88/';

const slug = (el) => String(el).toLowerCase();
const glyph = (id) => `<svg class="icon" aria-hidden="true"><use href="#${id}"></use></svg>`;
const attr = (name, value) => (value === null || value === undefined ? '' : ` ${name}="${esc(value)}"`);

/** The SVG layer and the nodes on top of it. Mirrors <Graph> in ElementGraph.tsx. */
function graphBox(chart, up, active) {
  const { nodes, edges } = graphModel(chart, active);

  const lines = edges
    .map(
      (e) =>
        `<g class="graph__edge" data-el="${slug(e.from)}" data-kind="${e.kind}"${attr('data-rel', e.rel)}><path class="graph__line" d="${e.d}"></path><path class="graph__head" d="${e.head}"></path></g>`,
    )
    .join('');

  const labels = edges
    .filter((e) => e.rel && e.kind === 'strong')
    .map((e) => {
      const r = labelRect(e);
      return `<g class="graph__label"><rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" rx="13"></rect><text x="${e.lx}" y="${e.ly}">${esc(e.label)}</text></g>`;
    })
    .join('');

  const plates = nodes
    .map(
      (n) =>
        `<a class="graph__node" data-el="${slug(n.element)}"${attr('data-rel', n.rel)} href="${esc(`${up}${paths.element(n.element)}`)}"${n.rel === 'self' ? ' aria-current="page"' : ''} style="left: ${nodeLeft(n.x)}; top: ${nodeTop(n.y)};">${n.ring ? '<span class="graph__ring" aria-hidden="true"></span>' : ''}<span class="el-plate" data-el="${slug(n.element)}">${glyph(`el-${slug(n.element)}`)}</span><span class="graph__name">${esc(n.element)}</span></a>`,
    )
    .join('');

  return `<div class="graph"${attr('data-active', active && slug(active))}>
<svg class="graph__svg" viewBox="0 0 ${GRAPH_W} ${GRAPH_H}" aria-hidden="true" focusable="false"><g class="graph__edges">${lines}</g><g class="graph__labels">${labels}</g></svg>
<div class="graph__nodes">${plates}</div>
</div>`;
}

/** The key to the three marks. Mirrors <GraphKey> in ElementGraph.tsx. */
const graphKey = () => `<ul class="graph-key">
<li><span class="graph-key__mark" data-kind="strong" aria-hidden="true"></span>Super effective, 1.6×</li>
<li><span class="graph-key__mark" data-kind="resist" aria-hidden="true"></span>Resisted, 0.625×</li>
<li><span class="graph-key__mark" data-kind="ring" aria-hidden="true"></span>Resists itself</li>
</ul>`;

/** Mirrors <Readout> in ElementGraph.tsx. */
function readout(chart, up, active) {
  if (!active) {
    return `<div class="graph-read" aria-live="polite">
<p class="graph-read__title">Pick an element</p>
<p class="muted">Each arrow points from an attacker to the element it hits for 1.6×. Pick one to see what it beats, what beats it, and what it shrugs off.</p>
${graphKey()}
</div>`;
  }

  const r = relations(chart, active);
  const chips = (els) => `<dd>${els.map((e) => elChip(e)).join('')}</dd>`;
  return `<div class="graph-read" aria-live="polite">
<p class="graph-read__title">${elChip(active)}</p>
<dl class="graph-read__list">
<div><dt>Hits for 1.6×</dt>${chips(r.strongAgainst)}</div>
<div><dt>Is resisted by</dt>${chips(r.resistedBy)}</div>
<div><dt>Weak to</dt>${chips(r.weakTo)}</div>
<div><dt>Resists</dt>${chips(r.resists)}</div>
</dl>
<p><a class="btn btn--ghost" href="${up}#/defense/${slug(active)}">Open ${esc(active)} in the calculator</a></p>
${graphKey()}
</div>`;
}

/** The whole card. `owned` marks it for the app to replace on boot. */
export function graphCard(chart, up, { active = null, owned = false } = {}) {
  return `<section class="card graph-card"${owned ? ' data-app-owns' : ''}>
<div class="graph-card__head">
<h2>How the elements beat each other</h2>
<p class="muted">Every 1.6× matchup in the game, as arrows from attacker to defender.</p>
</div>
<div class="graph-card__body">
${graphBox(chart, up, active)}
${readout(chart, up, active)}
</div>
<p class="note graph-card__credit">Layout after the element chart by <a href="${CREDIT_URL}" target="_blank" rel="noopener">u/88IllusionllI88</a>.</p>
</section>`;
}
