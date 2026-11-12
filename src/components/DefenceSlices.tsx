import { BANDS, formatMultiplier, verdict, type Chart } from '../lib/chart';
import { list } from '../lib/data';
import {
  badgeArrows,
  BOUNDARIES,
  C,
  NEUTRAL,
  RINGS,
  SLICES_VIEWBOX,
  slicesModel,
  type Slice,
  type SlicesMode,
} from '../lib/slices';
import type { Element } from '../types';

const slug = (s: string) => s.toLowerCase();

/** Least damage to most, left to right. */
const LEGEND = [...BANDS].reverse();

/** The start of what the picture announces. */
export function slicesSummary(slices: readonly Slice[], mode: SlicesMode): string {
  const weak = slices.filter((s) => s.verdict === 'bad').map((s) => s.element);
  const res = slices.filter((s) => s.verdict === 'good').map((s) => s.element);
  return [
    mode === 'toughness' ? 'Fuller slice = tougher; thin slices are weaknesses.' : 'Fuller slice = takes more damage.',
    weak.length ? `Weak to ${list(weak)}.` : 'Weak to nothing.',
    res.length ? `Resists ${list(res)}.` : '',
  ]
    .filter(Boolean)
    .join(' ');
}

/**
 * A defender's whole spread as nine wedges, one per attacking element.
 *
 * The band list says the same thing grouped by multiplier; this says it by
 * element, in a fixed position each time, so two Aniimo can be compared by
 * shape. `mode` sets what "full" means - tougher (the default), or more
 * damage taken. There is no switch for it on the page; it is a prop.
 *
 * Colour comes from data attributes like everywhere else: each label carries
 * its element's data-el, each wedge its data-verdict. Styles live in the
 * "Defence slices" section of src/aniimo-site.css. Geometry: src/lib/slices.ts.
 */
export function DefenceSlices({
  chart,
  defenders,
  mode = 'toughness',
}: {
  chart: Chart;
  defenders: readonly Element[];
  mode?: SlicesMode;
}) {
  const slices = slicesModel(chart, defenders, mode);

  // The picture's accessible name: the summary, then every number.
  const spoken = `${slicesSummary(slices, mode)} ${slices
    .map((s) => `${s.element} ${formatMultiplier(s.multiplier)}`)
    .join(', ')}.`;

  return (
    <div className="slices" data-mode={mode}>
      <svg className="slices__svg" viewBox={SLICES_VIEWBOX} role="img" aria-label={spoken}>
        <g className="slices__rings">
          {RINGS.map((r) => (
            <polygon key={r.level} points={r.points} data-level={r.level} />
          ))}
        </g>
        <g className="slices__ticks">
          {BOUNDARIES.map((b, i) => (
            <line key={i} x1={b.tick[0].x} y1={b.tick[0].y} x2={b.tick[1].x} y2={b.tick[1].y} />
          ))}
        </g>
        <g className="slices__gaps">
          {slices.flatMap((s) =>
            s.gaps.map((g, i) => (
              <polygon key={`${s.element}-${i}`} points={g.points} data-deep={g.deep ? 'true' : undefined} />
            )),
          )}
        </g>
        <g className="slices__kites">
          {slices.map((s) => (
            <polygon key={s.element} points={s.kite} />
          ))}
        </g>
        <polygon className="slices__neutral" points={NEUTRAL} />
        <g className="slices__spokes">
          {BOUNDARIES.map((b, i) => (
            <line key={i} x1={C} y1={C} x2={b.spoke.x} y2={b.spoke.y} />
          ))}
        </g>
        <rect className="slices__hub" x={C - 7} y={C - 7} width={14} height={14} rx={2} transform={`rotate(45 ${C} ${C})`} />
        <g className="slices__rims">
          {slices
            .filter((s) => s.verdict !== 'flat')
            .map((s) => (
              <polygon key={s.element} points={s.rim} data-verdict={s.verdict} />
            ))}
        </g>
        {slices.map((s) => (
          <g
            key={s.element}
            className="slices__label"
            data-el={slug(s.element)}
            data-verdict={s.verdict}
            transform={`translate(${s.label.x},${s.label.y})`}
          >
            <rect className="slices__plate" x={-14} y={-14} width={28} height={28} rx={8} />
            <svg x={-9} y={-9} width={18} height={18} className="slices__icon">
              <use href={`#el-${slug(s.element)}`} />
            </svg>
            {s.arrows && (
              <g className="slices__badge" transform="translate(15,-13)">
                <circle r={8} />
                <path d={s.arrows} />
              </g>
            )}
            <text className="slices__name" y={29}>
              {s.element.toUpperCase()}
            </text>
          </g>
        ))}
      </svg>

      {/* The key to the badges on the labels: the five bands, resisted twice
          to hits both halves, each with the badge it wears. */}
      <div className="slices__legend" aria-hidden="true">
        {LEGEND.map((b) => (
          <span key={b.key} data-verdict={verdict(b.mult)}>
            {b.arrows === 0 ? (
              <svg viewBox="0 0 18 14" className="slices__legendLine">
                <line x1={1} y1={7} x2={17} y2={7} />
              </svg>
            ) : (
              <svg viewBox="-8 -8 16 16">
                <circle r={8} />
                <path d={badgeArrows(b.arrows)} />
              </svg>
            )}
            {b.label}
            <span className="slices__term">{b.term.toLowerCase()}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
