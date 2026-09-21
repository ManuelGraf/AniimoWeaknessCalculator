import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { createChart, round, band, formatMultiplier } from './chart';
import type { ChartData, Element } from '../types';

const data: ChartData = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../public/data/elements.json', import.meta.url)), 'utf8'),
);
const chart = createChart(data);

describe('published chart', () => {
  test('weaknesses mirror strengths in both directions', () => {
    for (const el of chart.order) {
      for (const other of chart.order) {
        const strong = data.elements[other].strongAgainst.includes(el);
        expect(chart.pair(other, el) === 1.6).toBe(strong);
      }
    }
  });

  test('no element is both strong against and resisted by the same element', () => {
    for (const el of chart.order) {
      const { strongAgainst, resistedBy } = data.elements[el];
      for (const t of strongAgainst) expect(resistedBy).not.toContain(t);
    }
  });

  test('single-element matchups', () => {
    expect(chart.pair('Lightning', 'Water')).toBe(1.6);
    expect(chart.pair('Water', 'Lightning')).toBe(1); // the chart is directional
    expect(chart.pair('Fire', 'Water')).toBe(0.625);
    expect(chart.pair('Dark', 'Light')).toBe(1.6);
    expect(chart.pair('Light', 'Dark')).toBe(1.6); // the only mutual 1.6x pair
    expect(chart.pair('Fire', 'Fire')).toBe(0.625); // most elements resist themselves
    expect(chart.pair('Dark', 'Dark')).toBe(1); // ... but Dark does not
  });
});

describe('dual-element defenders', () => {
  test("aniimoguide's worked examples", () => {
    // "Wind meets Hexxin's Dark and Grass sides at once, 1.6 x 1.6 = 2.56x"
    expect(round(chart.against('Wind', ['Dark', 'Grass']))).toBe(2.56);
    // "Fire into Glacy's Water and Ice sides comes out at 0.625 x 1.6 = 1x"
    expect(round(chart.against('Fire', ['Water', 'Ice']))).toBe(1);
  });

  test('all five bands are reachable', () => {
    expect(round(chart.against('Grass', ['Water', 'Earth']))).toBe(2.56);
    expect(round(chart.against('Lightning', ['Water', 'Dark']))).toBe(1.6);
    expect(round(chart.against('Fire', ['Grass', 'Water']))).toBe(1);
    expect(round(chart.against('Fire', ['Water', 'Wind']))).toBe(0.625);
    expect(round(chart.against('Fire', ['Water', 'Earth']))).toBe(0.3906);
  });

  test('element order never changes the result', () => {
    for (const a of chart.order) {
      for (const d1 of chart.order) {
        for (const d2 of chart.order) {
          expect(chart.against(a, [d1, d2])).toBe(chart.against(a, [d2, d1]));
        }
      }
    }
  });
});

/**
 * The two lines an Aniimo tile shows without being opened. Everything in the
 * grid and on the /aniimo/ landing page is read off this, so a wrong label
 * here is wrong on 226 tiles and 226 table rows at once.
 */
