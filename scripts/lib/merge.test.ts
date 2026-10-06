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
