/**
 * Geometry for the element relation graph. No React and no DOM: it turns the
 * chart and the element being inspected into nodes and edges with their paths
 * already worked out, and both renderers draw exactly what comes back.
 *
 * Mirrored in scripts/lib/graph.mjs for the prerendered pages, and
 * scripts/lib/graph.test.tsx holds the two to the same output for every
 * element, the same way matchups.test.ts holds the maths.
 *
 * The layout is placed by hand, not computed. It follows the community chart
 * the graph was modelled on (Light at the top, Fire at the bottom, Grass and
 * Ice on the wings) because that picture is the one players already know.
 * The 19 strong edges cannot be drawn in a plane without a crossing - a search
 * over free positions bottoms out at one - so the two arrows the reference
 * runs straight through a node are routed around it instead, in ROUTES.
 */
import { formatMultiplier, type Chart } from './chart';
import type { Element } from '../types';

export const GRAPH_W = 600;
export const GRAPH_H = 800;

/** Node centres in viewBox units. */
export const LAYOUT: Record<Element, readonly [number, number]> = {
  Light: [300, 55],
  Dark: [190, 165],
  Wind: [410, 165],
  Lightning: [300, 280],
  Grass: [55, 370],
  Ice: [545, 370],
  Water: [300, 445],
  Earth: [300, 595],
  Fire: [300, 745],
};

/**
 * Quadratic control points for the edges that would otherwise pass through a
 * node they do not touch: Wind -> Grass threads the gap between Dark and
 * Lightning, and Water -> Fire swings round the right of Earth.
 */
export const ROUTES: Record<string, readonly [number, number]> = {
  'Wind>Grass': [258, 177],
  'Water>Fire': [470, 595],
};

/** How far short of a node's centre an edge stops: the plate, plus a gap. */
const TRIM = 42;
const HEAD_LENGTH = 14;
const HEAD_HALF_WIDTH = 7;

/**
 * Sideways offset of the control point, as a share of the edge's length. The
 * sign is always "left of travel", so a pair of opposed edges - Dark and Light,
 * or a strong edge and the resist coming back - bows apart instead of drawing
 * one on top of the other.
 */
const PAIR_BEND = 0.18;
/** A resist edge tries these in turn and keeps the one that clears the most nodes. */
const RESIST_BENDS = [0.22, -0.22, 0.4, -0.4];

export type EdgeKind = 'strong' | 'resist';
/** How an edge relates to the active element: it attacks out of it, or into it. */
export type EdgeRel = 'out' | 'in';
export type NodeRel = 'self' | 'linked';

export interface GraphEdge {
  from: Element;
  to: Element;
  kind: EdgeKind;
  /** The stroke, trimmed at both ends so it stops short of the plates. */
  d: string;
  /** The arrowhead, a closed triangle at the defender's end. */
  head: string;
  /** Midpoint of the curve, where the multiplier label sits. */
  lx: number;
  ly: number;
  label: string;
  rel: EdgeRel | null;
}

export interface GraphNode {
  element: Element;
  x: number;
  y: number;
  rel: NodeRel | null;
  /** The active element resists its own attacks, drawn as a ring rather than a loop. */
  ring: boolean;
}

