import { band, formatMultiplier, type Chart } from '../lib/chart';
import { elVars } from './ElementBadge';

const BAND_COLOR: Record<string, string> = {
  x16: 'var(--color-band-weak)',
  x1: 'var(--color-band-neutral)',
  x0625: 'var(--color-band-resist)',
};

/** The raw 9x9 chart, rows attack and columns defend. */
export function MatrixView({ chart }: { chart: Chart }) {
  const rows = chart.matrix();

  return (
    <div className="card p-4 sm:p-6">
      <header className="mb-4">
        <h2 className="text-lg font-semibold">Element chart</h2>
        <p className="mt-1 text-sm text-ink-300">
          Rows attack, columns defend. Read across a row to see what that element does to everything else.
        </p>
      </header>

      <div className="scroll-slim -mx-2 overflow-x-auto px-2">
        <table className="w-full border-separate border-spacing-1 text-center">
          <caption className="sr-only">Damage multiplier for each attacking element against each defending element</caption>
          <thead>
            <tr>
              <th scope="col" className="w-20 text-left text-[10px] font-medium tracking-wider text-ink-400 uppercase">
                Atk ╲ Def
              </th>
              {chart.order.map((d) => (
                <th key={d} scope="col" className="px-1 pb-1">
                  <span
                    className="text-[10px] font-semibold tracking-wider uppercase"
                    style={{ color: chart.defs[d]?.text }}
                  >
                    {d.slice(0, 4)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.element}>
                <th scope="row" className="pr-2 text-right">
                  <span
                    className="el-chip px-2 py-1 text-[10px] uppercase"
                    style={elVars(chart.defs[row.element])}
                  >
                    {row.element}
                  </span>
                </th>
                {row.cells.map((cell) => {
                  const b = band(cell.multiplier);
                  const isNeutral = b.key === 'x1';
                  return (
                    <td key={cell.element} className="p-0">
                      <div
                        className="rounded-lg border px-1 py-2 font-mono text-[11px] font-bold"
                        style={{
                          color: isNeutral ? 'var(--color-ink-400)' : BAND_COLOR[b.key],
                          borderColor: isNeutral
                            ? 'rgb(255 255 255 / 0.06)'
                            : `color-mix(in oklab, ${BAND_COLOR[b.key]} 35%, transparent)`,
                          background: isNeutral
                            ? 'rgb(255 255 255 / 0.02)'
                            : `color-mix(in oklab, ${BAND_COLOR[b.key]} 12%, transparent)`,
                        }}
                        title={`${row.element} → ${cell.element}: ${formatMultiplier(cell.multiplier)}`}
                      >
                        {isNeutral ? '·' : formatMultiplier(cell.multiplier)}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-wrap gap-4 text-[11px] text-ink-400">
        <Legend color="var(--color-band-weak)" label="1.6× super effective" />
        <Legend color="var(--color-ink-400)" label="1× neutral" />
        <Legend color="var(--color-band-resist)" label="0.625× resisted" />
      </div>
    </div>
  );
}

const Legend = ({ color, label }: { color: string; label: string }) => (
  <span className="inline-flex items-center gap-1.5">
    <span className="size-2.5 rounded-sm" style={{ background: color }} />
    {label}
  </span>
);
