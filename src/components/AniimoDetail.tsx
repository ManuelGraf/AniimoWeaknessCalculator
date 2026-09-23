/**
 * One Aniimo, in full.
 *
 * The page a roster tile opens. It reads as the tile enlarged: the same art
 * with the same element plates and role badges pinned to it, and the same
 * five-band spread bar underneath - so a form looks like itself whether you
 * are scanning the grid or standing on its page.
 *
 * Below that, every attacking move ranked by what it would actually do:
 * base power x STAB x effectiveness against the defender you pick. That is
 * the one number the old panels never gave, and it is why the move list is
 * sorted by it rather than by raw power.
 *
 * Nothing here takes a colour. `data-el` and `data-verdict` do the tinting,
 * the same mechanism the tiles and bands use (src/aniimo-dark.css, sections
 * 2 and 10).
 */
import { useMemo, useState } from 'react';

import { formatMultiplier, verdict, type Chart, type Extreme, type Verdict } from '../lib/chart';
import { list } from '../lib/data';
import type { Aniimo, Element, Skill } from '../types';
import { ElChip, ElPlate, Icon, ROLE_GLYPH, RoleChip, roleLabel } from './ElementBadge';

/** Same-element attack bonus: a move sharing one of its user's elements hits 25% harder. */
export const STAB = 1.25;

/**
 * The attacker's view of a multiplier.
 *
 * Everywhere else on the site a number is read from the defender's side, where
 * 1.6x is bad news. On this card the moves belong to the Aniimo whose page you
 * are on, so the same 1.6x is the good outcome and gets the accent tint. The
 * spread bar in the hero keeps the defender's view, because there the Aniimo
 * is the one being hit.
 */
const flip = (v: Verdict): Verdict => (v === 'bad' ? 'good' : v === 'good' ? 'bad' : 'flat');

/** Whole numbers once there is nothing useful left in the decimal. */
const fmtEff = (n: number) => (n >= 10 ? Math.round(n) : Number(n.toFixed(1)));

export interface ScoredMove {
  skill: Skill;
  element: Element;
  power: number;
  stab: boolean;
  multiplier: number;
  effective: number;
}

/**
 * Every attacking move this Aniimo has, scored against `target` and ranked.
 *
 * `target` may be empty, in which case effectiveness is 1x and the ranking is
 * simply what the moves are worth on their own. Ties fall back to the raw
 * multiplier and then to base power, so two moves that come out equal still
 * land in a stable order.
 */
export function scoreMoves(
  chart: Chart,
  aniimo: Aniimo,
  target: readonly Element[],
  stab = STAB,
): ScoredMove[] {
  return aniimo.skills
    .filter((s) => s.offensive && s.element)
    .map((s) => {
      const element = s.element!;
      const isStab = aniimo.elements.includes(element);
      const multiplier = target.length ? chart.against(element, target) : 1;
      const power = s.power ?? 0;
      return {
        skill: s,
        element,
        power,
        stab: isStab,
        multiplier,
        effective: power * (isStab ? stab : 1) * multiplier,
      };
    })
    .sort((a, b) => b.effective - a.effective || b.multiplier - a.multiplier || b.power - a.power);
}

interface Props {
  chart: Chart;
  aniimo: Aniimo;
  /** Where the site root sits relative to the current page, for the crumb href. */
  siteRoot: string;
  /** Handled in-app when the click is a plain one; the href covers the rest. */
  onRoster: () => void;
}

