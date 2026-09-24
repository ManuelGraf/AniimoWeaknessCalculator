/**
 * @vitest-environment happy-dom
 *
 * The element graph is written twice, like the Aniimo tile: <ElementGraph> in
 * src/components/ElementGraph.tsx for the app, graphCard() in ./graph.mjs for
 * the static pages. On /chart/ the app's copy replaces the static one on boot,
 * so any difference is a visible jump; on an element page the static copy is
 * the only one there is.
 *
 * So this holds the two to the same geometry for every element, the same
 * markup at rest and with an element selected, and checks the hand-placed
 * layout still does what it was placed to do.
 */
import { describe, expect, test } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createChart } from '../../src/lib/chart';
import { graphModel, LAYOUT } from '../../src/lib/graph';
import type { ChartData, Element as El } from '../../src/types';
import { ElementGraph } from '../../src/components/ElementGraph';

import { graphCard, graphModel as jsGraphModel } from './graph.mjs';
import { createChart as jsCreateChart } from './matchups.mjs';

const chartData: ChartData = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/elements.json'), 'utf8'),
);

const ts = createChart(chartData);
const js = jsCreateChart(chartData);

const UP = '../';

/**
 * The attributes the stylesheet keys off plus the geometry. What differs by
 * design is left out: the static nodes are links (href, aria-current) and
 * the app's are toggle buttons (aria-pressed), so `a` and `button` are read
 * as the same tag.
 */
const HOOKS = [
  'class', 'data-el', 'data-kind', 'data-rel', 'data-active', 'aria-hidden', 'aria-live',
  'viewBox', 'd', 'x', 'y', 'width', 'height', 'rx', 'style',
];

function outline(node: Element, depth = 0): string[] {
  const tag = node.tagName.toLowerCase() === 'a' ? 'button' : node.tagName.toLowerCase();
  const attrs = HOOKS.filter((a) => node.hasAttribute(a)).map((a) => `${a}=${node.getAttribute(a)}`);
  const own = [...node.childNodes]
    .filter((n) => n.nodeType === 3)
    .map((n) => n.textContent)
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
  return [
    `${'  '.repeat(depth)}${tag}${attrs.length ? ` [${attrs.join(' ')}]` : ''}${own ? ` "${own}"` : ''}`,
    ...[...node.children].flatMap((c) => outline(c, depth + 1)),
  ];
}

const staticCard = (active: El | null): Element => {
  const host = document.createElement('div');
  host.innerHTML = graphCard(js, UP, { active });
  return host.querySelector('.graph-card')!;
};

const appCard = (active: El | null): Element => {
  const { container } = render(<ElementGraph chart={ts} onOpen={() => {}} />);
  if (active) fireEvent.click(container.querySelector(`.graph__node[data-el="${active.toLowerCase()}"]`)!);
  return container.querySelector('.graph-card')!;
};

describe('the app graph and the prerendered graph', () => {
  test('compute the same geometry for every element, and for none', () => {
    for (const active of [null, ...ts.order]) {
      expect(jsGraphModel(js, active)).toEqual(graphModel(ts, active));
    }
  });

  test('are the same markup at rest', () => {
    expect(outline(appCard(null)).join('\n')).toBe(outline(staticCard(null)).join('\n'));
  });

  test('are the same markup with an element selected', () => {
    for (const el of ['Fire', 'Dark'] as const) {
      expect(outline(appCard(el)).join('\n')).toBe(outline(staticCard(el)).join('\n'));
    }
  });
});

describe('the app graph', () => {
  test('pins on click, lets go on a second click, on Escape and on the background', () => {
    const { container } = render(<ElementGraph chart={ts} onOpen={() => {}} />);
    const graph = container.querySelector('.graph')!;
    const fire = container.querySelector<HTMLButtonElement>('.graph__node[data-el="fire"]')!;

    fireEvent.click(fire);
    expect(graph.getAttribute('data-active')).toBe('fire');
    expect(fire.getAttribute('aria-pressed')).toBe('true');
    expect(container.querySelector('.graph-read')!.textContent).toContain('Weak to');

    fireEvent.click(fire);
    expect(graph.hasAttribute('data-active')).toBe(false);

    fireEvent.click(fire);
    fireEvent.keyDown(fire, { key: 'Escape' });
    expect(graph.hasAttribute('data-active')).toBe(false);

    fireEvent.click(fire);
    fireEvent.click(container.querySelector('.graph__svg')!);
    expect(graph.hasAttribute('data-active')).toBe(false);
  });

  test('opens the calculator on the pinned element', () => {
    let opened: string | null = null;
    const { container, getByRole } = render(<ElementGraph chart={ts} onOpen={(el) => (opened = el)} />);
    fireEvent.click(container.querySelector('.graph__node[data-el="ice"]')!);
    fireEvent.click(getByRole('button', { name: 'Open Ice in the calculator' }));
    expect(opened).toBe('Ice');
  });
});

