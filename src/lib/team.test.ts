import { describe, expect, test } from 'vitest';

import { dataFile } from '../../test/data';
import type { Aniimo, ChartData, Element } from '../types';
import { createChart } from './chart';
import { attackElements, attackRole, coreElements, coveragePicks, isMainMove, teamDefence, threatPicks, teamFrom, teamIds, teamOffence, type Team } from './team';
import { formatHash, parseHash } from './useHashRoute';

const chart = createChart(JSON.parse(dataFile('elements.json')) as ChartData);

/**
 * A synthetic form, so the maths is checked against numbers worked out by hand.
 * Moves are Combat unless marked Innate; without an Innate one the core
 * element falls back to the typing.
 */
const mon = (
  id: string,
  elements: Element[],
  roles: string[],
  moves: [Element, number, ('Combat' | 'Innate')?][] = [],
): Aniimo => ({
  id,
  name: id,
  morphology: 'Base Form',
  number: null,
  isBasic: true,
  stage: null,
  elements,
  roles,
  description: '',
  stats: null,
  habitats: [],
  image: null,
  head: null,
  animation: null,
  skills: moves.map(([element, power, section = 'Combat']) => ({
    name: `${element} move`,
    description: '',
    section,
    element,
    power,
    cost: null,
    offensive: true,
    source: 'wiki',
  })),
  sources: ['wiki'],
});

const row = <R extends { element: Element }>(rows: R[], el: Element) => rows.find((r) => r.element === el)!;

describe('teamDefence', () => {
  test('an empty team has no verdicts', () => {
    const d = teamDefence(chart, [null, null, null, null]);
    expect(d.headline).toMatch(/Add Aniimo/);
    expect(d.rows.every((r) => r.score === 0 && r.label === '—')).toBe(true);
  });

  test('two members weak to the same element make it a threat', () => {
    // Water hits Fire for 1.6x, so two Fire members score +2 against Water.
    const d = teamDefence(chart, [mon('a', ['Fire'], ['dps']), mon('b', ['Fire'], ['dps']), null, null]);
    const water = row(d.rows, 'Water');
    expect(water.score).toBe(2);
    expect(water.label).toBe('Weak');
    expect(water.verdict).toBe('bad');
    expect(water.counts).toBe('2 weak');
    expect(d.weakTo).toContain('Water');
  });

  test('a resist cancels a weakness', () => {
    // Fire resists Fire; Grass is weak to Fire.
    const d = teamDefence(chart, [mon('a', ['Fire'], []), mon('b', ['Grass'], []), null, null]);
    const fire = row(d.rows, 'Fire');
    expect(fire.score).toBe(0);
    expect(fire.verdict).toBe('flat');
    expect(fire.counts).toBe('1 weak · 1 resist');
  });

  test('a 2.56x member counts double', () => {
    // Fire is super effective against both Grass and Ice.
    const d = teamDefence(chart, [mon('a', ['Grass', 'Ice'], []), null, null, null]);
    expect(row(d.rows, 'Fire').score).toBe(2);
  });
});

