/**
 * @vitest-environment happy-dom
 *
 * The Aniimo tile is the one piece of markup this project writes twice: once
 * as <Tile> in src/components/AniimoGrid.tsx, once as aniimoTile() in
 * ./pages.mjs for the static /aniimo/ page. One `.tile` block in src/aniimo-site.css paints both, and the
 * app's version replaces the static one in place on boot, so a class renamed
 * or an element moved on one side is an unstyled tile or a visible jump on the
 * other — with no test failure anywhere else to catch it.
 *
 * So this renders the same Aniimo through both and compares the structure:
 * every tag, in order, with the classes and the data attributes the stylesheet
 * keys off. Attribute order and whitespace are not part of the comparison; the
 * shape and the hooks are.
 *
 * It lives here rather than next to the component for the same reason
 * matchups.test.ts does: it reaches across into the plain-JS half of the
 * build, which tsconfig's `include` deliberately does not cover.
 */
import { describe, expect, test } from 'vitest';
import { render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createChart } from '../../src/lib/chart';
import type { Aniimo, ChartData } from '../../src/types';
import { AniimoGrid } from '../../src/components/AniimoGrid';

import { aniimoTile } from './pages.mjs';
import { createChart as jsCreateChart } from './matchups.mjs';

const read = (name: string) => JSON.parse(readFileSync(resolve(process.cwd(), 'public/data', name), 'utf8'));

const chartData: ChartData = read('elements.json');
const roster: Aniimo[] = read('aniimo.json');

const ts = createChart(chartData);
const js = jsCreateChart(chartData);

const UP = '../';

/** The attributes the stylesheet and the tests key off, in a fixed order. */
const HOOKS = ['class', 'data-el', 'data-role', 'data-verdict', 'aria-hidden', 'href', 'alt', 'width', 'height'];

function outline(node: Element, depth = 0): string[] {
  const attrs = HOOKS.filter((a) => node.hasAttribute(a)).map((a) => `${a}=${node.getAttribute(a)}`);
  // Joined, not mapped: React splits `{a} type, {b} role.` into three text
  // nodes where the template writes one, and that is not a difference.
  const own = [...node.childNodes]
    .filter((n) => n.nodeType === 3)
    .map((n) => n.textContent)
    .join('')
    .replace(/\s+/g, ' ')
    .trim();

  return [
    `${'  '.repeat(depth)}${node.tagName.toLowerCase()}${attrs.length ? ` [${attrs.join(' ')}]` : ''}${own ? ` "${own}"` : ''}`,
    ...[...node.children].flatMap((c) => outline(c, depth + 1)),
  ];
}

const staticTile = (a: Aniimo): Element => {
  const host = document.createElement('div');
  host.innerHTML = aniimoTile(js, UP, a);
  return host.querySelector('a.tile')!;
};

const appTile = (a: Aniimo): Element => {
  const { container } = render(
    <AniimoGrid chart={ts} roster={[a]} siteRoot={UP} onSelect={() => {}} />,
  );
  return container.querySelector('a.tile')!;
};

/** One of each shape the tile has to handle, by id. */
const CASES = [
  ['single element', (a: Aniimo) => a.elements.length === 1],
  ['dual element', (a: Aniimo) => a.elements.length === 2],
  // `energy` has no glyph in the artwork, so its badge falls back to text.
  ['a role with no glyph', (a: Aniimo) => a.roles.includes('energy')],
  ['a regional form, whose display name is the long one', (a: Aniimo) => !a.isBasic],
] as const;

describe('the app tile and the prerendered tile', () => {
  for (const [what, match] of CASES) {
    test(`are the same markup for ${what}`, () => {
      const a = roster.find(match);
      expect(a, `no Aniimo in the roster matches "${what}"`).toBeTruthy();
      expect(outline(appTile(a!)).join('\n')).toBe(outline(staticTile(a!)).join('\n'));
    });
  }

  test('say the same thing in the text a screen reader is left with', () => {
    for (const a of roster.slice(0, 30)) {
      const spoken = (el: Element) =>
        [...el.querySelectorAll('.sr-only')].map((s) => s.textContent?.trim()).join(' | ');
      expect(spoken(appTile(a))).toBe(spoken(staticTile(a)));
    }
  });

  test('draw all five bands on every form in the roster', () => {
    for (const a of roster) {
      const host = document.createElement('div');
      host.innerHTML = aniimoTile(js, UP, a);
      expect(host.querySelectorAll('.tile__band')).toHaveLength(5);
    }
  });
});
