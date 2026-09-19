import { useMemo, useState } from 'react';
import { band, formatMultiplier, verdict, type Chart } from '../lib/chart';
import type { Aniimo, Element } from '../types';
import { moveElements } from '../lib/data';
import { ElPlate } from './ElementBadge';

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
      <p className="empty">
        No element-tagged attacking moves are recorded for this form, so there is nothing to score.
        {untagged.length > 0 && ' Its combat moves are listed without an element on the source site.'}
      </p>
    );
  }

  return (
    <div className="stack">
      {/* Coverage against each of the nine elements, doubling as the target picker. */}
      <div>
        <h3 className="eyebrow">Best multiplier vs each element</h3>
        <div className="coverage" role="group" aria-label="Target elements">
          {coverage.map(({ defenders, best: single }) => {
            const el = defenders[0]!;
            const selected = target.includes(el);
            return (
              <button
                key={el}
                type="button"
                aria-pressed={selected}
                onClick={() => toggleTarget(el)}
                className="coverage__btn"
                data-el={el.toLowerCase()}
                data-verdict={verdict(single.multiplier)}
                title={single.element ? `Best with ${single.ties.join(' / ')}` : undefined}
              >
                <span className="coverage__el">{el}</span>
                <span className="coverage__mult">{formatMultiplier(single.multiplier)}</span>
                {single.element && <span className="coverage__via">{single.element}</span>}
              </button>
            );
          })}
        </div>
        <p className="note">
          Pick one or two elements to score this Aniimo&rsquo;s moves against that exact defender.
          {target.length === 2 && ' Choosing a third replaces the older one.'}
        </p>
      </div>

      {/* Headline result for the chosen combination. */}
      {target.length > 0 && best && (
        <section
          aria-label={`Best result versus ${target.join(' and ')}`}
          className="best"
          data-verdict={verdict(best.multiplier)}
        >
          <div className="best__vs">
            <span className="best__label">vs</span>
            {target.map((el) => (
              <ElPlate key={el} element={el} size="sm" />
            ))}
          </div>
          <div className="best__vs">
            <span className="best__mult">{formatMultiplier(best.multiplier)}</span>
            <span className="best__via">
              {best.element ? `best with ${best.ties.join(' / ')}` : 'no element-tagged move'}
            </span>
          </div>
          <button type="button" onClick={() => setTarget([])} className="btn btn--ghost best__clear">
            Clear target
          </button>
        </section>
      )}

      {/* Move list, ranked against the chosen target. */}
      <div>
        <h3 className="eyebrow">
          {target.length ? `Moves vs ${target.join(' / ')}` : `Attacking moves (${offensiveSkills.length})`}
        </h3>
        <MoveList chart={chart} skills={offensiveSkills} target={target} />
        {untagged.length > 0 && (
          <p className="note">
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
    <ul className="moves">
      {rows.map(({ skill, multiplier, effective }) => {
        const b = multiplier !== null ? band(multiplier) : null;
        return (
          <li
            key={`${skill.name}-${skill.section}`}
            className="move"
            data-verdict={multiplier !== null ? verdict(multiplier) : undefined}
          >
            {skill.element && <ElPlate element={skill.element} size="xs" />}
            <span className="move__body">
              <span className="move__name">{skill.name}</span>
              <span className="move__meta">
                {skill.section}
                {skill.power !== null && ` · power ${skill.power}`}
                {skill.cost ? ` · cost ${skill.cost}` : ''}
              </span>
            </span>
            {b && (
              <span className="move__score">
                <span className="move__mult">{formatMultiplier(multiplier!)}</span>
                {effective !== null && <span className="move__eff">{Math.round(effective)} eff.</span>}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
