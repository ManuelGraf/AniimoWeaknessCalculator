/**
 * Geometry for the defence slices chart (src/components/DefenceSlices.tsx).
 *
 * Pure maths, no React: nine wedges round a nonagon, one per attacking
 * element in chart order, Fire at twelve o'clock and clockwise from there.
 * A wedge's length is its band, counted in fifths of the radius, so the five
 * possible results against a dual (0.39 / 0.625 / 1 / 1.6 / 2.56) each get
 * their own ring and the neutral one sits on the dashed line in the middle.
 *
 * Two readings of the same numbers:
 *
 * - "damage": fuller = takes more. 2.56x fills the wedge, 0.39x is a stub.
 * - "toughness": fuller = shrugs it off. The same wedges turned inside out,
 *   with the gap a weakness leaves below the neutral line tinted, so a thin
 *   slice reads as a hole rather than as nothing.
 *
 * Taken from the "Defence star chart" design canvas (the Slices artboards).
 */
import { BANDS, band, round, verdict, type Chart, type Verdict } from './chart';
import type { Element } from '../types';

export type SlicesMode = 'damage' | 'toughness';

/**
 * The SVG's drawing box: the nonagon is centred on (C, C), labels hang outside
 * it. A label is a plate, its band badge and the name - no number, the legend
 * carries those - which is what lets R take most of the box.
 */
export const SLICES_VIEWBOX = '-46 -46 492 490';
export const C = 200;
export const R = 175;
/** Distance from the centre to a label plate's centre. */
const LABEL_R = R + 46;
const N = 9;
const H = Math.PI / N; // half a wedge

const pt = (r: number, a: number) => `${(C + r * Math.cos(a)).toFixed(1)},${(C + r * Math.sin(a)).toFixed(1)}`;
const axis = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / N;

/** A nonagon with a vertex on every axis, as an SVG `points` list. */
export function nonagon(r: number): string {
  return Array.from({ length: N }, (_, i) => pt(r, axis(i))).join(' ');
}

/**
 * One wedge's band of the nonagon between two levels (in fifths of R): the
 * two half-edges either side of the axis at the outer level, back along the
 * inner one.
 */
function segment(a: number, l0: number, l1: number): string {
  const r0 = (R * Math.min(l0, 5)) / 5;
  const r1 = (R * Math.min(l1, 5)) / 5;
  const c = Math.cos(H);
  return [
    pt(r0 * c, a - H),
    pt(r0, a),
    pt(r0 * c, a + H),
    pt(r1 * c, a + H),
    pt(r1, a),
    pt(r1 * c, a - H),
  ].join(' ');
}

/**
 * The background rings, outermost first. Each is drawn as a nonagon 5 units
 * inside its level with a 10-unit round-joined stroke, which lands its edge on
 * the level and softens the corners.
 */
export const RINGS = [5, 4, 3, 2, 1].map((level) => ({ level, points: nonagon((R * level) / 5 - 5) }));

/** The neutral (1x) line: level 3. */
export const NEUTRAL = nonagon((R * 3) / 5);

/** Wedge boundaries: a spoke from the centre and a tick past the rim. */
export const BOUNDARIES = Array.from({ length: N }, (_, i) => {
  const a = axis(i) + H;
  const at = (r: number) => ({ x: +(C + r * Math.cos(a)).toFixed(1), y: +(C + r * Math.sin(a)).toFixed(1) });
  return { spoke: at(R - 8), tick: [at(R + 14), at(R + 30)] as const };
});

/**
 * The badge's triangles for a band, on a circle of radius 8: down for more
 * damage, up for less, one per side that lands, none for neutral. Shared by
 * the labels and the legend.
 */
export function badgeArrows(arrows: number): string {
  if (arrows === 0) return '';
  const tri = (ox: number) => {
    const x = (ox - 3).toFixed(1);
    return arrows > 0 ? `M${x} -2h6l-3 5z` : `M${x} 2.5h6l-3 -5z`;
  };
  return Math.abs(arrows) === 2 ? tri(-2.6) + tri(2.6) : tri(0);
}

export interface Slice {
  element: Element;
  multiplier: number;
  verdict: Verdict;
  /** Which of the five bands, as BANDS[] reads them (0 = 2.56x … 4 = 0.39x). */
  bandIndex: number;
  /** How far out the wedge reaches, 1-5. */
  level: number;
  /** The filled wedge. */
  kite: string;
  /** The coloured strip along its outer edge. Drawn only when not neutral. */
  rim: string;
  /** Toughness only: the gap a weakness leaves, as one or two tinted segments. */
  gaps: { points: string; deep: boolean }[];
  /** Where the label group is centred. */
  label: { x: number; y: number };
  /** Triangles for the badge: down for more damage, up for less, one per side that lands. */
  arrows: string;
}

export function slicesModel(chart: Chart, defenders: readonly Element[], mode: SlicesMode): Slice[] {
  const tough = mode === 'toughness';
  const c = Math.cos(H);

  return chart.order.map((element, i) => {
    const multiplier = round(chart.against(element, defenders));
    const b = band(multiplier);
    const bandIndex = BANDS.indexOf(b);
    const level = tough ? bandIndex + 1 : 5 - bandIndex;
    const a = axis(i);
    const r = (R * level) / 5;
    const ir = r - 6;
    const v = verdict(multiplier);

    const gaps: Slice['gaps'] = [];
    if (tough && v === 'bad') {
      gaps.push({ points: segment(a, 2, 3), deep: false });
      if (level < 2) gaps.push({ points: segment(a, 1, 2), deep: true });
    }

    return {
      element,
      multiplier,
      verdict: v,
      bandIndex,
      level,
      kite: `${C},${C} ${pt(r * c, a - H)} ${pt(r, a)} ${pt(r * c, a + H)}`,
      rim: [pt(r * c, a - H), pt(r, a), pt(r * c, a + H), pt(ir * c, a + H), pt(ir, a), pt(ir * c, a - H)].join(' '),
      gaps,
      label: { x: +(C + LABEL_R * Math.cos(a)).toFixed(1), y: +(C + LABEL_R * Math.sin(a)).toFixed(1) },
      arrows: badgeArrows(b.arrows),
    };
  });
}
