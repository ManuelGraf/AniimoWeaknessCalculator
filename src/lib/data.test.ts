/**
 * Runs against the committed public/data/aniimo.json rather than a fixture, so
 * a bad `npm run sync` fails here instead of in the browser.
 */
import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { createChart } from './chart';
import { displayName, moveElements, searchRoster } from './data';
import { ELEMENTS, type Aniimo, type ChartData, type Element, type Meta } from '../types';

const read = <T,>(file: string): T =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`../../public/data/${file}`, import.meta.url)), 'utf8'));

const roster = read<Aniimo[]>('aniimo.json');
const chartData = read<ChartData>('elements.json');
const meta = read<Meta>('meta.json');
const chart = createChart(chartData);

const valid = new Set<string>(ELEMENTS);
const find = (name: string, morphology = 'Basic Form') =>
  roster.find((a) => a.name === name && a.morphology === morphology);

describe('database integrity', () => {
  test('is populated and matches its own meta', () => {
    expect(roster.length).toBeGreaterThan(200);
    expect(roster).toHaveLength(meta.counts.forms);
  });

  test('ids are unique', () => {
    expect(new Set(roster.map((a) => a.id)).size).toBe(roster.length);
  });

  test('every Aniimo has one or two known elements', () => {
    for (const a of roster) {
      expect(a.elements.length, `${a.name} (${a.morphology})`).toBeGreaterThanOrEqual(1);
      expect(a.elements.length, `${a.name} (${a.morphology})`).toBeLessThanOrEqual(2);
      for (const el of a.elements) expect(valid.has(el), `${a.name}: ${el}`).toBe(true);
    }
  });

  test('every element is represented by at least one Aniimo', () => {
    for (const el of ELEMENTS) {
      expect(roster.some((a) => a.elements.includes(el)), el).toBe(true);
    }
  });

  test('offensive skills always carry a known element', () => {
    for (const a of roster) {
      for (const s of a.skills) {
        if (!s.offensive) continue;
        expect(s.element, `${a.name}: ${s.name}`).not.toBeNull();
        expect(valid.has(s.element as string), `${a.name}: ${s.name} -> ${s.element}`).toBe(true);
      }
    }
  });

  test('skills only come from the two known sources', () => {
    const sources = new Set(roster.flatMap((a) => a.skills.map((s) => s.source)));
    expect([...sources].sort()).toEqual(['guide', 'wiki']);
  });
});

describe('artwork', () => {
  const IMAGE = /\.(png|webp|jpe?g)$/i;

  test('every Aniimo has a head icon and a stage image', () => {
    for (const a of roster) {
      expect(a.head, `${a.name} (${a.morphology}) head`).toBeTruthy();
      expect(a.image, `${a.name} (${a.morphology}) image`).toBeTruthy();
    }
  });

  test('they are still images, never the VFX clip', () => {
    // illustrationImage on the wiki is an .mp4; it must never land in an <img>.
    for (const a of roster) {
      expect(a.image, `${a.name}: ${a.image}`).toMatch(IMAGE);
      expect(a.head, `${a.name}: ${a.head}`).toMatch(IMAGE);
    }
  });

  test('official art is preferred, with the community site as fallback', () => {
    const official = roster.filter((a) => a.image?.includes('worldx-website-cdn.aniimo.com'));
    expect(official.length).toBeGreaterThan(roster.length / 2);
    // Anything not on the official CDN must still be a usable absolute URL.
    for (const a of roster) {
      expect(a.image, `${a.name}`).toMatch(/^https:\/\//);
      expect(a.head, `${a.name}`).toMatch(/^https:\/\//);
    }
  });

  test('the VFX clip is kept in its own field', () => {
    const clips = roster.filter((a) => a.animation);
    expect(clips.length).toBeGreaterThan(0);
    for (const a of clips) expect(a.animation).toMatch(/\.mp4$/);
  });
});

describe('known Aniimo keep their published elements', () => {
  test.each([
    ['Emberpup', ['Fire']],
    ['Glacy', ['Water', 'Ice']],
    ['Magmarex', ['Fire', 'Earth']],
    ['Lunara', ['Light']],
  ] as Array<[string, Element[]]>)('%s is %s', (name, expected) => {
    const a = find(name);
    expect(a, `${name} missing from the roster`).toBeDefined();
    expect([...a!.elements].sort()).toEqual([...expected].sort());
  });
});

describe('off-element moves are preserved', () => {
  test('Emberpup is Fire but keeps its Earth Pebble Kick', () => {
    const emberpup = find('Emberpup')!;
    expect(emberpup.elements).toEqual(['Fire']);
    const pebble = emberpup.skills.find((s) => s.name === 'Pebble Kick');
    expect(pebble?.element).toBe('Earth');
    // Which means its coverage is wider than its own element suggests.
    expect(moveElements(emberpup)).toEqual(expect.arrayContaining(['Fire', 'Earth']));
  });

  test('coverage is computed from moves, not from the Aniimo element', () => {
    const emberpup = find('Emberpup')!;
    const vsIce = chart
      .offenceSpread(moveElements(emberpup))
      .find((c) => c.defenders[0] === 'Ice')!;
    expect(vsIce.best.multiplier).toBe(1.6);
  });
});

describe('search', () => {
  test('exact and prefix matches rank first', () => {
    expect(searchRoster(roster, 'glacy')[0]?.name).toBe('Glacy');
    expect(searchRoster(roster, 'ember')[0]?.name).toBe('Emberpup');
  });

  test('base forms outrank their variants', () => {
    const hits = searchRoster(roster, 'glacy');
    expect(hits[0]?.isBasic).toBe(true);
  });

  test('regional forms are reachable and labelled', () => {
    const snow = roster.find((a) => a.name === 'Glacy' && a.morphology === 'Snowfield Form');
    expect(snow).toBeDefined();
    expect(displayName(snow!)).toBe('Glacy (Snowfield)');
  });

  test('an empty query returns nothing rather than everything', () => {
    expect(searchRoster(roster, '   ')).toEqual([]);
  });

  test('unknown text returns no matches', () => {
    expect(searchRoster(roster, 'zzzzqq')).toEqual([]);
  });
});
