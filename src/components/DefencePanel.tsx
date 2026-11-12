import { formatMultiplier, verdict, type Chart } from '../lib/chart';
import type { Element } from '../types';
import { BandArrows, ElChip } from './ElementBadge';

/**
 * Incoming damage, grouped by how hard it lands.
 *
 * The grouping is what keeps the five bands legible: data-verdict only says
 * "takes more / resists / neutral", so 2.56x and 1.6x share a colour. Each
 * group keeps its own label and blurb, which is where the difference lives.
 */
export function DefencePanel({ chart, defenders }: { chart: Chart; defenders: Element[] }) {
  // All five bands, always, like the Aniimo tile's spread bar: an empty band
  // keeps its box so the list holds the same shape from one pick to the next.
  const groups = chart.spreadByBand(defenders);

  return (
    <div className="bands">
      {groups.map(({ band: b, entries }) => (
        <section
          key={b.key}
          aria-label={`${b.label} ${b.term}`}
          className="band"
          data-verdict={verdict(b.mult)}
          data-empty={entries.length ? undefined : 'true'}
        >
          <div>
            <div className="band__mult">
              <BandArrows arrows={b.arrows} />
              {b.label}
            </div>
            <div className="band__blurb">{b.term}</div>
          </div>
          <div className="band__items">
            {entries.length ? (
              entries.map((e) => <ElChip key={e.element} element={e.element} />)
            ) : (
              <span className="band__none">None</span>
            )}
          </div>
        </section>
      ))}

      {defenders.length === 2 && (
        <p className="note">
          Both element sides are applied, so multipliers stack: 1.6 × 1.6 ={' '}
          {formatMultiplier(2.56)}, and a resistance can cancel a weakness out to 1×.
        </p>
      )}
    </div>
  );
}
