/**
 * Team coverage maths. Pure, like chart.ts: no React and no DOM.
 *
 * Two questions about up to four Aniimo at once. Defence: what each incoming
 * element does to every member, rolled into one score per element. Offence:
 * the best hit the team's damage dealers can land on each defending element.
 *
 * Offence only counts DPS and Break forms by default, and only their
 * element-tagged moves with might. A healer's super-effective poke is not
 * coverage anyone builds a team around, and a buff with no power deals nothing
 * whatever its element. Mirrored by teamFacts() in scripts/lib/pages.mjs for
 * the static team page's prose.
 */
import type { Aniimo, Element, Skill } from '../types';
import { round, type Chart, type Verdict } from './chart';

export const TEAM_SIZE = 4;

/** One entry per slot, empty slots included, so positions survive a share link. */
export type Team = (Aniimo | null)[];

export type AttackRole = 'dps' | 'break';

/** The role that makes an Aniimo count as a damage dealer, if it has one. */
export function attackRole(a: Aniimo): AttackRole | null {
  for (const r of a.roles) {
    const key = r.toLowerCase();
    if (key === 'dps' || key === 'break') return key;
  }
  return null;
}

/** Element-tagged moves with might. Heals and buffs carry no power and never count. */
export const damagingSkills = (a: Aniimo): Skill[] =>
  a.skills.filter((s) => s.offensive && s.element && (s.power ?? 0) > 0);

/**
 * The elements an Aniimo can actually hit with. Falls back to its own typing
 * when the source lists no damaging move, rather than leaving it with none.
 */
export function attackElements(a: Aniimo): Element[] {
  const els = [...new Set(damagingSkills(a).map((s) => s.element!))];
  return els.length ? els : a.elements;
}

/* ----------------------------------------------------------------- defence */

export interface DefenceMember {
  aniimo: Aniimo;
  multiplier: number;
}

/** The five buckets on the defence axis, worst first. Positive = takes more. */
export type DefenceBand = 2 | 1 | 0 | -1 | -2;

export interface DefenceRow {
  element: Element;
  /** Slot-aligned: null where the slot is empty. */
  members: (DefenceMember | null)[];
  weak: number;
  resist: number;
  /** +2 per 2.56× member, +1 per 1.6×, -1 per 0.625×, -2 per 0.39×. */
  score: number;
  band: DefenceBand;
  verdict: Verdict;
  label: string;
  /** "2 weak · 1 resist", or "all neutral". Empty with no team. */
  counts: string;
}

export interface Defence {
  rows: DefenceRow[];
  /** Elements scoring 2 or more: two members weak, or one taking 2.56×, net of resists. */
  weakTo: Element[];
  resists: Element[];
  headline: string;
}

const weight = (m: number): number => {
  const r = round(m);
  return r > 2 ? 2 : r > 1 ? 1 : r < 0.5 ? -2 : r < 1 ? -1 : 0;
};

export function teamDefence(chart: Chart, team: Team): Defence {
  const filled = team.filter(Boolean).length;
  const weakTo: Element[] = [];
  const resists: Element[] = [];

  const rows = chart.order.map((element): DefenceRow => {
    const members = team.map((a) => (a ? { aniimo: a, multiplier: chart.against(element, a.elements) } : null));
    const present = members.filter((m): m is DefenceMember => !!m);
    const weak = present.filter((m) => round(m.multiplier) > 1).length;
    const resist = present.filter((m) => round(m.multiplier) < 1).length;
    const score = present.reduce((s, m) => s + weight(m.multiplier), 0);

    if (score >= 2) weakTo.push(element);
    if (score <= -2) resists.push(element);

    const band: DefenceBand = score >= 3 ? 2 : score > 0 ? 1 : score === 0 ? 0 : score <= -3 ? -2 : -1;
    const label = !filled
      ? '—'
      : ({ 2: 'Very weak', 1: 'Weak', 0: 'Neutral', [-1]: 'Resistant', [-2]: 'Very resistant' } as const)[band];
    const counts = !filled
      ? ''
      : [weak ? `${weak} weak` : '', resist ? `${resist} resist` : ''].filter(Boolean).join(' · ') || 'all neutral';

    return {
      element,
      members,
      weak,
      resist,
      score,
      band,
      verdict: score > 0 ? 'bad' : score < 0 ? 'good' : 'flat',
      label,
      counts,
    };
  });

  const headline = !filled
    ? 'Add Aniimo to see what hurts'
    : weakTo.length === 0
      ? 'No element hits two of you hard'
      : weakTo.length === 1
        ? `Watch out for ${weakTo[0]}`
        : `${weakTo.length} elements threaten this team`;

  return { rows, weakTo, resists, headline };
}

