import { band, formatMultiplier, verdict, type Chart } from '../lib/chart';
import { ElChip, ElPlate } from './ElementBadge';

/**
 * The raw 9x9 chart, rows attack and columns defend.
 *
 * A real <table> with scoped headers rather than the design's CSS grid: this
 * same grid is served to crawlers that never paint a pixel, and the prerendered
 * copy in scripts/lib/pages.mjs has to stay readable by them. The styling in
 * .matrix-table makes it look like the grid the design drew.
 */
export function MatrixView({ chart }: { chart: Chart }) {
  const rows = chart.matrix();

  return (
    <div className="card card--flow">
      <h2>Element chart</h2>
      <p className="muted">
        Rows attack, columns defend. Read across a row to see what that element does to everything else.
      </p>

      <div className="table-scroll">
        <table className="matrix-table">
          <caption className="sr-only">
            Damage multiplier for each attacking element against each defending element
          </caption>
          <thead>
            <tr>
              <th scope="col">Atk ╲ Def</th>
              {chart.order.map((d) => (
                <th key={d} scope="col">
                  <span className="matrix-table__head">
                    <ElPlate element={d} size="xs" />
                    <span>{d}</span>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.element}>
                <th scope="row">
                  <ElChip element={row.element} />
                </th>
                {row.cells.map((cell) => {
                  const neutral = band(cell.multiplier).key === 'x1';
                  return (
                    <td key={cell.element} data-verdict={verdict(cell.multiplier)}>
                      <span title={`${row.element} → ${cell.element}: ${formatMultiplier(cell.multiplier)}`}>
                        {neutral ? '·' : formatMultiplier(cell.multiplier)}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="legend">
        <span data-verdict="bad">
          <b />1.6× super effective
        </span>
        <span data-verdict="flat">
          <b />1× neutral
        </span>
        <span data-verdict="good">
          <b />0.625× resisted
        </span>
      </div>
    </div>
  );
}
