import { describe, expect, test } from 'vitest';
import { dataFile } from '../../test/data';

import { createChart } from './chart';
import { slicesModel } from './slices';
import { slicesSummary } from '../components/DefenceSlices';
import type { ChartData } from '../types';

const chart = createChart(JSON.parse(dataFile('elements.json')) as ChartData);

describe('slicesModel', () => {
  test('one slice per element, in chart order', () => {
    expect(slicesModel(chart, ['Fire'], 'damage').map((s) => s.element)).toEqual(chart.order);
  });

  test('damage: further out = more damage, neutral on the middle ring', () => {
    // Water / Wind lands in all five bands.
    const s = slicesModel(chart, ['Water', 'Wind'], 'damage');
    for (const slice of s) {
      expect(slice.multiplier).toBeCloseTo(chart.against(slice.element, ['Water', 'Wind']));
      const expected = slice.multiplier > 2 ? 5 : slice.multiplier > 1.5 ? 4 : slice.multiplier > 0.99 ? 3 : slice.multiplier > 0.5 ? 2 : 1;
      expect(slice.level).toBe(expected);
    }
  });

  test('toughness turns every slice inside out', () => {
    const dmg = slicesModel(chart, ['Grass', 'Ice'], 'damage');
    const tough = slicesModel(chart, ['Grass', 'Ice'], 'toughness');
    dmg.forEach((d, i) => expect(tough[i]!.level).toBe(6 - d.level));
  });

  test('only toughness draws the gap a weakness leaves, two deep for 2.56x', () => {
    const dmg = slicesModel(chart, ['Grass', 'Ice'], 'damage');
    expect(dmg.every((s) => s.gaps.length === 0)).toBe(true);

    const tough = slicesModel(chart, ['Grass', 'Ice'], 'toughness');
    for (const s of tough) {
      const want = s.verdict !== 'bad' ? 0 : s.level === 1 ? 2 : 1;
      expect(s.gaps.length).toBe(want);
    }
  });

  test('a neutral slice gets no badge', () => {
    const s = slicesModel(chart, ['Fire'], 'damage');
    for (const slice of s) expect(slice.arrows === '').toBe(slice.verdict === 'flat');
  });
});

describe('slicesSummary', () => {
  test('names what it is weak to and what it resists', () => {
    const s = slicesModel(chart, ['Fire'], 'damage');
    const weak = s.filter((x) => x.verdict === 'bad').map((x) => x.element);
    const text = slicesSummary(s, 'damage');
    expect(text.startsWith('Fuller slice = takes more damage.')).toBe(true);
    for (const el of weak) expect(text).toContain(el);
    expect(text).toContain('Resists');
  });
});
