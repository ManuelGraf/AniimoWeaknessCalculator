/**
 * Pure element maths. No React and no DOM, so the tests exercise it directly.
 *
 * Aniimo uses three bands - 1.6x, 1x, 0.625x - read attacker -> defender. The
 * game has never documented dual-element defenders, but aniimoguide states the
 * two sides are read at once and the multipliers multiply, which is also how
 * the worked examples on their element page come out. That gives five possible
 * results against a dual: 2.56, 1.6, 1, 0.625 and 0.390625.
 */
import type { ChartData, Element } from '../types';

export interface Matchup {
  element: Element;
  multiplier: number;
}

export interface BestHit {
  multiplier: number;
  /** The move element that gets there, or null when the attacker has no moves. */
  element: Element | null;
  /** Every move element tied for that multiplier. */
  ties: Element[];
}

export interface Coverage {
  defenders: Element[];
  best: BestHit;
}

/** One end of a defender's spread: the multiplier, and everything that reaches it. */
export interface Extreme {
  multiplier: number;
  elements: Element[];
  /**
   * How a tile labels the row. Read from the number, not from the elements:
   * a pairing where nothing is super effective is "hit hardest by", not
   * "weak to", and one that resists nothing takes least from something anyway.
   */
  label: string;
}

export interface Extremes {
  most: Extreme;
  least: Extreme;
}

/** One of the five bands with whatever landed in it, which may be nothing. */
export interface BandGroup {
  band: Band;
  entries: Matchup[];
}

export function createChart(data: ChartData) {
  const { order } = data;
  const defs = data.elements;
  const { strong, neutral, resisted } = data.multipliers;

  /** Multiplier for a single attacking element against a single defender. */
  function pair(attacker: Element, defender: Element): number {
    const def = defs[attacker];
    if (!def) return neutral;
    if (def.strongAgainst.includes(defender)) return strong;
    if (def.resistedBy.includes(defender)) return resisted;
    return neutral;
  }

  /** Multiplier for one attacking element against a 1- or 2-element defender. */
  function against(attacker: Element, defenders: readonly Element[]): number {
    const list = defenders.filter(Boolean);
    if (!list.length) return neutral;
    return list.reduce((m, d) => m * pair(attacker, d), 1);
  }

  /** What every element does to this defender, hardest hit first. */
  function defenceSpread(defenders: readonly Element[]): Matchup[] {
    return order
      .map((element) => ({ element, multiplier: against(element, defenders) }))
      .sort((a, b) => b.multiplier - a.multiplier || order.indexOf(a.element) - order.indexOf(b.element));
  }

  /**
   * The same spread bucketed into the five bands, hardest first, with every
   * band present whether or not anything lands in it.
   *
   * The empty ones matter: an Aniimo tile draws one column per band and they
   * only line up across the grid if all five are always there. The defence
   * panel drops them. Mirrored in scripts/lib/matchups.mjs.
   */
  function spreadByBand(defenders: readonly Element[]): BandGroup[] {
    const spread = defenceSpread(defenders);
    return BANDS.map((b) => ({
      band: b,
      entries: spread.filter((s) => band(s.multiplier).key === b.key),
    }));
  }

  /**
   * The two ends of that spread - what deals the most damage to this defender
   * and what deals the least - which is the whole of what an Aniimo tile shows
   * without being opened. Mirrored in scripts/lib/matchups.mjs.
   *
   * `least` comes back empty when both ends are the same multiplier, so a
   * defender with a flat spread is not listed as resisting the very elements
   * named beside it as its worst.
   */
  function extremes(defenders: readonly Element[]): Extremes {
    const spread = defenceSpread(defenders);
    const at = (m: number) => spread.filter((s) => round(s.multiplier) === round(m)).map((s) => s.element);

    const top = spread[0]!.multiplier;
    const bottom = spread[spread.length - 1]!.multiplier;
    const flat = round(top) === round(bottom);

    return {
      most: { multiplier: top, elements: at(top), label: round(top) > 1 ? 'Weak to' : 'Hit hardest by' },
      least: {
        multiplier: bottom,
        elements: flat ? [] : at(bottom),
        label: round(bottom) < 1 ? 'Resists' : 'Takes least from',
      },
    };
  }

  /**
   * Best multiplier this attacker can reach against each defender, given the
   * elements it actually has moves for. `defenderSets` defaults to the nine
   * single elements; pass pairs to score a specific dual-element target.
   */
  function offenceSpread(
    attackElements: readonly (Element | null)[],
    defenderSets: Element[][] = order.map((e) => [e]),
  ): Coverage[] {
    const available = [...new Set(attackElements.filter((e): e is Element => !!e))];

    return defenderSets.map((defenders) => {
      let best: BestHit = { multiplier: 0, element: null, ties: [] };
      for (const el of available) {
        const m = against(el, defenders);
        if (m > best.multiplier) best = { multiplier: m, element: el, ties: [el] };
        else if (m === best.multiplier) best.ties.push(el);
      }
      if (!available.length) best = { multiplier: neutral, element: null, ties: [] };
      return { defenders, best };
    });
  }

  /** Full 9x9 grid, rows = attacker, cols = defender. */
  function matrix() {
    return order.map((element) => ({
      element,
      cells: order.map((d) => ({ element: d, multiplier: pair(element, d) })),
    }));
  }

  return {
    order,
    defs,
    multipliers: data.multipliers,
    pair,
    against,
    defenceSpread,
    spreadByBand,
    extremes,
    offenceSpread,
    matrix,
  };
}