export function AniimoDetail({ chart, aniimo, siteRoot, onRoster }: Props) {
  const [target, setTarget] = useState<Element[]>([]);

  const toggleTarget = (el: Element) =>
    setTarget((cur) =>
      cur.includes(el)
        ? cur.filter((e) => e !== el)
        : cur.length < 2
          ? [...cur, el]
          : [cur[1]!, el], // replace the older of the two
    );

  const moves = useMemo(() => scoreMoves(chart, aniimo, target), [chart, aniimo, target]);
  const best = moves[0] && moves[0].effective > 0 ? moves[0] : null;
  const utility = aniimo.skills.filter((s) => !(s.offensive && s.element));
  const bands = chart.spreadByBand(aniimo.elements);

  const el1 = aniimo.elements[0]?.toLowerCase();
  const el2 = (aniimo.elements[1] ?? aniimo.elements[0])?.toLowerCase();
  // The stage render carries the page; the round head is only a stand-in.
  const art = aniimo.image ?? aniimo.head;

  const eyebrow = [
    aniimo.number && `No. ${aniimo.number}`,
    aniimo.stage,
    aniimo.stats && `BST ${aniimo.stats.total}`,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="stack">
      <p className="crumbs detail-crumbs">
        {/*
          A real link to the static roster page, intercepted for a plain click
          the way a tile is: the database is already loaded, so a page load
          would only throw it away.
        */}
        <a
          href={`${siteRoot}aniimo/`}
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
            e.preventDefault();
            onRoster();
          }}
        >
          ← All Aniimo
        </a>{' '}
        / {aniimo.name}
      </p>

      {/* ------------------------------------------------------------ hero */}
      <section className="card card--raised hero-card" data-el={el1}>
        <div className="hero-card__glow" aria-hidden="true" />
        <div className="hero-card__glow2" data-el={el2} aria-hidden="true" />
        <div className="hero-card__grid" aria-hidden="true" />

        <div className="hero-card__body">
          <div className="hero-card__figure">
            {aniimo.number && (
              <span className="hero-card__no" aria-hidden="true">
                {aniimo.number}
              </span>
            )}
            <Art aniimo={aniimo} src={art} />

            <span className="hero-card__els">
              {aniimo.elements.map((el) => (
                <ElPlate key={el} element={el} size="lg" />
              ))}
            </span>
            {/* The chips below say the same thing in words, so the badges over
                the art are decoration and are not read out twice. */}
            <span className="hero-card__roles" aria-hidden="true">
              {aniimo.roles
                .map((r) => [r, ROLE_GLYPH[r.toLowerCase()]] as const)
                .filter(([, glyph]) => !!glyph)
                .map(([role, glyph]) => (
                  <span key={role} className="hero-card__role" data-role={glyph} title={roleLabel(role)}>
                    <Icon id={`role-${glyph}`} />
                  </span>
                ))}
            </span>
          </div>

          <div className="hero-card__info">
            {eyebrow && <span className="eyebrow">{eyebrow}</span>}
            {/*
              h2, not h1: on a prerendered page the static article keeps the
              page's own h1, and on the plain app the site name is it.
            */}
            <h2 className="hero-card__name">{aniimo.name}</h2>
            {!aniimo.isBasic && <p className="muted hero-card__morph">{aniimo.morphology}</p>}

            <div className="hero-card__tags">
              {aniimo.elements.map((el) => (
                <ElChip key={el} element={el} />
              ))}
              {aniimo.roles.map((r) => (
                <RoleChip key={r} role={r} />
              ))}
            </div>

            {aniimo.description && <p className="hero-card__desc">{aniimo.description}</p>}

            {aniimo.stats && (
              <dl className="stats hero-card__stats">
                {(
                  [
                    ['HP', aniimo.stats.hp],
                    ['P.ATK', aniimo.stats.physicalAttack],
                    ['M.ATK', aniimo.stats.magicAttack],
                    ['P.DEF', aniimo.stats.physicalDefense],
                    ['M.DEF', aniimo.stats.magicDefense],
                    ['Haste', aniimo.stats.haste],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        </div>

        <div className="hero-card__spread">
          <span className="eyebrow">Taking damage · most to least</span>
          {/* The bar is a picture of the same numbers - said once, in words. */}
          <p className="sr-only">{spokenSpread(chart, aniimo.elements)}</p>
          <div className="hero-spread" aria-hidden="true">
            {bands.map(({ band: b, entries }) => (
              <div key={b.key} className="tile__band hero-spread__band" data-verdict={verdict(b.mult)}>
                <span className="tile__bandMult">{b.label}</span>
                <span className="tile__bandEls">
                  {entries.length ? (
                    entries.map((e) => <ElPlate key={e.element} element={e.element} size="xs" />)
                  ) : (
                    <span className="tile__bandNone">·</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------- moves */}
      <section className="card">
        <div className="card__head">
          <div>
            <h2>Moves</h2>
            <p className="muted">
              Effective power = base power × STAB × effectiveness. STAB adds{' '}
              {Math.round((STAB - 1) * 100)}% when a move shares one of {aniimo.name}&rsquo;s
              elements.
            </p>
          </div>
        </div>

        <div className="card__body stack">
          <div>
            <span className="eyebrow">Score against a defender</span>
            <div className="target-row">
              <div className="filters__chips" role="group" aria-label="Target elements">
                {chart.order.map((el) => (
                  <button
                    key={el}
                    type="button"
                    className="filters__el"
                    data-el={el.toLowerCase()}
                    aria-pressed={target.includes(el)}
                    title={el}
                    onClick={() => toggleTarget(el)}
                  >
                    <ElPlate element={el} size="xs" active={target.includes(el)} />
                    <span className="sr-only">{el}</span>
                  </button>
                ))}
              </div>
              {target.length > 0 && (
                <button
                  type="button"
                  className="linkish target-row__clear"
                  onClick={() => setTarget([])}
                >
                  Clear target
                </button>
              )}
            </div>
            <p className="note">
              {target.length === 0
                ? 'Pick one or two elements to score every move against that exact defender. With no target, effectiveness is 1×.'
                : target.length === 1
                  ? `Scoring against a ${target[0]} defender. Pick a second element for a dual.`
                  : `Scoring against a ${target.join(' / ')} defender — both sides multiply. Choosing a third replaces the older one.`}
            </p>
          </div>

          {best && (
            <section
              className="best"
              data-verdict={flip(verdict(best.multiplier))}
              aria-label={target.length ? `Best move versus ${target.join(' and ')}` : 'Strongest move'}
            >
              <div className="best__vs">
                <span className="best__label">{target.length ? 'Best vs' : 'Strongest move'}</span>
                {target.map((el) => (
                  <ElPlate key={el} element={el} size="sm" />
                ))}
              </div>
              <div className="best__vs best__move">
                <ElPlate element={best.element} size="xs" />
                <span>
                  <span className="best__name">{best.skill.name}</span>
                  <span className="best__via">{formula(best)}</span>
                </span>
              </div>
              <div className="best__score">
                <span className="best__mult">{fmtEff(best.effective)}</span>
                <span className="best__via">effective power</span>
              </div>
            </section>
          )}

          <div>
            <h3 className="eyebrow">
              {target.length
                ? `Moves vs ${target.join(' / ')} (${moves.length})`
                : `Attacking moves (${moves.length})`}
            </h3>
            {moves.length === 0 ? (
              <p className="empty">
                No element-tagged attacking moves are recorded for this form, so there is nothing to
                score.
              </p>
            ) : (
              <ul className="moves">
                {moves.map((m, i) => (
                  <MoveRow key={`${m.skill.name}-${m.skill.section}-${i}`} move={m} best={m === best} />
                ))}
              </ul>
            )}
          </div>

          {utility.length > 0 && (
            <div>
              <h3 className="eyebrow">Utility &amp; traits ({utility.length})</h3>
              <ul className="utility">
                {utility.map((s, i) => (
                  <li key={`${s.name}-${s.section}-${i}`} className="utility__item">
                    <span className="tag utility__tag">{sectionLabel(s)}</span>
                    <span className="utility__name">{s.name}</span>
                  </li>
                ))}
              </ul>
              <p className="note">
                Movement, traits, buffs and untagged combat skills carry no element and are not
                scored.
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

/**
 * One scored move.
 *
 * The score group is written twice over: once as the three visible parts the
 * design asks for - the formula, the multiplier pill and the effective number
 * - and once as a sentence for anyone listening, because read out literally
 * those three say the multiplier three times.
 */
function MoveRow({ move: m, best }: { move: ScoredMove; best: boolean }) {
  const v = flip(verdict(m.multiplier));

  return (
    <li className="move-row" data-el={m.element.toLowerCase()} data-best={best ? 'true' : undefined}>
      <ElPlate element={m.element} size="sm" />

      <span className="move-row__body">
        <span className="move-row__title">
          <span className="move-row__name">{m.skill.name}</span>
          {m.stab && (
            <span className="stab-chip" title={`${m.element} move on a ${m.element} Aniimo`}>
              STAB
            </span>
          )}
          {best && <span className="best-chip">Best</span>}
        </span>
        <span className="move__meta">
          {[m.skill.section, `base ${m.power}`, m.skill.cost ? `cost ${m.skill.cost}` : null]
            .filter(Boolean)
            .join(' · ')}
        </span>
      </span>

      {m.power > 0 ? (
        <span className="move-row__score">
          <span className="move-row__formula" aria-hidden="true">
            <span className="move-row__base">{m.power}</span>
            <span>×</span>
            <span className="move-row__stab" data-stab={m.stab ? 'true' : undefined}>
              {m.stab ? STAB : 1}
            </span>
            <span>×</span>
            <span className="move-row__mult" data-verdict={v}>
              {formatMultiplier(m.multiplier)}
            </span>
          </span>

          <span className="mult-pill move-row__pill" data-verdict={v} aria-hidden="true">
            {formatMultiplier(m.multiplier)}
          </span>

          <span className="move-row__eff" aria-hidden="true">
            <span className="move-row__effNum">{fmtEff(m.effective)}</span>
            <span className="move__eff">eff.</span>
          </span>

          <span className="sr-only">{formula(m)} = {fmtEff(m.effective)} effective power.</span>
        </span>
      ) : (
        <span className="move-row__none">no damage</span>
      )}
    </li>
  );
}

/** "164 × 1.25 STAB × 0.625×" - the sum behind the effective number. */
const formula = (m: ScoredMove) =>
  `${m.power} × ${m.stab ? `${STAB} STAB` : '1'} × ${formatMultiplier(m.multiplier)}`;

/**
 * What a skill is filed under. A Combat skill with no element is the one case
 * worth naming: it is not utility, it just cannot be scored.
 */
const sectionLabel = (s: Skill) =>
  s.element ? (s.section ?? 'Skill') : s.section === 'Combat' ? 'Untagged' : (s.section ?? 'Skill');

/**
 * What the spread bar says, in a sentence. The same line the tiles use, so the
 * two never drift - see spokenSpread() in AniimoGrid.tsx.
 */
function spokenSpread(chart: Chart, elements: Element[]): string {
  const { most, least } = chart.extremes(elements);
  const one = (e: Extreme) =>
    e.elements.length ? `${e.label} ${list(e.elements)} at ${formatMultiplier(e.multiplier)}.` : '';
  return `${one(most)} ${one(least)}`.trim();
}

function Art({ aniimo, src }: { aniimo: Aniimo; src: string | null }) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return <span className="hero-card__fallback">{aniimo.name.slice(0, 2)}</span>;
  }

  return (
    <img
      className="hero-card__art"
      src={src}
      alt={aniimo.name}
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}