export interface GraphModel {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

type Pt = readonly [number, number];

const r1 = (n: number) => Math.round(n * 10) / 10;
const pt = ([x, y]: Pt) => `${r1(x)} ${r1(y)}`;

function unit(a: Pt, b: Pt): Pt {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  return [dx / len, dy / len];
}

/** Point at t on the quadratic curve p0 -> c -> p2. */
function bezier(p0: Pt, c: Pt, p2: Pt, t: number): Pt {
  const u = 1 - t;
  return [u * u * p0[0] + 2 * u * t * c[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p2[1]];
}

/** Control point offset sideways from the midpoint by `bend` of the length. */
function bent(p0: Pt, p2: Pt, bend: number): Pt {
  const [ux, uy] = unit(p0, p2);
  const len = Math.hypot(p2[0] - p0[0], p2[1] - p0[1]);
  const mx = (p0[0] + p2[0]) / 2;
  const my = (p0[1] + p2[1]) / 2;
  return [mx + uy * bend * len, my - ux * bend * len];
}

/** Closest the curve comes to any node other than its own two ends. */
function clearance(p0: Pt, c: Pt, p2: Pt, ends: Element[], order: readonly Element[]): number {
  let min = Infinity;
  for (const el of order) {
    if (ends.includes(el)) continue;
    const n = LAYOUT[el];
    for (let i = 1; i < 20; i++) {
      const p = bezier(p0, c, p2, i / 20);
      min = Math.min(min, Math.hypot(p[0] - n[0], p[1] - n[1]));
    }
  }
  return min;
}

function edge(
  from: Element,
  to: Element,
  kind: EdgeKind,
  control: Pt,
  label: string,
  rel: EdgeRel | null,
): GraphEdge {
  const p0 = LAYOUT[from];
  const p2 = LAYOUT[to];
  const out = unit(p0, control);
  const inward = unit(control, p2);

  const start: Pt = [p0[0] + out[0] * TRIM, p0[1] + out[1] * TRIM];
  const tip: Pt = [p2[0] - inward[0] * TRIM, p2[1] - inward[1] * TRIM];
  // The stroke stops inside the arrowhead so its square end never pokes out.
  const end: Pt = [tip[0] - inward[0] * (HEAD_LENGTH - 4), tip[1] - inward[1] * (HEAD_LENGTH - 4)];
  const base: Pt = [tip[0] - inward[0] * HEAD_LENGTH, tip[1] - inward[1] * HEAD_LENGTH];
  const side: Pt = [-inward[1] * HEAD_HALF_WIDTH, inward[0] * HEAD_HALF_WIDTH];

  const [lx, ly] = bezier(start, control, tip, 0.5);

  return {
    from,
    to,
    kind,
    d: `M${pt(start)} Q${pt(control)} ${pt(end)}`,
    head: `M${pt(tip)} L${pt([base[0] + side[0], base[1] + side[1]])} L${pt([base[0] - side[0], base[1] - side[1]])}Z`,
    lx: r1(lx),
    ly: r1(ly),
    label,
    rel,
  };
}

/**
 * Everything the graph draws, given the element being inspected (or none).
 *
 * At rest that is the 19 strong edges only. Resist edges are drawn just for the
 * active element: all 27 at once is a hairball, and it is the uncluttered
 * picture that made the reference worth copying.
 */
export function graphModel(chart: Chart, active: Element | null): GraphModel {
  const { order, defs, multipliers } = chart;
  const strongLabel = formatMultiplier(multipliers.strong);
  const resistLabel = formatMultiplier(multipliers.resisted);

  const relOf = (from: Element, to: Element): EdgeRel | null =>
    active === null ? null : from === active ? 'out' : to === active ? 'in' : null;

  const edges: GraphEdge[] = [];

  for (const from of order) {
    for (const to of defs[from].strongAgainst) {
      const p0 = LAYOUT[from];
      const p2 = LAYOUT[to];
      const routed = ROUTES[`${from}>${to}`];
      const opposed = defs[to].strongAgainst.includes(from);
      const control: Pt = routed ?? (opposed ? bent(p0, p2, PAIR_BEND) : [(p0[0] + p2[0]) / 2, (p0[1] + p2[1]) / 2]);
      edges.push(edge(from, to, 'strong', control, strongLabel, relOf(from, to)));
    }
  }

  if (active !== null) {
    const resisted: Array<[Element, Element]> = [
      ...defs[active].resistedBy.filter((d) => d !== active).map((d): [Element, Element] => [active, d]),
      ...order
        .filter((a) => a !== active && defs[a].resistedBy.includes(active))
        .map((a): [Element, Element] => [a, active]),
    ];

    for (const [from, to] of resisted) {
      const p0 = LAYOUT[from];
      const p2 = LAYOUT[to];
      let best = bent(p0, p2, RESIST_BENDS[0]!);
      let bestClear = -1;
      for (const b of RESIST_BENDS) {
        const c = bent(p0, p2, b);
        const clear = clearance(p0, c, p2, [from, to], order);
        if (clear > bestClear + 0.5) {
          best = c;
          bestClear = clear;
        }
      }
      edges.push(edge(from, to, 'resist', best, resistLabel, relOf(from, to)));
    }
  }

  const linked = new Set<Element>();
  for (const e of edges) {
    if (e.rel) linked.add(e.from === active ? e.to : e.from);
  }

  const nodes: GraphNode[] = order.map((element) => ({
    element,
    x: LAYOUT[element][0],
    y: LAYOUT[element][1],
    rel: active === null ? null : element === active ? 'self' : linked.has(element) ? 'linked' : null,
    ring: element === active && defs[element].resistedBy.includes(element),
  }));

  return { nodes, edges };
}

/** What the readout beside the graph says about one element. */
export function relations(chart: Chart, el: Element) {
  const { order, defs } = chart;
  return {
    strongAgainst: defs[el].strongAgainst,
    resistedBy: defs[el].resistedBy,
    weakTo: order.filter((a) => defs[a].strongAgainst.includes(el)),
    resists: order.filter((a) => defs[a].resistedBy.includes(el)),
  };
}

/** Percentage position of a node inside the graph box, for the HTML node on top of the SVG. */
export const nodeLeft = (x: number) => `${r1((x / GRAPH_W) * 100)}%`;
export const nodeTop = (y: number) => `${r1((y / GRAPH_H) * 100)}%`;

/** The pill behind a multiplier label, sized from the text rather than measured so both renderers agree. */
export function labelRect(e: GraphEdge) {
  const w = e.label.length * 11 + 16;
  return { x: r1(e.lx - w / 2), y: r1(e.ly - 13), width: w, height: 26 };
}
