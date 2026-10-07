/**
 * The team builder: up to four Aniimo, what hurts them and what they can hit.
 *
 * The team itself lives in the hash (`#/team/glacy+hexxin`), so it is passed
 * in and every change goes back out through `onTeam` - a team is a link like
 * any other result here. Saved teams are the only thing kept in the browser.
 *
 * The maths is src/lib/team.ts. Nothing here takes a colour: elements carry
 * data-el, results data-verdict and attackers data-role, and the `.team-*`
 * block in src/aniimo-site.css paints them.
 */
import { useEffect, useMemo, useRef, useState } from 'react';

import { formatMultiplier, verdict, type Chart } from '../lib/chart';
import { searchRoster } from '../lib/data';
import {
  attackRole,
  damagingSkills,
  teamDefence,
  teamIds,
  teamOffence,
  type DefenceRow,
  type Hit,
  type OffenceRow,
  type Team,
} from '../lib/team';
import { ELEMENTS, type Aniimo, type Element } from '../types';

import { BandArrows, ElPlate, Icon, roleLabel } from './ElementBadge';

const SAVED_KEY = 'aniimo.teams.v1';
const SAVED_MAX = 10;

interface SavedTeam {
  name: string;
  ids: (string | null)[];
}

/** Storage can be blocked or full; a team that does not persist is not an error. */
function readSaved(): SavedTeam[] {
  try {
    const raw = JSON.parse(localStorage.getItem(SAVED_KEY) ?? '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}
function writeSaved(saved: SavedTeam[]) {
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify(saved));
  } catch {
    /* kept for this visit only */
  }
}

const slug = (s: string) => s.toLowerCase();
const subtitle = (a: Aniimo) => (a.isBasic ? (a.number ? `No. ${a.number}` : 'Base form') : a.morphology);
const shareHash = (team: Team) => `#/team/${teamIds(team).map((id) => id ?? '_').join('+')}`;

type DefenceAxis = 'def' | 'off';

export function TeamBuilder({
  chart,
  roster,
  team,
  onTeam,
  showTitle,
}: {
  chart: Chart;
  roster: Aniimo[];
  team: Team;
  onTeam: (next: Team) => void;
  /** False on the prerendered /team/ page, whose static hero already carries the h1. */
  showTitle: boolean;
}) {
  const [open, setOpen] = useState(-1);
  const [saved, setSaved] = useState<SavedTeam[]>(readSaved);
  const [copied, setCopied] = useState(false);
  const [includeSupports, setIncludeSupports] = useState(false);
  // One highlight per panel: pinned by click, previewed by hover.
  const [pinned, setPinned] = useState<Record<DefenceAxis, string | null>>({ def: null, off: null });
  const [hover, setHover] = useState<string | null>(null);
  // One open tooltip at a time, pinned by tap or shown on hover.
  const [tip, setTip] = useState<string | null>(null);
  const [tipHover, setTipHover] = useState<string | null>(null);

  const defence = useMemo(() => teamDefence(chart, team), [chart, team]);
  const offence = useMemo(() => teamOffence(chart, team, includeSupports), [chart, team, includeSupports]);
  const members = team.filter((a): a is Aniimo => !!a);
  const byId = useMemo(() => new Map(roster.map((a) => [a.id, a])), [roster]);

  // A tap anywhere else closes a pinned tooltip.
  useEffect(() => {
    if (!tip) return;
    const down = (e: PointerEvent) => {
      if (!(e.target as HTMLElement).closest('.team-tip, .team-face')) setTip(null);
    };
    document.addEventListener('pointerdown', down);
    return () => document.removeEventListener('pointerdown', down);
  }, [tip]);

  const setSlot = (i: number, a: Aniimo | null) => {
    const next = team.slice();
    next[i] = a;
    onTeam(next);
  };

  const persist = (next: SavedTeam[]) => {
    setSaved(next);
    writeSaved(next);
  };

  const currentIds = teamIds(team).map((id) => id ?? '_').join('+');

  const save = () => {
    if (!members.length || saved.some((t) => t.ids.map((id) => id ?? '_').join('+') === currentIds)) return;
    persist([...saved, { name: members.map((a) => a.name.slice(0, 4)).join('·'), ids: teamIds(team) }].slice(-SAVED_MAX));
  };

  const copy = () => {
    const url = `${location.origin}${location.pathname}${shareHash(team)}`;
    void navigator.clipboard?.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const lit = (panel: DefenceAxis) => (hover?.startsWith(panel) ? hover : pinned[panel]);
  const dimmed = (panel: DefenceAxis, band: number) => {
    const l = lit(panel);
    return !!l && l !== `${panel}:${band}`;
  };

  const tipProps = (key: string) => ({
    open: (tipHover ?? tip) === key,
    onToggle: () => setTip(tip === key ? null : key),
    onEnter: () => setTipHover(key),
    onLeave: () => setTipHover(null),
  });

  const axis = (panel: DefenceAxis, buckets: [number, string][], rows: { band: number; element: Element }[]) => (
    <div className={`team-axis team-axis--${buckets.length}`} role="group" aria-label="Filter by result">
      {buckets.map(([band, label]) => {
        const key = `${panel}:${band}`;
        const els = rows.filter((r) => r.band === band).map((r) => r.element);
        const hot = lit(panel) === key;
        // Defence: down means takes more. Offence: down means lands more.
        const arrows = panel === 'def' ? band : -band;
        const tone = band === 0 ? 'flat' : (panel === 'def') === band > 0 ? 'bad' : 'good';
        return (
          <button
            key={band}
            type="button"
            className="team-axis__bucket"
            data-verdict={tone}
            data-hot={hot || undefined}
            data-dim={(lit(panel) && !hot) || undefined}
            aria-pressed={pinned[panel] === key}
            onClick={() => setPinned({ ...pinned, [panel]: pinned[panel] === key ? null : key })}
            onPointerEnter={() => setHover(key)}
            onPointerLeave={() => setHover(null)}
          >
            <span className="team-axis__label">
              <BandArrows arrows={arrows} />
              {label}
            </span>
            <span className="team-axis__els">
              {els.length ? els.map((el) => <ElPlate key={el} element={el} size="xxs" />) : <span className="team-axis__none">–</span>}
            </span>
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="stack team">
      <div className="team-top">
        {showTitle && (
          <div className="team-top__intro">
            <h2 className="roster-title">Aniimo team builder &amp; coverage checker</h2>
            <p className="muted">
              Pick up to four Aniimo. See which elements your team is weak to and which it can hit super effectively —
              before you commit to it.
            </p>
          </div>
        )}
        <div className="team-top__actions">
          <button type="button" className="btn btn--primary" onClick={save} disabled={!members.length}>
            Save team
          </button>
          <button type="button" className="btn btn--ghost" onClick={copy}>
            {copied ? 'Link copied' : 'Copy link'}
          </button>
        </div>
      </div>

      <div className="team-saved">
        <span className="eyebrow">Saved teams</span>
        {saved.map((t, i) => {
          const ids = t.ids.map((id) => id ?? '_').join('+');
          return (
            <div key={`${ids}-${i}`} className="team-saved__item">
              <button
                type="button"
                className="team-saved__load"
                aria-current={ids === currentIds || undefined}
                title={t.name}
                onClick={() => {
                  setOpen(-1);
                  onTeam(t.ids.map((id) => (id ? (byId.get(id) ?? null) : null)));
                }}
              >
                <span className="team-saved__faces">
                  {t.ids.map((id, k) => {
                    const a = id ? byId.get(id) : undefined;
                    return (
                      <span key={k} className="team-saved__face" data-el={a ? slug(a.elements[0]!) : undefined}>
                        <Face aniimo={a ?? null} />
                      </span>
                    );
                  })}
                </span>
                <span className="team-saved__name">{t.name}</span>
              </button>
              <button
                type="button"
                className="team-x"
                aria-label={`Delete ${t.name}`}
                onClick={() => persist(saved.filter((_, k) => k !== i))}
              >
                ×
              </button>
            </div>
          );
        })}
        {!saved.length && (
          <span className="team-saved__empty">None yet — build a team and press Save. Teams stay in this browser.</span>
        )}
      </div>

      <section className="card team-card" aria-label="Team">
        <div className="team-slots">
          {team.map((a, i) => (
            <Slot
              key={i}
              index={i}
              aniimo={a}
              open={open === i}
              roster={roster}
              onOpen={() => setOpen(open === i ? -1 : i)}
              onClose={() => setOpen(-1)}
              onPick={(next) => {
                setSlot(i, next);
                setOpen(-1);
              }}
            />
          ))}
        </div>

        <div className="team-panels">
          <section className="team-panel" data-verdict="bad" aria-labelledby="team-def-title">
            <PanelHead
              icon="shield"
              eyebrow="Defence · damage taken"
              title={defence.headline}
              id="team-def-title"
            />
            {axis(
              'def',
              [
                [2, 'Very weak'],
                [1, 'Weak'],
                [0, 'Neutral'],
                [-1, 'Resistant'],
                [-2, 'Very resistant'],
              ],
              defence.rows,
            )}
            <ul className="team-tiles">
              {defence.rows.map((row) => (
                <DefenceTile key={row.element} chart={chart} row={row} dim={dimmed('def', row.band)} tipProps={tipProps} />
              ))}
            </ul>
          </section>

          <section className="team-panel" data-verdict="good" aria-labelledby="team-off-title">
            <PanelHead icon="sword" eyebrow={offence.eyebrow} title={offence.headline} id="team-off-title" />
            {axis(
              'off',
              [
                [-1, 'Resisted'],
                [0, 'Neutral'],
                [1, 'Super effective'],
              ],
              offence.rows,
            )}
            <ul className="team-tiles">
              {offence.rows.map((row) => (
                <OffenceTile
                  key={row.element}
                  row={row}
                  dim={dimmed('off', row.band)}
                  includeSupports={includeSupports}
                  tipProps={tipProps}
                />
              ))}
            </ul>
            <button
              type="button"
              role="switch"
              className="team-switch"
              aria-checked={includeSupports}
              onClick={() => setIncludeSupports(!includeSupports)}
            >
              <span className="team-switch__track" aria-hidden="true">
                <span className="team-switch__knob" />
              </span>
              <span className="team-switch__text">
                <span className="team-switch__label">Include Support, Heal &amp; Regen Aniimo</span>
                <span className="team-switch__hint">
                  Off by default — only DPS and Break are meant to land the hit. Moves without might never count.
                </span>
              </span>
            </button>
          </section>
        </div>

        <div className="team-foot">
          <div className="team-legend">
            <span data-verdict="bad">
              <b />
              Weak / resisted
            </span>
            <span data-verdict="flat">
              <b />
              Neutral
            </span>
            <span data-verdict="good">
              <b />
              Resistant / super effective
            </span>
            <span className="team-legend__hint">Bright ring = ×2 on dual elements · tap a face for the move</span>
          </div>
          <span className="team-foot__brand">
            <img src={`${window.__SITE_ROOT__ ?? './'}logo-mark.svg`} alt="" width={18} height={18} />
            aniimo weakness calculator · {shareHash(team)}
          </span>
        </div>
      </section>

      <p className="note team-explainer">
        Offence counts DPS and Break Aniimo by default, using their element-tagged skills with might — so a Fire DPS with
        an Earth move counts as Earth coverage. Flip the switch to include supports too. Dual-element defenders multiply
        both sides: 1.6 × 1.6 = 2.56×, and a resistance can cancel a weakness out to 1×.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ pieces */

type TipProps = (key: string) => { open: boolean; onToggle: () => void; onEnter: () => void; onLeave: () => void };

const PANEL_ICON = {
  shield: (
    <>
      <path d="M12 3 5 6v5c0 4.4 3 8 7 10 4-2 7-5.6 7-10V6Z" />
      <path d="M12 8v5" />
      <path d="m9.5 10.5 2.5 2.5 2.5-2.5" />
    </>
  ),
  sword: (
    <>
      <path d="M4 20 15 9" />
      <path d="M14 4h6v6" />
      <path d="m20 4-6 6" />
      <path d="M6.5 14.5 9.5 17.5" />
    </>
  ),
};

function PanelHead({ icon, eyebrow, title, id }: { icon: keyof typeof PANEL_ICON; eyebrow: string; title: string; id: string }) {
  return (
    <div className="team-panel__head">
      <span className="team-panel__icon">
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          {PANEL_ICON[icon]}
        </svg>
      </span>
      <div>
        <div className="team-panel__eyebrow">{eyebrow}</div>
        <h3 className="team-panel__title" id={id}>
          {title}
        </h3>
      </div>
    </div>
  );
}

/** Round head icon with the initials behind it, for art that is missing or fails to load. */
function Face({ aniimo, lazy }: { aniimo: Aniimo | null; lazy?: boolean }) {
  const [failed, setFailed] = useState(false);
  const src = aniimo?.head ?? aniimo?.image;
  return (
    <>
      <span className="team-face__ini" aria-hidden="true">
        {aniimo?.name.slice(0, 2)}
      </span>
      {src && !failed && (
        <img
          className="team-face__img"
          src={src}
          alt=""
          loading={lazy ? 'lazy' : undefined}
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      )}
    </>
  );
}

function Slot({
  index,
  aniimo,
  open,
  roster,
  onOpen,
  onClose,
  onPick,
}: {
  index: number;
  aniimo: Aniimo | null;
  open: boolean;
  roster: Aniimo[];
  onOpen: () => void;
  onClose: () => void;
  onPick: (a: Aniimo | null) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Anywhere outside this slot closes its picker.
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener('pointerdown', down);
    return () => document.removeEventListener('pointerdown', down);
  }, [open, onClose]);

  const n = index + 1;
  return (
    <div className="team-slot" ref={ref} data-el={aniimo ? slug(aniimo.elements[0]!) : undefined}>
      <button
        type="button"
        className="team-slot__btn"
        data-filled={!!aniimo}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={onOpen}
      >
        <span className="team-slot__thumb">
          {aniimo ? <Face aniimo={aniimo} /> : <span className="team-slot__plus">+</span>}
        </span>
        <span className="team-slot__text">
          <span className="team-slot__name">{aniimo ? aniimo.name : 'Add an Aniimo'}</span>
          <span className="team-slot__sub">
            Slot {n} · {aniimo ? subtitle(aniimo) : 'empty'}
          </span>
        </span>
        <span className="team-slot__els">
          {aniimo?.elements.map((el) => <ElPlate key={el} element={el} size="xxs" />)}
        </span>
      </button>
      {aniimo && (
        <button type="button" className="team-x team-slot__clear" aria-label={`Remove ${aniimo.name} from the team`} onClick={() => onPick(null)}>
          ×
        </button>
      )}
      {open && <Picker roster={roster} current={aniimo} onPick={onPick} onClose={onClose} />}
    </div>
  );
}

function Picker({
  roster,
  current,
  onPick,
  onClose,
}: {
  roster: Aniimo[];
  current: Aniimo | null;
  onPick: (a: Aniimo) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Element[]>([]);

  const all = (query.trim() ? searchRoster(roster, query, roster.length) : roster).filter((a) =>
    filter.every((f) => a.elements.includes(f)),
  );
  const matches = all.slice(0, 60);

  const toggle = (el: Element) =>
    setFilter(filter.includes(el) ? filter.filter((f) => f !== el) : filter.length < 2 ? [...filter, el] : [filter[1]!, el]);

  return (
    <div className="team-picker">
      <div className="team-picker__search">
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7">
          <circle cx="9" cy="9" r="6" />
          <path d="M13.5 13.5 18 18" strokeLinecap="round" />
        </svg>
        <input
          type="text"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose();
            if (e.key === 'Enter') {
              e.preventDefault();
              if (matches[0]) onPick(matches[0]);
            }
          }}
          placeholder="Glacy, Hexxin, Magmarex…"
          aria-label="Search Aniimo"
          autoComplete="off"
          spellCheck={false}
        />
        <span className="team-picker__count">{all.length} forms</span>
      </div>
      <div className="team-picker__filters" role="group" aria-label="Filter by element">
        {ELEMENTS.map((el) => (
          <button key={el} type="button" className="team-picker__el" aria-pressed={filter.includes(el)} title={el} onClick={() => toggle(el)}>
            <ElPlate element={el} size="xs" active={filter.includes(el)} />
            <span className="sr-only">{el}</span>
          </button>
        ))}
      </div>
      <ul className="team-picker__list" role="listbox" aria-label="Aniimo">
        {matches.map((a) => (
          <li
            key={a.id}
            role="option"
            aria-selected={current?.id === a.id}
            className="team-picker__option"
            onClick={() => onPick(a)}
          >
            <span className="team-face team-face--md">
              <Face aniimo={a} lazy />
            </span>
            <span className="team-picker__label">
              <span className="team-picker__name">{a.name}</span>
              <span className="team-picker__sub">{subtitle(a)}</span>
            </span>
            <span className="team-slot__els">
              {a.elements.map((el) => (
                <ElPlate key={el} element={el} size="xxs" />
              ))}
            </span>
          </li>
        ))}
        {!all.length && <li className="team-picker__empty">No Aniimo matches that.</li>}
      </ul>
    </div>
  );
}

function TileHead({ element, prefix }: { element: Element; prefix?: string }) {
  return (
    <div className="team-tile__head">
      <ElPlate element={element} size="xs" />
      <span className="team-tile__name">
        {prefix}
        {element}
      </span>
    </div>
  );
}

function DefenceTile({ chart, row, dim, tipProps }: { chart: Chart; row: DefenceRow; dim: boolean; tipProps: TipProps }) {
  return (
    <li className="team-tile" data-verdict={row.verdict} data-dim={dim || undefined}>
      <TileHead element={row.element} />
      <div className="team-tile__value">
        <span className="team-tile__label">{row.label}</span>
        <BandArrows arrows={row.band} />
      </div>
      {row.counts && <div className="team-tile__counts">{row.counts}</div>}
      <div className="team-tile__faces">
        {row.members.map((m, i) => {
          if (!m) return <span key={i} className="team-face team-face--empty" aria-hidden="true" />;
          const { aniimo: a, multiplier } = m;
          const v = verdict(multiplier);
          const strong = multiplier > 2 || multiplier < 0.5;
          const t = tipProps(`def:${row.element}/${a.id}`);
          return (
            <span key={i} className="team-face-wrap">
              <button
                type="button"
                className="team-face"
                data-verdict={v}
                data-strong={strong || undefined}
                aria-label={`${a.name}: takes ${formatMultiplier(multiplier)} from ${row.element}`}
                aria-expanded={t.open}
                onClick={(e) => {
                  e.stopPropagation();
                  t.onToggle();
                }}
                onPointerEnter={t.onEnter}
                onPointerLeave={t.onLeave}
              >
                <Face aniimo={a} />
              </button>
              {t.open && (
                <div className="team-tip" role="tooltip">
                  <div className="team-tip__head">
                    <span className="team-tip__name">{a.name}</span>
                    <span className="team-tip__mult" data-verdict={v}>
                      {formatMultiplier(multiplier)}
                    </span>
                  </div>
                  {a.elements.map((d) => {
                    const side = chart.pair(row.element, d);
                    return (
                      <div key={d} className="team-tip__row">
                        <span className="team-tip__side" data-el={slug(d)}>
                          <Icon id={`el-${slug(d)}`} />
                          {d} side
                        </span>
                        <span className="team-tip__val" data-verdict={verdict(side)}>
                          {formatMultiplier(side)}
                        </span>
                      </div>
                    );
                  })}
                  <div className="team-tip__foot">
                    {a.elements.length === 2
                      ? `Both sides multiply → ${formatMultiplier(multiplier)} from ${row.element}`
                      : `Takes ${formatMultiplier(multiplier)} from ${row.element}`}
                  </div>
                </div>
              )}
            </span>
          );
        })}
      </div>
    </li>
  );
}

function OffenceTile({
  row,
  dim,
  includeSupports,
  tipProps,
}: {
  row: OffenceRow;
  dim: boolean;
  includeSupports: boolean;
  tipProps: TipProps;
}) {
  const shown: Hit[] = [...row.hitters, ...row.benched].slice(0, 4);
  return (
    <li className="team-tile" data-verdict={row.verdict} data-dim={dim || undefined}>
      <TileHead element={row.element} prefix="vs " />
      <div className="team-tile__value">
        <span className="team-tile__mult">{row.best === null ? '—' : formatMultiplier(row.best)}</span>
        <span className="team-tile__counts">{row.label}</span>
      </div>
      <div className="team-tile__faces">
        {shown.map((h) => {
          const a = h.aniimo;
          const counted = !!h.role || (includeSupports && row.hitters.includes(h));
          const t = tipProps(`off:${row.element}/${a.id}`);
          const moves = damagingSkills(a)
            .filter((s) => s.element === h.element)
            .sort((x, y) => (y.power ?? 0) - (x.power ?? 0));
          const role = attackRole(a);
          return (
            <span key={a.id} className="team-face-wrap">
              <button
                type="button"
                className="team-face"
                data-role={role ?? undefined}
                data-benched={!counted || undefined}
                aria-label={`${a.name}${role ? ` (${roleLabel(role)})` : counted ? '' : ' (support, not counted)'}: ${formatMultiplier(h.multiplier)} vs ${row.element}`}
                aria-expanded={t.open}
                onClick={(e) => {
                  e.stopPropagation();
                  t.onToggle();
                }}
                onPointerEnter={t.onEnter}
                onPointerLeave={t.onLeave}
              >
                <Face aniimo={a} />
                <span className="team-face__move" data-el={slug(h.element)}>
                  <Icon id={`el-${slug(h.element)}`} />
                </span>
                {role && (
                  <span className="team-face__role" data-role={role} title={roleLabel(role)}>
                    <Icon id={`role-${role}`} />
                  </span>
                )}
              </button>
              {t.open && (
                <div className="team-tip" role="tooltip">
                  <div className="team-tip__head">
                    <span className="team-tip__name">{a.name}</span>
                    {role && (
                      <span className="team-tip__role" data-role={role}>
                        {roleLabel(role)}
                      </span>
                    )}
                  </div>
                  {(moves.length ? moves : [null]).map((s, k) => (
                    <div key={k} className="team-tip__row">
                      <span className="team-tip__side" data-el={slug(h.element)}>
                        <Icon id={`el-${slug(h.element)}`} />
                        {s ? s.name : `${h.element} (own element)`}
                      </span>
                      {s && <span className="team-tip__power">{s.power} might</span>}
                    </div>
                  ))}
                  <div className="team-tip__foot">
                    {formatMultiplier(h.multiplier)} vs {row.element}
                    {counted ? '' : ' · support role, not counted as coverage'}
                  </div>
                </div>
              )}
            </span>
          );
        })}
        {row.note && <span className="team-tile__note">{row.note}</span>}
      </div>
    </li>
  );
}

