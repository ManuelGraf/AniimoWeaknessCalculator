import { useMemo, useState } from 'react';
import { band, formatMultiplier, type Chart } from '../lib/chart';
import type { Aniimo, Element } from '../types';
import { moveElements } from '../lib/data';
import { ElementBadge, elVars } from './ElementBadge';

const BAND_COLOR: Record<string, string> = {
  x256: 'var(--color-band-crit)',
  x16: 'var(--color-band-weak)',
  x1: 'var(--color-band-neutral)',
  x0625: 'var(--color-band-resist)',
  x039: 'var(--color-band-immune)',
};

/**
 * What this Aniimo can actually do back. Coverage is computed from the elements
 * of its element-tagged Combat/Innate moves - not from its own element, since
 * plenty of Aniimo carry off-element moves (Fire-type Emberpup has an Earth
 * Pebble Kick).
 */
export function OffencePanel({ chart, aniimo }: { chart: Chart; aniimo: Aniimo }) {
  const [target, setTarget] = useState<Element | null>(null);

  const attackElements = useMemo(() => moveElements(aniimo), [aniimo]);
  const coverage = useMemo(() => chart.offenceSpread(attackElements), [chart, attackElements]);

  const offensiveSkills = aniimo.skills.filter((s) => s.offensive);
  const untagged = aniimo.skills.filter((s) => s.section === 'Combat' && !s.element);

  if (!attackElements.length) {
    return (
      <p className="rounded-xl border border-white/6 bg-white/2 p-4 text-sm text-ink-300">
        No element-tagged attacking moves are recorded for this form, so there is nothing to score.
        {untagged.length > 0 && ' Its combat moves are listed without an element on the source site.'}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Coverage against each of the nine elements. */}
      <div>
        <h3 className="mb-2 text-[11px] font-semibold tracking-[0.14em] text-ink-400 uppercase">
          Best multiplier vs each element
        </h3>
        <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5 lg:grid-cols-9">
          {coverage.map(({ defenders, best }) => {
            const el = defenders[0]!;
            const b = band(best.multiplier);
            const selected = target === el;
            return (
              <button
                key={el}
                type="button"
                aria-pressed={selected}
                onClick={() => setTarget(selected ? null : el)}
                className={`flex cursor-pointer flex-col items-center gap-1 rounded-xl border p-2 transition
                            hover:bg-white/6 ${selected ? 'border-accent/60 bg-white/8' : 'border-white/8 bg-white/2'}`}
                style={elVars(chart.defs[el])}
                title={best.element ? `Best with ${best.ties.join(' / ')}` : undefined}
              >
                <span className="text-[10px] tracking-wider uppercase" style={{ color: 'var(--el)' }}>
                  {el}
                </span>
                <span className="font-mono text-sm font-bold" style={{ color: BAND_COLOR[b.key] }}>
                  {formatMultiplier(best.multiplier)}
                </span>
                {best.element && (
                  <span className="max-w-full truncate text-[9.5px] text-ink-400">{best.element}</span>
                )}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[11px] text-ink-400">
          Tap an element to rank this Aniimo&rsquo;s moves against it.
        </p>
      </div>

      {/* Move list, optionally scored against the chosen target. */}
      <div>
        <h3 className="mb-2 text-[11px] font-semibold tracking-[0.14em] text-ink-400 uppercase">
          {target ? `Moves vs ${target}` : `Attacking moves (${offensiveSkills.length})`}
        </h3>
        <MoveList chart={chart} skills={offensiveSkills} target={target} />
        {untagged.length > 0 && (
          <p className="mt-2.5 text-[11px] text-ink-400">
            {untagged.length} further combat {untagged.length === 1 ? 'move is' : 'moves are'} listed
            without an element and {untagged.length === 1 ? 'is' : 'are'} not scored here.
          </p>
        )}
      </div>
    </div>
  );
}

function MoveList({
  chart,
  skills,
  target,
}: {
  chart: Chart;
  skills: Aniimo['skills'];
  target: Element | null;
}) {
  const rows = skills
    .map((s) => {
      const multiplier = target && s.element ? chart.against(s.element, [target]) : null;
      // Power is a percentage of the Aniimo's attack stat, so scaling it by the
      // matchup gives a fair way to rank moves against one target.
      const effective = multiplier !== null && s.power !== null ? s.power * multiplier : null;
      return { skill: s, multiplier, effective };
    })
    .sort((a, b) => {
      if (target) {
        if (b.effective !== a.effective) return (b.effective ?? -1) - (a.effective ?? -1);
        if (b.multiplier !== a.multiplier) return (b.multiplier ?? 0) - (a.multiplier ?? 0);
      }
      return (b.skill.power ?? 0) - (a.skill.power ?? 0);
    });

  return (
    <ul className="flex flex-col gap-1.5">
      {rows.map(({ skill, multiplier, effective }) => {
        const b = multiplier !== null ? band(multiplier) : null;
        return (
          <li
            key={`${skill.name}-${skill.section}`}
            className="flex items-center gap-3 rounded-xl border border-white/6 bg-white/2 px-3 py-2"
          >
            {skill.element && (
              <span className="flex-shrink-0">
                <ElementBadge element={skill.element} def={chart.defs[skill.element]} />
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{skill.name}</span>
              <span className="block truncate text-[11px] text-ink-400">
                {skill.section}
                {skill.power !== null && ` · power ${skill.power}`}
                {skill.cost ? ` · cost ${skill.cost}` : ''}
              </span>
            </span>
            {b && (
              <span className="flex flex-shrink-0 flex-col items-end">
                <span className="font-mono text-sm font-bold" style={{ color: BAND_COLOR[b.key] }}>
                  {formatMultiplier(multiplier!)}
                </span>
                {effective !== null && (
                  <span className="font-mono text-[10px] text-ink-400">
                    {Math.round(effective)} eff.
                  </span>
                )}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
