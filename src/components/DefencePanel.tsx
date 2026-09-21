import { formatMultiplier, verdict, type Chart } from '../lib/chart';
import type { Element } from '../types';
import { ElChip } from './ElementBadge';

/**
 * Incoming damage, grouped by how hard it lands.
 *
 * The grouping is what keeps the five bands legible: data-verdict only says
 * "takes more / resists / neutral", so 2.56x and 1.6x share a colour. Each
 * group keeps its own label and blurb, which is where the difference lives.
 */
export function DefencePanel({ chart, defenders }: { chart: Chart; defenders: Element[] }) {
  // Shared with the Aniimo tile's spread bar, which keeps the empty bands to
  // hold its columns in line; a panel with nothing in a band just drops it.
  const groups = chart.spreadByBand(defenders).filter((g) => g.entries.length > 0);

  return (
    <div className="bands">
      {groups.map(({ band: b, entries }) => (
        <section
          key={b.key}
          aria-label={`${b.label} ${b.blurb}`}
          className="band"
          data-verdict={verdict(entries[0]!.multiplier)}
        >
          <div>
            <div className="band__mult">{b.label}</div>
            <div className="band__blurb">{b.blurb}</div>
          </div>
          <div className="band__items">
            {entries.map((e) => (
              <ElChip key={e.element} element={e.element} />
            ))}
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