export type Chart = ReturnType<typeof createChart>;

// 1.6 * 1.6 is 2.5600000000000005 in binary floating point, so bucket on a
// rounded value rather than comparing raw products.
export const round = (n: number): number => Math.round(n * 10000) / 10000;

export type BandKey = 'x256' | 'x16' | 'x1' | 'x0625' | 'x039';

export interface Band {
  min: number;
  key: BandKey;
  /**
   * The multiplier this band *is*, as opposed to `min`, which is only the
   * floor used to bucket a number into it. It exists so an empty band still
   * has something to colour itself from - see the tile's spread bar, where all
   * five columns are drawn whether or not anything landed in them.
   */
  mult: number;
  label: string;
  /** Short read of what the number means, used as the group heading. */
  blurb: string;
}

export const BANDS: Band[] = [
  { min: 2.5, key: 'x256', mult: 2.56, label: '2.56×', blurb: 'Hits both halves' },
  { min: 1.5, key: 'x16', mult: 1.6, label: '1.6×', blurb: 'Super effective' },
  { min: 0.99, key: 'x1', mult: 1, label: '1×', blurb: 'Neutral' },
  { min: 0.6, key: 'x0625', mult: 0.625, label: '0.625×', blurb: 'Resisted' },
  { min: 0, key: 'x039', mult: 0.390625, label: '0.39×', blurb: 'Resisted twice' },
];

export function band(multiplier: number): Band {
  const m = round(multiplier);
  return BANDS.find((b) => m >= b.min) ?? BANDS[BANDS.length - 1]!;
}

export type Verdict = 'bad' | 'good' | 'flat';

/**
 * The single switch every multiplier-coloured component reads, mirrored from
 * verdict() in scripts/lib/html.mjs so the static page and the app colour a
 * number the same way. Read from the number, never from the text: "bad" takes
 * more damage, "good" resists, "flat" is neutral.
 *
 * It holds for duals too - 2.56 and 1.6 are both bad, 0.625 and 0.391 are both
 * good, and 0.625 x 1.6 comes out flat on its own. The band label is what
 * keeps 2.56x distinguishable from 1.6x; see BANDS above.
 */
export function verdict(multiplier: number): Verdict {
  const m = round(multiplier);
  if (m > 1) return 'bad';
  if (m < 1) return 'good';
  return 'flat';
}

/** "2.56x", "1x", "0.391x" - trims the noise from floating point products. */
export function formatMultiplier(n: number): string {
  const m = round(n);
  if (Number.isInteger(m)) return `${m}×`;
  return `${Number(m.toFixed(m < 1 ? 3 : 2))}×`;
}
