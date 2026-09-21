/**
 * The prerenderer needs the element maths in plain JS, so scripts/lib/matchups.mjs
 * restates what src/lib/chart.ts does. This is the guard against the two drifting:
 * every attacker is checked against every single and dual defender, plus the
 * band and formatting helpers that decide what each page says.
 */
import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createChart as tsChart, band as tsBand, formatMultiplier as tsFormat } from '../../src/lib/chart';
import type { ChartData, Element } from '../../src/types';
import {
  createChart as jsChart,
  band as jsBand,
  formatMultiplier as jsFormat,
  dualSlug,
} from './matchups.mjs';

const data: ChartData = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/elements.json'), 'utf8'),
);

const ts = tsChart(data);
const js = jsChart(data);

const defenderSets: Element[][] = [
  ...ts.order.map((e) => [e]),
  ...js.pairs(),
];

describe('matchups.mjs mirrors src/lib/chart.ts', () => {
  test('every attacker against every single and dual defender', () => {
    for (const attacker of ts.order) {
      for (const defenders of defenderSets) {
        expect(js.against(attacker, defenders)).toBe(ts.against(attacker, defenders));
      }
    }
  });

  test('the defence spread is ordered identically', () => {
    for (const defenders of defenderSets) {
      expect(js.defenceSpread(defenders)).toEqual(ts.defenceSpread(defenders));
    }
  });

  test('the five band buckets an Aniimo tile draws are identical', () => {
    for (const defenders of defenderSets) {
      expect(js.spreadByBand(defenders)).toEqual(ts.spreadByBand(defenders));
      // All five are always present, empty ones included, or the tile columns
      // would not line up from one Aniimo to the next.
      expect(js.spreadByBand(defenders)).toHaveLength(5);
    }
  });

  test('the extremes an Aniimo tile shows are identical, labels included', () => {
    for (const defenders of defenderSets) {
      expect(js.extremes(defenders)).toEqual(ts.extremes(defenders));
    }
  });

  test('the 9x9 matrix is identical', () => {
    expect(js.matrix()).toEqual(ts.matrix());
  });

  test('bands and formatting agree', () => {
    const multipliers = [...new Set(defenderSets.flatMap((d) => ts.order.map((a) => ts.against(a, d))))];
    for (const m of multipliers) {
      // Whole band, not just the key: an Aniimo tile prints `label` as a
      // column heading from whichever side rendered it.
      expect(jsBand(m)).toEqual(tsBand(m));
      expect(jsFormat(m)).toBe(tsFormat(m));
    }
  });
});

describe('derived lists', () => {
  test('weakTo is the mirror of everyone else strongAgainst', () => {
    for (const el of js.order) {
      for (const attacker of js.weakTo(el)) {
        expect(ts.pair(attacker, el)).toBe(data.multipliers.strong);
      }
      const rest = js.order.filter((e: Element) => !js.weakTo(el).includes(e));
      for (const attacker of rest) {
        expect(ts.pair(attacker, el)).not.toBe(data.multipliers.strong);
      }
    }
  });

  test('resists is the mirror of everyone else resistedBy', () => {
    for (const el of js.order) {
      for (const attacker of js.resists(el)) {
        expect(ts.pair(attacker, el)).toBe(data.multipliers.resisted);
      }
    }
  });

  test('pairs covers every unordered combination once', () => {
    const all = js.pairs();
    expect(all).toHaveLength((9 * 8) / 2);
    expect(new Set(all.map(([a, b]: Element[]) => dualSlug(js.order, a, b))).size).toBe(all.length);
  });

  test('a dual slug is independent of the order it is given in', () => {
    expect(dualSlug(js.order, 'Ice', 'Water')).toBe('water-ice');
    expect(dualSlug(js.order, 'Water', 'Ice')).toBe('water-ice');
  });
});