describe('teamOffence', () => {
  test('supports are left out of coverage unless asked for', () => {
    const healer = mon('h', ['Water'], ['heal'], [['Water', 30]]);
    const off = teamOffence(chart, [healer, null, null, null]);
    expect(off.attackers).toHaveLength(0);
    expect(off.headline).toMatch(/No DPS or Break/);
    // Its super-effective move is still shown, benched.
    expect(row(off.rows, 'Fire').benched.map((h) => h.aniimo.id)).toEqual(['h']);

    const all = teamOffence(chart, [healer, null, null, null], true);
    expect(row(all.rows, 'Fire').verdict).toBe('good');
    expect(row(all.rows, 'Fire').best).toBe(1.6);
  });

  test('only a super-effective move puts a face on the tile', () => {
    // Against Fire: the DPS only lands neutral (Lightning), the healer has Water.
    const dps = mon('d', ['Lightning'], ['dps'], [['Lightning', 40]]);
    const healer = mon('h', ['Water'], ['heal'], [['Water', 30]]);
    const fire = row(teamOffence(chart, [dps, healer, null, null]).rows, 'Fire');
    expect(fire.verdict).toBe('flat');
    expect(fire.hitters).toEqual([]);
    expect(fire.benched.map((h) => h.aniimo.id)).toEqual(['h']);
    expect(fire.note).toBe('Only supports hit this');

    // With supports counted, the healer is the answer and the DPS still is not.
    const counted = row(teamOffence(chart, [dps, healer, null, null], true).rows, 'Fire');
    expect(counted.verdict).toBe('good');
    expect(counted.hitters.map((h) => h.aniimo.id)).toEqual(['h']);
  });

  test('the core element is the Innate one, not the whole typing', () => {
    // Fire ATK and Ultimate, a 40-might Lightning side move: Fire only.
    const a = mon('a', ['Fire', 'Lightning'], ['dps'], [['Fire', 6, 'Innate'], ['Fire', 170, 'Innate'], ['Lightning', 40]]);
    expect(coreElements(a)).toEqual(['Fire']);
    expect(attackElements(a)).toEqual(['Fire']);
    // Lightning would hit Water for 1.6x; Fire is resisted.
    expect(row(teamOffence(chart, [a, null, null, null]).rows, 'Water').verdict).toBe('bad');
    // Every move with might counts once asked, however weak.
    expect(attackElements(a, true)).toEqual(['Fire', 'Lightning']);
    expect(row(teamOffence(chart, [a, null, null, null], false, true).rows, 'Water').verdict).toBe('good');
  });

  test('an outstanding move adds its element; a merely solid one does not', () => {
    const solid = mon('s', ['Grass'], ['dps'], [['Grass', 150, 'Innate'], ['Water', 69]]);
    const big = mon('b', ['Grass'], ['dps'], [['Grass', 150, 'Innate'], ['Water', 70]]);
    expect(attackElements(solid)).toEqual(['Grass']);
    expect(attackElements(big)).toEqual(['Grass', 'Water']);
    expect(row(teamOffence(chart, [big, null, null, null]).rows, 'Fire').verdict).toBe('good');
  });

  test('with no Innate moves listed, the typing is the core', () => {
    const a = mon('a', ['Fire'], ['dps'], [['Earth', 40]]);
    expect(coreElements(a)).toEqual(['Fire']);
    expect(attackElements(a)).toEqual(['Fire']);
    expect(attackElements(mon('n', ['Ice'], ['break']))).toEqual(['Ice']);
  });

  test('moves without might never count', () => {
    const a = mon('a', ['Water'], ['dps'], [['Lightning', 0], ['Water', 20, 'Innate']]);
    expect(attackElements(a)).toEqual(['Water']);
    expect(attackElements(a, true)).toEqual(['Water']);
  });

  test('a resisted element is a gap and lists no hitters', () => {
    const a = mon('a', ['Fire'], ['break'], [['Fire', 30]]);
    const off = teamOffence(chart, [a, null, null, null]);
    expect(off.gaps).toContain('Water');
    expect(row(off.rows, 'Water').hitters).toEqual([]);
    expect(attackRole(a)).toBe('break');
  });
});

describe('main moves', () => {
  /** A Stellarys-like Dark DPS: Dark ATK and Ultimate, an Ice glide, a light Water filler. */
  const skill = (name: string, element: Element, power: number, section: 'Combat' | 'Innate', description = '') => ({
    name,
    description,
    section,
    element,
    power,
    cost: null,
    offensive: true,
    source: 'wiki' as const,
  });
  const glider: Aniimo = {
    ...mon('glider', ['Dark'], ['dps']),
    skills: [
      skill('ATK', 'Dark', 6, 'Innate'),
      skill('Comet Aureus', 'Dark', 166, 'Innate'),
      skill('Chill Glide', 'Ice', 74, 'Combat', 'Flies while dropping Ice element stars to attack the target.'),
      skill('Water Bolt', 'Water', 30, 'Combat'),
    ],
  };

  test('core moves count; an off-core glide does not, however strong', () => {
    const core = coreElements(glider);
    expect(core).toEqual(['Dark']);
    expect(glider.skills.map((s) => isMainMove(s, core))).toEqual([true, true, false, false]);
    expect(isMainMove(skill('Water Dash', 'Water', 74, 'Combat', 'Dashes at the target, dealing damage.'), core)).toBe(false);
    expect(isMainMove(skill('Tidal Crash', 'Water', 74, 'Combat', 'Slams down a wave.'), core)).toBe(true);
    expect(isMainMove(skill('Shade Bolt', 'Dark', 20, 'Combat'), core)).toBe(true);
    expect(attackElements(glider)).toEqual(['Dark']);
    expect(attackElements(glider, true)).toEqual(['Dark', 'Ice', 'Water']);
  });

  test('a minor-move-only hit is benched until all moves are switched on', () => {
    // Ice hits Water for 1.6x; Dark does not, and the Water filler is resisted.
    const water = row(teamOffence(chart, [glider, null, null, null]).rows, 'Water');
    expect(water.verdict).not.toBe('good');
    expect(water.benched.map((h) => [h.aniimo.id, h.element, h.benchedFor])).toEqual([['glider', 'Ice', 'move']]);
    expect(water.note).toBe('Only minor moves hit this');

    const all = row(teamOffence(chart, [glider, null, null, null], false, true).rows, 'Water');
    expect(all.verdict).toBe('good');
    expect(all.hitters.map((h) => h.element)).toEqual(['Ice']);
    expect(all.benched).toEqual([]);
  });
});

