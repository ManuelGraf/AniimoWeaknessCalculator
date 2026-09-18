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

  return { order, defs, multipliers: data.multipliers, pair, against, defenceSpread, offenceSpread, matrix };
}

export type Chart = ReturnType<typeof createChart>;

// 1.6 * 1.6 is 2.5600000000000005 in binary floating point, so bucket on a
// rounded value rather than comparing raw products.
export const round = (n: number): number => Math.round(n * 10000) / 10000;

export type BandKey = 'x256' | 'x16' | 'x1' | 'x0625' | 'x039';

export interface Band {
  min: number;
  key: BandKey;
  label: string;
  /** Short read of what the number means, used as the group heading. */
  blurb: string;
}

export const BANDS: Band[] = [
  { min: 2.5, key: 'x256', label: '2.56×', blurb: 'Hits both halves' },
  { min: 1.5, key: 'x16', label: '1.6×', blurb: 'Super effective' },
  { min: 0.99, key: 'x1', label: '1×', blurb: 'Neutral' },
  { min: 0.6, key: 'x0625', label: '0.625×', blurb: 'Resisted' },
  { min: 0, key: 'x039', label: '0.39×', blurb: 'Resisted twice' },
];

export function band(multiplier: number): Band {
  const m = round(multiplier);
  return BANDS.find((b) => m >= b.min) ?? BANDS[BANDS.length - 1]!;
}

/** "2.56x", "1x", "0.391x" - trims the noise from floating point products. */
export function formatMultiplier(n: number): string {
  const m = round(n);
  if (Number.isInteger(m)) return `${m}×`;
  return `${Number(m.toFixed(m < 1 ? 3 : 2))}×`;
}