type Pt = [number, number];

/** Points along an edge's quadratic path, read back out of its `d`. */
function sample(d: string): Pt[] {
  const n = d.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
  const [x0, y0, cx, cy, x2, y2] = n as [number, number, number, number, number, number];
  return Array.from({ length: 41 }, (_, i) => {
    const t = i / 40;
    const u = 1 - t;
    return [u * u * x0 + 2 * u * t * cx + t * t * x2, u * u * y0 + 2 * u * t * cy + t * t * y2] as Pt;
  });
}

const cross = (a: Pt, b: Pt, c: Pt, d: Pt) => {
  const o = (p: Pt, q: Pt, r: Pt) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
};

describe('the graph layout', () => {
  const rest = graphModel(ts, null);

  test('draws every strong matchup in the chart and nothing else at rest', () => {
    const drawn = rest.edges.map((e) => `${e.from}>${e.to}`).sort();
    const chart = ts.order.flatMap((a) => ts.defs[a].strongAgainst.map((d) => `${a}>${d}`)).sort();
    expect(drawn).toEqual(chart);
    expect(rest.edges.every((e) => e.kind === 'strong' && e.rel === null)).toBe(true);
  });

  test('never runs an arrow through a node it does not touch', () => {
    // A plate is 66 units across (11% of 600), so its edge is 33 from the centre.
    for (const e of rest.edges) {
      for (const el of ts.order) {
        if (el === e.from || el === e.to) continue;
        const [nx, ny] = LAYOUT[el];
        const closest = Math.min(...sample(e.d).map(([x, y]) => Math.hypot(x - nx, y - ny)));
        expect(closest, `${e.from} -> ${e.to} passes ${el}`).toBeGreaterThan(50);
      }
    }
  });

  test('crosses no more strong edges than the chart forces', () => {
    // The strong graph is not planar, so some crossing is unavoidable. This
    // layout has two, both where a routed edge goes round a node: Water -> Fire
    // over Earth -> Ice, and Wind -> Grass over Dark -> Lightning. Pinned so a
    // nudge cannot quietly add a third.
    const paths = rest.edges.map((e) => ({ e, pts: sample(e.d) }));
    let crossings = 0;
    for (let i = 0; i < paths.length; i++) {
      for (let j = i + 1; j < paths.length; j++) {
        const a = paths[i]!;
        const b = paths[j]!;
        if (new Set([a.e.from, a.e.to, b.e.from, b.e.to]).size < 4) continue;
        let hit = false;
        for (let s = 0; s < 40 && !hit; s++) {
          for (let t = 0; t < 40 && !hit; t++) {
            hit = cross(a.pts[s]!, a.pts[s + 1]!, b.pts[t]!, b.pts[t + 1]!);
          }
        }
        if (hit) crossings++;
      }
    }
    expect(crossings).toBeLessThanOrEqual(2);
  });

  test('draws the resists of the active element only, and rings the ones that resist themselves', () => {
    for (const el of ts.order) {
      const { edges, nodes } = graphModel(ts, el);
      const resists = edges.filter((e) => e.kind === 'resist');
      expect(resists.every((e) => e.from === el || e.to === el)).toBe(true);

      const out = ts.defs[el].resistedBy.filter((d) => d !== el).length;
      const into = ts.order.filter((a) => a !== el && ts.defs[a].resistedBy.includes(el)).length;
      expect(resists).toHaveLength(out + into);

      const ring = nodes.find((n) => n.element === el)!.ring;
      expect(ring).toBe(ts.defs[el].resistedBy.includes(el));
    }
    // The one exception the chart has.
    expect(graphModel(ts, 'Dark').nodes.find((n) => n.element === 'Dark')!.ring).toBe(false);
  });
});