/* ----------------------------------------------------------------- offence */

export interface Hit {
  aniimo: Aniimo;
  /** The move element that lands it. */
  element: Element;
  multiplier: number;
  role: AttackRole | null;
}

/** The three buckets on the offence axis. Positive = lands more. */
export type OffenceBand = 1 | 0 | -1;

export interface OffenceRow {
  element: Element;
  /** Best multiplier any counted attacker reaches; null with no attacker at all. */
  best: number | null;
  band: OffenceBand;
  /**
   * Read from the attacker's side, so the colours flip against defence:
   * landing more than 1× is good, being resisted is bad.
   */
  verdict: Verdict;
  /** One entry per counted attacker that reaches `best`; empty unless that is super effective. */
  hitters: Hit[];
  /**
   * Members left out of the count that do have a super-effective move here.
   * Shown dimmed, so it is clear why they do not count.
   */
  benched: Hit[];
  label: string;
  note: string;
}

export interface Offence {
  rows: OffenceRow[];
  attackers: Aniimo[];
  covered: number;
  gaps: Element[];
  eyebrow: string;
  headline: string;
}

export function teamOffence(chart: Chart, team: Team, includeSupports = false): Offence {
  const members = team.filter((a): a is Aniimo => !!a);
  const attackers = includeSupports ? members : members.filter((a) => attackRole(a));
  const bench = includeSupports ? [] : members.filter((a) => !attackRole(a));
  const gaps: Element[] = [];
  let covered = 0;

  const rows = chart.order.map((element): OffenceRow => {
    let best = 0;
    let hitters: Hit[] = [];
    for (const a of attackers) {
      for (const mv of attackElements(a)) {
        const m = round(chart.pair(mv, element));
        const hit = { aniimo: a, element: mv, multiplier: m, role: attackRole(a) };
        if (m > best) {
          best = m;
          hitters = [hit];
        } else if (m === best && !hitters.some((h) => h.aniimo === a)) {
          hitters.push(hit);
        }
      }
    }

    const benched = bench.flatMap((a) => {
      const mv = attackElements(a).find((e) => round(chart.pair(e, element)) > 1);
      return mv ? [{ aniimo: a, element: mv, multiplier: round(chart.pair(mv, element)), role: null }] : [];
    });

    const any = attackers.length > 0;
    const verdict: Verdict = !any ? 'flat' : best > 1 ? 'good' : best < 1 ? 'bad' : 'flat';
    if (any && verdict === 'good') covered++;
    if (any && verdict === 'bad') gaps.push(element);

    return {
      element,
      best: any ? best : null,
      band: verdict === 'good' ? 1 : verdict === 'bad' ? -1 : 0,
      verdict,
      // Only a super-effective hit puts a face on the tile. A DPS that merely
      // lands neutral is not an answer, and showing it beside a benched
      // support's real one would read as if it were.
      hitters: verdict === 'good' ? hitters : [],
      benched,
      label: !members.length
        ? ''
        : !any
          ? 'No attacker'
          : verdict === 'good'
            ? 'Super effective'
            : verdict === 'flat'
              ? 'Neutral only'
              : 'Resisted',
      note: !members.length
        ? 'No team yet'
        : !any
          ? benched.length
            ? 'Support only'
            : 'Add a DPS or Break'
          : verdict === 'good'
            ? ''
            : benched.length
              ? 'Only supports hit this'
              : verdict === 'bad'
                ? 'Nobody has an answer'
                : '',
    };
  });

  const headline = !members.length
    ? 'Add Aniimo to see what you can hit'
    : !attackers.length
      ? 'No DPS or Break on the team — nothing counts as coverage'
      : covered === chart.order.length
        ? 'Full coverage — every element hit hard'
        : gaps.length
          ? `${gaps.join(' & ')} ${gaps.length === 1 ? 'shrugs' : 'shrug'} off your attackers`
          : `Covers ${covered} of ${chart.order.length} elements`;

  return {
    rows,
    attackers,
    covered,
    gaps,
    eyebrow: includeSupports ? 'Offence · damage dealt by the whole team' : 'Offence · damage dealt by DPS & Break',
    headline,
  };
}

/* ------------------------------------------------------------------- slots */

/** Ids for the share link: `_` holds an empty slot so the others keep their place. */
export const teamIds = (team: Team): (string | null)[] => team.map((a) => a?.id ?? null);

/** Resolve ids against the roster, padded to a full team. Unknown ids become empty slots. */
export function teamFrom(ids: readonly (string | null)[], byId: ReadonlyMap<string, Aniimo>): Team {
  return Array.from({ length: TEAM_SIZE }, (_, i) => {
    const id = ids[i];
    return id ? (byId.get(id) ?? null) : null;
  });
}