describe('team links', () => {
  test('ids round-trip through the hash with empty slots kept in place', () => {
    const byId = new Map([mon('glacy', ['Water'], []), mon('hexxin', ['Dark'], [])].map((a) => [a.id, a]));
    const team: Team = [byId.get('glacy')!, null, byId.get('hexxin')!, null];
    const hash = formatHash({ view: 'team', ids: teamIds(team) });
    expect(hash).toBe('#/team/glacy+_+hexxin');

    const route = parseHash(hash);
    expect(route.view).toBe('team');
    if (route.view === 'team') expect(teamFrom(route.ids, byId)).toEqual(team);
  });

  test('an empty team is the bare route', () => {
    expect(formatHash({ view: 'team', ids: [null, null, null, null] })).toBe('#/team');
    const route = parseHash('#/team');
    expect(route.view === 'team' && route.ids.every((id) => id === null)).toBe(true);
  });
});

describe('recommendations', () => {
  const fireTeam: Team = [mon('a', ['Fire'], ['dps'], [['Fire', 60]]), mon('b', ['Fire'], ['dps'], [['Fire', 60]]), null, null];
  const waterPicks = (roster: Aniimo[], includeSupports = false, allMoves = false) =>
    threatPicks(roster, fireTeam, teamDefence(chart, fireTeam), includeSupports, allMoves)
      .find((t) => t.element === 'Water')!
      .picks.map((p) => p.aniimo.id);

  test('counter picks hit the element the team is weak to with a counted move', () => {
    const roster = [
      mon('splash', ['Water'], ['dps'], [['Water', 60]]),
      // Water is its second type, but its core is Fire and its Water move is light.
      mon('dasher', ['Fire', 'Water'], ['dps'], [['Fire', 150, 'Innate'], ['Water', 30]]),
      // Grass core with an outstanding Water move: counts, after the Water-typed ones.
      mon('reed', ['Grass'], ['break'], [['Water', 70]]),
      mon('healer', ['Water'], ['heal'], [['Water', 60]]),
      fireTeam[0]!,
    ];
    expect(waterPicks(roster)).toEqual(['splash', 'reed']);
    expect(waterPicks(roster, false, true)).toEqual(['splash', 'dasher', 'reed']);
    expect(waterPicks(roster, true)).toEqual(['splash', 'healer', 'reed']);
  });

  test('coverage picks close gaps, the most gaps first, never a member again', () => {
    const team: Team = [mon('a', ['Fire'], ['dps'], [['Fire', 60]]), null, null, null];
    const off = teamOffence(chart, team);
    const roster = [
      team[0]!,
      mon('one', ['Water'], ['dps'], [['Water', 60]]),
      mon('two', ['Lightning'], ['break'], [['Lightning', 60], ['Water', 70]]),
      mon('sup', ['Water'], ['sup'], [['Water', 60]]),
      mon('minor', ['Fire'], ['dps'], [['Fire', 150, 'Innate'], ['Water', 30]]),
    ];
    const picks = coveragePicks(chart, roster, team, off);
    expect(picks.map((p) => p.aniimo.id)).toEqual(['two', 'one']);
    const covered = new Set(off.rows.filter((r) => r.verdict === 'good').map((r) => r.element));
    expect(picks.every((p) => p.elements.every((e) => !covered.has(e)))).toBe(true);

    expect(coveragePicks(chart, roster, team, off, true).map((p) => p.aniimo.id)).toEqual(['two', 'one', 'sup']);
    expect(coveragePicks(chart, roster, team, off, false, true).map((p) => p.aniimo.id)).toEqual(['two', 'minor', 'one']);
  });
});
