/**
 * The scoring behind the move list.
 *
 * Effective power is the one number on the detail page that is not read
 * straight out of the database - it is base power x STAB x effectiveness, and
 * it is what orders the list and decides which move wears the "Best" chip. So
 * it is worked out here against real entries from public/data, with the sums
 * written out, rather than through the rendered card.
 */
import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createChart } from '../lib/chart';
import type { Aniimo, ChartData, Element } from '../types';
import { STAB, scoreMoves } from './AniimoDetail';

const read = <T,>(name: string): T =>
  JSON.parse(readFileSync(resolve(process.cwd(), 'public/data', name), 'utf8')) as T;

const chart = createChart(read<ChartData>('elements.json'));
const roster = read<Aniimo[]>('aniimo.json');

const find = (id: string): Aniimo => {
  const a = roster.find((x) => x.id === id);
  if (!a) throw new Error(`${id} is not in public/data/aniimo.json`);
  return a;
};

const named = (id: string, target: Element[], move: string) => {
  const m = scoreMoves(chart, find(id), target).find((s) => s.skill.name === move);
  if (!m) throw new Error(`${id} has no scored move called ${move}`);
  return m;
};

describe('scoreMoves', () => {
  test('with no target, STAB is the whole of the difference from base power', () => {
    // Emberpup is Fire, so its Fire moves carry the bonus and its Earth one
    // does not. Effectiveness is a flat 1x until a defender is picked.
    const fire = named('emberpup', [], 'Fire Kick');
    expect(fire.stab).toBe(true);
    expect(fire.multiplier).toBe(1);
    expect(fire.effective).toBeCloseTo(72 * STAB); // 90

    const earth = named('emberpup', [], 'Pebble Kick');
    expect(earth.stab).toBe(false);
    expect(earth.effective).toBeCloseTo(40); // 40 x 1 x 1
  });

  test('a two-element target multiplies both halves into the score', () => {
    // Hexxin is Dark/Grass. Dark into Water/Ice is resisted once and neutral
    // once, so 0.625 - and the bonus still leaves Annihilation Bomb on top.
    const bomb = named('hexxin', ['Water', 'Ice'], 'Annihilation Bomb');
    expect(bomb.stab).toBe(true);
    expect(bomb.multiplier).toBeCloseTo(0.625);
    expect(bomb.effective).toBeCloseTo(164 * 1.25 * 0.625); // 128.125

    const moves = scoreMoves(chart, find('hexxin'), ['Water', 'Ice']);
    expect(moves[0]!.skill.name).toBe('Annihilation Bomb');
  });

  test('a lighter move can outrank a heavier one that gets resisted', () => {
    // Glacy is Water/Ice into a Grass defender: Water is resisted (0.625),
    // Ice is neutral. Bubble Rush hits harder on paper and still does not win.
    const moves = scoreMoves(chart, find('glacy'), ['Grass']);
    const iceOrb = named('glacy', ['Grass'], 'Ice Orb');
    const bubbleRush = named('glacy', ['Grass'], 'Bubble Rush');

    expect(bubbleRush.power).toBeGreaterThan(iceOrb.power);
    expect(iceOrb.effective).toBeCloseTo(20 * 1.25 * 1); // 25
    expect(bubbleRush.effective).toBeCloseTo(32 * 1.25 * 0.625); // 25
    // Level on effective power, so the raw multiplier breaks the tie.
    expect(moves[0]!.skill.name).toBe('Ice Orb');

    const effective = moves.map((m) => m.effective);
    expect(effective).toEqual([...effective].sort((a, b) => b - a));
  });

  test('a move with no power scores zero and sinks to the bottom', () => {
    // Glacy's Healing Water and Spring of Life are element-tagged and count as
    // offensive, but do no damage; the row shows "no damage" instead of a sum.
    const moves = scoreMoves(chart, find('glacy'), []);
    const zeros = moves.filter((m) => m.power === 0);

    expect(zeros.length).toBeGreaterThan(0);
    expect(zeros.every((m) => m.effective === 0)).toBe(true);
    expect(moves.slice(-zeros.length).every((m) => m.power === 0)).toBe(true);
  });

  test('only element-tagged attacking moves are scored at all', () => {
    for (const a of roster) {
      const scored = scoreMoves(chart, a, []);
      expect(scored.every((m) => m.skill.offensive && !!m.skill.element)).toBe(true);
      expect(scored).toHaveLength(a.skills.filter((s) => s.offensive && s.element).length);
    }
  });
});
