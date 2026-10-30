/**
 * The team builder's "which moves count as coverage" rule is written twice:
 * countedSkills() in src/lib/team.ts for the app, and countedSkills() in
 * ./pages.mjs for the static /team/ page's counter table. A threshold tuned on
 * one side and not the other ships a page that contradicts the builder, with
 * no other test to notice.
 *
 * So this runs both over the whole roster and expects the same moves for every
 * attacker. It lives here rather than next to team.ts for the same reason
 * tile.test.tsx does: it reaches into the plain-JS half of the build.
 */
import { expect, test } from 'vitest';
import { dataFile } from '../../test/data';

import { attackRole, countedSkills } from '../../src/lib/team';
import type { Aniimo } from '../../src/types';

import { countedSkills as pageCountedSkills } from './pages.mjs';

const roster: Aniimo[] = JSON.parse(dataFile('aniimo.json'));
const names = (skills: { name: string }[]) => skills.map((s) => s.name).sort();

test('the static team page counts the same moves as the team builder', () => {
  const attackers = roster.filter((a) => attackRole(a));
  expect(attackers.length).toBeGreaterThan(0);
  for (const a of attackers) {
    expect(names(pageCountedSkills(a)), `${a.name} (${a.morphology})`).toEqual(names(countedSkills(a)));
  }
});
