/**
 * When aniimoguide is unavailable, sync rebuilds its share from the committed
 * roster with guideFormsFromRoster. That only works if feeding those forms back
 * through mergeRosters reproduces the entries exactly.
 */
import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { mergeRosters, guideFormsFromRoster } from './merge.mjs';

const roster = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../test/fixtures/aniimo.json', import.meta.url)), 'utf8'),
);

describe('guide fallback', () => {
  test('guide-only forms survive a round trip unchanged', () => {
    const guideOnly = roster.filter((a: { sources: string[] }) => a.sources.join() === 'guide');
    expect(guideOnly.length).toBeGreaterThan(0);
    expect(mergeRosters([], guideFormsFromRoster(guideOnly))).toEqual(guideOnly);
  });

  test('every guide-backed form is carried over, keeping stats and ids', () => {
    const forms = guideFormsFromRoster(roster);
    const backed = roster.filter((a: { sources: string[] }) => a.sources.includes('guide'));
    expect(forms.map((f) => f.slug)).toEqual(backed.map((a: { id: string }) => a.id));
    expect(forms.map((f) => f.stats)).toEqual(backed.map((a: { stats: unknown }) => a.stats));
  });
});

describe('renamed forms', () => {
  test("a wiki form pairs with aniimoguide's old name and keeps its slug", () => {
    const wiki = { name: 'Emberpup', morphology: 'Timberline Form', entryId: '001', number: '001', elements: ['Fire'], skills: [] };
    const guide = { slug: 'emberpup-mountain-woods', name: 'Emberpup', morphology: 'Mountain Woods Form', elements: ['Fire'], skills: [] };
    const [merged, ...rest] = mergeRosters([wiki], [guide]);
    expect(rest).toEqual([]);
    expect(merged).toMatchObject({ id: 'emberpup-mountain-woods', morphology: 'Timberline Form', sources: ['wiki', 'guide'] });
  });
});

describe('regions', () => {
  const wiki = (name: string, entryId: string, region: string | null, morphology = 'Basic Form') =>
    ({ name, morphology, entryId, region, elements: ['Fire'], skills: [] });

  test('regions lead the order, lowest dex number first, wiki order breaking ties', () => {
    const roster = mergeRosters(
      [
        wiki('Dazmand', '10002', 'Season 1 Keepsakes'),
        wiki('Reefish', '001', 'Whisperwake Isles'),
        wiki('Flameruff', '002', 'Breezy Plains'),
        wiki('Emberpup', '001', 'Breezy Plains'),
        wiki('Lunara', '99997', null),
      ],
      [],
      ['Season 1 Keepsakes', 'Breezy Plains', 'Whisperwake Isles'],
    );
    expect(roster.map((a) => a.name)).toEqual(['Emberpup', 'Flameruff', 'Reefish', 'Dazmand', 'Lunara']);
  });

  test('a form no source places takes the region of its other forms', () => {
    const guide = { slug: 'reefish-prismana', name: 'Reefish', morphology: 'Prismana Form', elements: ['Water'], skills: [] };
    const roster = mergeRosters([wiki('Reefish', '001', 'Whisperwake Isles')], [guide]);
    expect(roster.map((a) => a.region)).toEqual(['Whisperwake Isles', 'Whisperwake Isles']);
  });
});