describe('extremes', () => {
  test('a single element reports both ends of its own column', () => {
    const { most, least } = chart.extremes(['Fire']);
    expect(most).toEqual({ multiplier: 1.6, elements: ['Water', 'Earth'], label: 'Weak to' });
    expect(least.elements).toEqual(['Fire', 'Grass', 'Ice']);
    expect(least.label).toBe('Resists');
  });

  test('a dual reports the multiplied ends, not the single-element ones', () => {
    // Glacy is Water/Ice: Grass is resisted by Water but strong into Ice for a
    // net 1.6x, and Water is resisted by both halves down to 0.39x.
    const { most, least } = chart.extremes(['Water', 'Ice']);
    expect(most.elements).toEqual(['Grass']);
    expect(round(most.multiplier)).toBe(1.6);
    expect(least.elements).toEqual(['Water']);
    expect(round(least.multiplier)).toBe(0.3906);
  });

  test('every element in the roster-wide top group shares its multiplier', () => {
    for (const a of chart.order) {
      for (const b of chart.order) {
        const { most, least } = chart.extremes([a, b]);
        for (const el of most.elements) expect(round(chart.against(el, [a, b]))).toBe(round(most.multiplier));
        for (const el of least.elements) expect(round(chart.against(el, [a, b]))).toBe(round(least.multiplier));
      }
    }
  });

  test('the labels are read from the number, not from the elements', () => {
    // No pairing in the published chart is unhittable or unresisting, so the
    // fallbacks are exercised against a chart where nothing is either.
    const elements = { ...data.elements };
    for (const el of chart.order) elements[el] = { ...elements[el], strongAgainst: [], resistedBy: [] };
    const flat = createChart({ ...data, elements });

    const { most, least } = flat.extremes(['Fire']);
    expect(most.label).toBe('Hit hardest by');
    expect(most.elements).toHaveLength(9);
    // Both ends are the same multiplier, so the bottom row is dropped rather
    // than repeating all nine elements as what it resists.
    expect(least.elements).toEqual([]);
  });
});

describe('defenceSpread', () => {
  test('covers all nine attackers, hardest hit first', () => {
    const spread = chart.defenceSpread(['Water', 'Ice']);
    expect(spread).toHaveLength(9);
    for (let i = 1; i < spread.length; i++) {
      expect(spread[i - 1]!.multiplier).toBeGreaterThanOrEqual(spread[i]!.multiplier);
    }
    // Glacy is Water/Ice: Lightning is 1.6x into Water but resisted by Ice, so
    // it nets out at 1x. Grass only touches the Water half and stays at 1.6x.
    const at = (el: Element) => round(spread.find((s) => s.element === el)!.multiplier);
    expect(at('Lightning')).toBe(1);
    expect(at('Grass')).toBe(1.6);
  });
});

describe('offenceSpread', () => {
  const vs = (attack: Element[], target: Element) =>
    chart.offenceSpread(attack).find((s) => s.defenders[0] === target)!.best;

  test('picks the best available move element', () => {
    expect(vs(['Fire', 'Earth'], 'Grass').multiplier).toBe(1.6);
    expect(vs(['Fire', 'Earth'], 'Grass').element).toBe('Fire'); // only Fire beats Grass
    expect(vs(['Fire', 'Earth'], 'Ice').multiplier).toBe(1.6);
    expect(vs(['Fire', 'Earth'], 'Ice').ties).toEqual(['Fire', 'Earth']); // both reach 1.6x
    // Water resists both Fire and Earth, so this attacker has no answer to it.
    expect(vs(['Fire', 'Earth'], 'Water').multiplier).toBe(0.625);
  });

  test('an attacker with no element-tagged moves is neutral, not zero', () => {
    expect(chart.offenceSpread([]).every((s) => s.best.multiplier === 1)).toBe(true);
  });

  test('ignores untagged moves rather than counting them', () => {
    expect(chart.offenceSpread([null, 'Fire', null])).toEqual(chart.offenceSpread(['Fire']));
  });

  test('can score a dual-element target', () => {
    const [hit] = chart.offenceSpread(['Wind'], [['Dark', 'Grass']]);
    expect(round(hit!.best.multiplier)).toBe(2.56);
  });
});

describe('presentation helpers', () => {
  test('banding', () => {
    expect(band(2.56).key).toBe('x256');
    expect(band(1.6).key).toBe('x16');
    expect(band(1).key).toBe('x1');
    expect(band(0.625).key).toBe('x0625');
    expect(band(0.390625).key).toBe('x039');
  });

  test('formatting trims floating point noise', () => {
    expect(formatMultiplier(1.6 * 1.6)).toBe('2.56×');
    expect(formatMultiplier(1)).toBe('1×');
    expect(formatMultiplier(0.625 * 0.625)).toBe('0.391×');
  });
});
