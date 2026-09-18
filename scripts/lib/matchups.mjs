/**
 * Element maths for the prerenderer, in plain JS so a Node script can use it
 * without a TypeScript loader.
 *
 * This is a deliberate mirror of src/lib/chart.ts. scripts/lib/matchups.test.ts
 * asserts the two agree on every attacker against every single and dual
 * defender, so a change to one that is not made to the other fails the build.
 */

export function createChart(data) {
  const { order } = data;
  const defs = data.elements;
  const { strong, neutral, resisted } = data.multipliers;

  function pair(attacker, defender) {
    const def = defs[attacker];
    if (!def) return neutral;
    if (def.strongAgainst.includes(defender)) return strong;
    if (def.resistedBy.includes(defender)) return resisted;
    return neutral;
  }

  function against(attacker, defenders) {
    const list = defenders.filter(Boolean);
    if (!list.length) return neutral;
    return list.reduce((m, d) => m * pair(attacker, d), 1);
  }

  /** What every element does to this defender, hardest hit first. */
  function defenceSpread(defenders) {
    return order
      .map((element) => ({ element, multiplier: against(element, defenders) }))
      .sort((a, b) => b.multiplier - a.multiplier || order.indexOf(a.element) - order.indexOf(b.element));
  }

  /**
   * What one attacking element does to every single defender, hardest hit
   * first. Deliberately not called offenceSpread: the function of that name in
   * src/lib/chart.ts answers a different question (the best an Aniimo's whole
   * move set can reach), so sharing the name would invite a false parity.
   */
  function attackSpread(attacker) {
    return order
      .map((element) => ({ element, multiplier: pair(attacker, element) }))
      .sort((a, b) => b.multiplier - a.multiplier || order.indexOf(a.element) - order.indexOf(b.element));
  }

  function matrix() {
    return order.map((element) => ({
      element,
      cells: order.map((d) => ({ element: d, multiplier: pair(element, d) })),
    }));
  }

  /** Attackers that deal 1.6x to this element - the mirror of strongAgainst. */
  const weakTo = (el) => order.filter((a) => defs[a].strongAgainst.includes(el));

  /** Attackers this element takes 0.625x from - the mirror of resistedBy. */
  const resists = (el) => order.filter((a) => defs[a].resistedBy.includes(el));

  /** Every unordered element pair, in chart order, as `[a, b]`. */
  function pairs() {
    const out = [];
    for (let i = 0; i < order.length; i++) {
      for (let j = i + 1; j < order.length; j++) out.push([order[i], order[j]]);
    }
    return out;
  }

  return {
    order,
    defs,
    multipliers: data.multipliers,
    pair,
    against,
    defenceSpread,
    attackSpread,
    matrix,
    weakTo,
    resists,
    strongAgainst: (el) => defs[el].strongAgainst,
    resistedBy: (el) => defs[el].resistedBy,
    pairs,
  };
}

// 1.6 * 1.6 is 2.5600000000000005 in binary floating point, so bucket on a
// rounded value rather than comparing raw products.
export const round = (n) => Math.round(n * 10000) / 10000;

export const BANDS = [
  { min: 2.5, key: 'x256', label: '2.56x', blurb: 'Hits both halves' },
  { min: 1.5, key: 'x16', label: '1.6x', blurb: 'Super effective' },
  { min: 0.99, key: 'x1', label: '1x', blurb: 'Neutral' },
  { min: 0.6, key: 'x0625', label: '0.625x', blurb: 'Resisted' },
  { min: 0, key: 'x039', label: '0.39x', blurb: 'Resisted twice' },
];

export function band(multiplier) {
  const m = round(multiplier);
  return BANDS.find((b) => m >= b.min) ?? BANDS[BANDS.length - 1];
}

/** "2.56x", "1x", "0.391x" - trims the noise from floating point products. */
export function formatMultiplier(n) {
  const m = round(n);
  if (Number.isInteger(m)) return `${m}×`;
  return `${Number(m.toFixed(m < 1 ? 3 : 2))}×`;
}

/** The distinct elements an Aniimo actually has attacking moves for. */
export const moveElements = (a) => [
  ...new Set(a.skills.filter((s) => s.offensive && s.element).map((s) => s.element)),
];

export const displayName = (a) =>
  a.isBasic ? a.name : `${a.name} (${a.morphology.replace(/ Form$/, '')})`;

/** Canonical slug for an element pairing, always in chart order. */
export const dualSlug = (order, a, b) =>
  [a, b].sort((x, y) => order.indexOf(x) - order.indexOf(y)).map((e) => e.toLowerCase()).join('-');

/** Site-relative URL (no leading slash) for each kind of page. */
export const paths = {
  home: '',
  chart: 'chart/',
  roster: 'aniimo/',
  element: (el) => `element/${el.toLowerCase()}/`,
  dual: (order, a, b) => `element/${dualSlug(order, a, b)}/`,
  aniimo: (a) => `aniimo/${a.id}/`,
};
