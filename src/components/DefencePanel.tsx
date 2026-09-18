import { BANDS, band, formatMultiplier, type Chart } from '../lib/chart';
import type { Element } from '../types';
import { ElementBadge } from './ElementBadge';

const BAND_COLOR: Record<string, string> = {
  x256: 'var(--color-band-crit)',
  x16: 'var(--color-band-weak)',
  x1: 'var(--color-band-neutral)',
  x0625: 'var(--color-band-resist)',
  x039: 'var(--color-band-immune)',
};

/** Incoming damage, grouped by how hard it lands. */
export function DefencePanel({ chart, defenders }: { chart: Chart; defenders: Element[] }) {
  const spread = chart.defenceSpread(defenders);

  const groups = BANDS.map((b) => ({
    band: b,
    entries: spread.filter((s) => band(s.multiplier).key === b.key),
  })).filter((g) => g.entries.length > 0);

  return (
    <div className="flex flex-col gap-2.5">
      {groups.map(({ band: b, entries }) => (
        <section
          key={b.key}
          aria-label={`${b.label} ${b.blurb}`}
          className="grid grid-cols-[5.5rem_1fr] items-center gap-3 rounded-xl border border-white/6 bg-white/2 p-3 sm:grid-cols-[7rem_1fr]"
          style={{ borderLeft: `3px solid ${BAND_COLOR[b.key]}` }}
        >
          <div>
            <div className="font-mono text-lg leading-none font-bold" style={{ color: BAND_COLOR[b.key] }}>
              {b.label}
            </div>
            <div className="mt-1 text-[11px] text-ink-400">{b.blurb}</div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {entries.map((e) => (
              <ElementBadge key={e.element} element={e.element} def={chart.defs[e.element]} />
            ))}
          </div>
        </section>
      ))}

      {defenders.length === 2 && (
        <p className="px-1 text-[11px] text-ink-400">
          Both element sides are applied, so multipliers stack:{' '}
          <span className="font-mono text-ink-300">
            1.6 × 1.6 = {formatMultiplier(2.56)}
          </span>
          , and a resistance can cancel a weakness out to 1×.
        </p>
      )}
    </div>
  );
}
