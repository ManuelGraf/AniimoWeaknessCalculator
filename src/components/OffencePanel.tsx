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
  // One or two elements, matching how a defender is actually built.
  const [target, setTarget] = useState<Element[]>([]);

  const attackElements = useMemo(() => moveElements(aniimo), [aniimo]);
  const coverage = useMemo(() => chart.offenceSpread(attackElements), [chart, attackElements]);

  const best = useMemo(
    () => (target.length ? chart.offenceSpread(attackElements, [target])[0]!.best : null),
    [chart, attackElements, target],
  );

  const toggleTarget = (el: Element) =>
    setTarget((cur) =>
      cur.includes(el)
        ? cur.filter((e) => e !== el)
        : cur.length < 2
          ? [...cur, el]
          : [cur[1]!, el], // replace the older of the two
    );

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
      {/* Coverage against each of the nine elements, doubling as the target picker. */}
      <div>
        <h3 className="mb-2 text-[11px] font-semibold tracking-[0.14em] text-ink-400 uppercase">
          Best multiplier vs each element
        </h3>
        <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5 lg:grid-cols-9" role="group" aria-label="Target elements">
          {coverage.map(({ defenders, best: single }) => {
            const el = defenders[0]!;
            const b = band(single.multiplier);
            const selected = target.includes(el);
            return (
              <button
                key={el}
                type="button"
                aria-pressed={selected}
                onClick={() => toggleTarget(el)}
                className={`flex cursor-pointer flex-col items-center gap-1 rounded-xl border p-2 transition
                            hover:bg-white/6 ${selected ? 'border-accent/70 bg-white/10' : 'border-white/8 bg-white/2'}`}
                style={elVars(chart.defs[el])}
                title={single.element ? `Best with ${single.ties.join(' / ')}` : undefined}
              >
                <span className="text-[10px] tracking-wider uppercase" style={{ color: 'var(--el)' }}>
                  {el}
                </span>
                <span className="font-mono text-sm font-bold" style={{ color: BAND_COLOR[b.key] }}>
                  {formatMultiplier(single.multiplier)}
                </span>
                {single.element && (
                  <span className="max-w-full truncate text-[9.5px] text-ink-400">{single.element}</span>
                )}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[11px] text-ink-400">
          Pick one or two elements to score this Aniimo&rsquo;s moves against that exact defender.
          {target.length === 2 && ' Choosing a third replaces the older one.'}
        </p>
      </div>

      {/* Headline result for the chosen combination. */}
      {target.length > 0 && best && (
        <section
          aria-label={`Best result versus ${target.join(' and ')}`}
          className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-white/8 bg-white/3 p-3"
          style={{ borderLeft: `3px solid ${BAND_COLOR[band(best.multiplier).key]}` }}
        >
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] tracking-wider text-ink-400 uppercase">vs</span>
            {target.map((el) => (
              <ElementBadge key={el} element={el} def={chart.defs[el]} />
            ))}
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-xl font-bold" style={{ color: BAND_COLOR[band(best.multiplier).key] }}>
              {formatMultiplier(best.multiplier)}
            </span>
            <span className="text-[11px] text-ink-400">
              {best.element
                ? `best with ${best.ties.join(' / ')}`
                : 'no element-tagged move'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setTarget([])}
            className="ml-auto cursor-pointer rounded-lg border border-white/10 px-2.5 py-1 text-[11px]
                       text-ink-300 hover:bg-white/10 hover:text-ink-100"
          >
            Clear target
          </button>
        </section>
      )}

      {/* Move list, ranked against the chosen target. */}
      <div>
        <h3 className="mb-2 text-[11px] font-semibold tracking-[0.14em] text-ink-400 uppercase">
          {target.length ? `Moves vs ${target.join(' / ')}` : `Attacking moves (${offensiveSkills.length})`}
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
  target: Element[];
}) {
  const rows = skills
    .map((s) => {
      const multiplier = target.length && s.element ? chart.against(s.element, target) : null;
      // Power is a percentage of the Aniimo's attack stat, so scaling it by the
      // matchup gives a fair way to rank moves against one defender.
      const effective = multiplier !== null && s.power !== null ? s.power * multiplier : null;
      return { skill: s, multiplier, effective };
    })
    .sort((a, b) => {
      if (target.length) {
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
                  <span className="font-mono text-[10px] text-ink-400">{Math.round(effective)} eff.</span>
                )}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
