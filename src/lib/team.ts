/**
 * Team coverage maths. Pure, like chart.ts: no React and no DOM.
 *
 * Two questions about up to four Aniimo at once. Defence: what each incoming
 * element does to every member, rolled into one score per element. Offence:
 * the best hit the team's damage dealers can land on each defending element.
 *
 * Offence only counts DPS and Break forms by default, and only the elements
 * they are built around: their core element - that of their Innate skills,
 * basic ATK and the Ultimate - plus any other element they carry an
 * outstanding move of. A healer's super-effective poke is not coverage anyone
 * builds a team around, nor is a 40-might side move, nor Stellarys' Chill
 * Glide, which exists to get somewhere. A buff with no power deals nothing
 * whatever its element. Mirrored by teamPage() in scripts/lib/pages.mjs for
 * the static team page's prose.
 */
import type { Aniimo, Element, Skill } from "../types";
import { round, type Chart, type Verdict } from "./chart";

export const TEAM_SIZE = 4;

/** One entry per slot, empty slots included, so positions survive a share link. */
export type Team = (Aniimo | null)[];

export type AttackRole = "dps" | "break";

/** The role that makes an Aniimo count as a damage dealer, if it has one. */
export function attackRole(a: Aniimo): AttackRole | null {
  for (const r of a.roles) {
    const key = r.toLowerCase();
    if (key === "dps" || key === "break") return key;
  }
  return null;
}

/** Element-tagged moves with might. Heals and buffs carry no power and never count. */
export const damagingSkills = (a: Aniimo): Skill[] =>
  a.skills.filter((s) => s.offensive && s.element && (s.power ?? 0) > 0);

/** Off its core element, a move needs this much might to count by default. */
export const OUTSTANDING_POWER = 65;

/**
 * Combat skills that are movement first and damage second: glides, dashes and
 * charges at the target, dodge-leaps, retreats and roll-around forms. Matched
 * against the name and the start of the description, where the wiki says what
 * the move does before what it adds.
 */
const MOBILITY =
  /(glide|dash)|^(flies|dashes (at|toward)|charges (at|toward)|rush(es)? toward|quickly charges|tackles the target|curls into a ball and dashes|quickly leaps up with brief invincible|jumps up to dodge|moves back|immediately breaks free|transforms into a ball|rolls continuously)/i;

export const isMobilityMove = (s: Skill): boolean =>
  MOBILITY.test(s.name) || MOBILITY.test(s.description);

/**
 * The element(s) an Aniimo is built around. The source flags no core skill,
 * but the Innate ones - basic ATK and the Ultimate - always carry it: always
 * one of its types, and on a dual type usually just the one. Falls back to the
 * typing for the few forms listed without moves.
 */
export function coreElements(a: Aniimo): Element[] {
  const innate = damagingSkills(a).filter((s) => s.section === "Innate");
  return innate.length
    ? [...new Set(innate.map((s) => s.element!))]
    : a.elements;
}

/**
 * A move that counts by default: any move of the core element, or an
 * outstanding one off it - at least OUTSTANDING_POWER might and not a
 * mobility skill.
 */
export const isMainMove = (s: Skill, core: readonly Element[]): boolean =>
  core.includes(s.element!) ||
  ((s.power ?? 0) >= OUTSTANDING_POWER && !isMobilityMove(s));

/**
 * The damaging moves that count for coverage: main moves by default, every
 * move with might, whatever its power, with `allMoves`.
 */
export function countedSkills(a: Aniimo, allMoves = false): Skill[] {
  const all = damagingSkills(a);
  if (allMoves) return all;
  const core = coreElements(a);
  return all.filter((s) => isMainMove(s, core));
}

/** The elements an Aniimo counts as hitting with: its core first, then any its counted moves add. */
export function attackElements(a: Aniimo, allMoves = false): Element[] {
  return [
    ...new Set([
      ...coreElements(a),
      ...countedSkills(a, allMoves).map((s) => s.element!),
    ]),
  ];
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
    const members = team.map((a) =>
      a ? { aniimo: a, multiplier: chart.against(element, a.elements) } : null,
    );
    const present = members.filter((m): m is DefenceMember => !!m);
    const weak = present.filter((m) => round(m.multiplier) > 1).length;
    const resist = present.filter((m) => round(m.multiplier) < 1).length;
    const score = present.reduce((s, m) => s + weight(m.multiplier), 0);

    if (score >= 2) weakTo.push(element);
    if (score <= -2) resists.push(element);

    const band: DefenceBand =
      score >= 3 ? 2 : score > 0 ? 1 : score === 0 ? 0 : score <= -3 ? -2 : -1;
    const label = !filled
      ? "—"
      : (
          {
            2: "Very weak",
            1: "Weak",
            0: "Neutral",
            [-1]: "Resistant",
            [-2]: "Very resistant",
          } as const
        )[band];
    const counts = !filled
      ? ""
      : [weak ? `${weak} weak` : "", resist ? `${resist} resist` : ""]
          .filter(Boolean)
          .join(" · ") || "all neutral";

    return {
      element,
      members,
      weak,
      resist,
      score,
      band,
      verdict: score > 0 ? "bad" : score < 0 ? "good" : "flat",
      label,
      counts,
    };
  });

  const headline = !filled
    ? "Add Aniimo to see what hurts"
    : weakTo.length === 0
      ? "No element hits two of you hard"
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
  /**
   * Why a benched hit does not count: a support's role, or a damage dealer
   * that only lands it with a minor move (a dash, a glide, a 30-might filler).
   */
  benchedFor?: "role" | "move";
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
   * Members left out of the count that do have a super-effective move here:
   * supports, and damage dealers whose only such move is a minor one. Shown
   * dimmed, so it is clear why they do not count.
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

export function teamOffence(
  chart: Chart,
  team: Team,
  includeSupports = false,
  allMoves = false,
): Offence {
  const members = team.filter((a): a is Aniimo => !!a);
  const attackers = includeSupports
    ? members
    : members.filter((a) => attackRole(a));
  const bench = includeSupports ? [] : members.filter((a) => !attackRole(a));
  const gaps: Element[] = [];
  let covered = 0;

  const rows = chart.order.map((element): OffenceRow => {
    let best = 0;
    let hitters: Hit[] = [];
    for (const a of attackers) {
      for (const mv of attackElements(a, allMoves)) {
        const m = round(chart.pair(mv, element));
        const hit = {
          aniimo: a,
          element: mv,
          multiplier: m,
          role: attackRole(a),
        };
        if (m > best) {
          best = m;
          hitters = [hit];
        } else if (m === best && !hitters.some((h) => h.aniimo === a)) {
          hitters.push(hit);
        }
      }
    }

    const superEffective = (els: Element[]) =>
      els.find((e) => round(chart.pair(e, element)) > 1);
    const benched: Hit[] = [
      ...bench.flatMap((a) => {
        const mv = superEffective(attackElements(a, allMoves));
        return mv
          ? [
              {
                aniimo: a,
                element: mv,
                multiplier: round(chart.pair(mv, element)),
                role: null,
                benchedFor: "role" as const,
              },
            ]
          : [];
      }),
      // A damage dealer whose super-effective move is only a minor one: there,
      // but not something it is built to land.
      ...(allMoves ? [] : attackers).flatMap((a) => {
        if (superEffective(attackElements(a))) return [];
        const mv = superEffective(attackElements(a, true));
        return mv
          ? [
              {
                aniimo: a,
                element: mv,
                multiplier: round(chart.pair(mv, element)),
                role: attackRole(a),
                benchedFor: "move" as const,
              },
            ]
          : [];
      }),
    ];
    const supportsOnly =
      benched.length > 0 && benched.every((h) => h.benchedFor === "role");

    const any = attackers.length > 0;
    const verdict: Verdict = !any
      ? "flat"
      : best > 1
        ? "good"
        : best < 1
          ? "bad"
          : "flat";
    if (any && verdict === "good") covered++;
    if (any && verdict === "bad") gaps.push(element);

    return {
      element,
      best: any ? best : null,
      band: verdict === "good" ? 1 : verdict === "bad" ? -1 : 0,
      verdict,
      // Only a super-effective hit puts a face on the tile. A DPS that merely
      // lands neutral is not an answer, and showing it beside a benched
      // support's real one would read as if it were.
      hitters: verdict === "good" ? hitters : [],
      benched,
      label: !members.length
        ? ""
        : !any
          ? "No attacker"
          : verdict === "good"
            ? "Super effective"
            : verdict === "flat"
              ? "Neutral only"
              : "Resisted",
      note: !members.length
        ? "No team yet"
        : !any
          ? benched.length
            ? "Support only"
            : "Add a DPS or Break"
          : verdict === "good"
            ? ""
            : benched.length
              ? supportsOnly
                ? "Only supports hit this"
                : "Only minor moves hit this"
              : verdict === "bad"
                ? "Nobody has an answer"
                : "",
    };
  });

  const headline = !members.length
    ? "Add Aniimo to see what you can hit"
    : !attackers.length
      ? "No DPS or Break on the team — nothing counts as coverage"
      : covered === chart.order.length
        ? "Full coverage — every element hit hard"
        : gaps.length
          ? `${gaps.join(" & ")} ${gaps.length === 1 ? "shrugs" : "shrug"} off your attackers`
          : `Covers ${covered} of ${chart.order.length} elements`;

  return {
    rows,
    attackers,
    covered,
    gaps,
    eyebrow: includeSupports
      ? "Offence · damage dealt by the whole team"
      : "Offence · damage dealt by DPS & Break",
    headline,
  };
}

/* --------------------------------------------------------- recommendations */

/*
 * Suggestions follow the offence panel's rules to the letter, switches and
 * all: an Aniimo is only suggested for an element it hits with a move the
 * panel would count. Supports only with `includeSupports`, minor moves only
 * with `allMoves`, and the same fallback to typing for a form with no moves.
 */

export interface Pick {
  aniimo: Aniimo;
  /** The elements it brings to bear: its threat element, or the gaps it closes. */
  elements: Element[];
  /** Counter picks only: its strongest counted move of that element, if it has one. */
  move?: Skill;
}

export interface ThreatPicks {
  element: Element;
  score: number;
  picks: Pick[];
}

const statTotal = (a: Aniimo) => a.stats?.total ?? 0;

/**
 * Forms off the team that offence would count, best form per species:
 * regional variants share a name, and five Scorchhowls is one suggestion, not
 * five. `rank` scores a form; null drops it. Ties go to DPS and Break over
 * supports, then base stat total.
 */
function bestPerSpecies(
  roster: Aniimo[],
  team: Team,
  includeSupports: boolean,
  rank: (a: Aniimo) => number[] | null,
): { a: Aniimo; key: number[] }[] {
  const onTeam = new Set(
    team.filter((a): a is Aniimo => !!a).map((a) => a.name),
  );
  const best = new Map<string, { a: Aniimo; key: number[] }>();
  const better = (x: number[], y: number[]) => {
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i]! > y[i]!;
    return false;
  };
  for (const a of roster) {
    if (onTeam.has(a.name) || (!includeSupports && !attackRole(a))) continue;
    const key = rank(a);
    if (!key) continue;
    const full = [
      ...key,
      attackRole(a) ? 1 : 0,
      statTotal(a),
      a.isBasic ? 1 : 0,
    ];
    const cur = best.get(a.name);
    if (!cur || better(full, cur.key)) best.set(a.name, { a, key: full });
  }
  return [...best.values()].sort((x, y) =>
    better(x.key, y.key)
      ? -1
      : better(y.key, x.key)
        ? 1
        : x.a.name.localeCompare(y.a.name),
  );
}

/**
 * What to bring against this team: attackers that hit the elements it is
 * weakest to. The threats the defence panel names, or, when nothing scores
 * two, whatever scores highest. Forms of that element rank first, then by the
 * might of their move.
 */
export function threatPicks(
  roster: Aniimo[],
  team: Team,
  defence: Defence,
  includeSupports = false,
  allMoves = false,
  perElement = 4,
  maxElements = 3,
): ThreatPicks[] {
  const hot = defence.rows
    .filter((r) => r.score > 0)
    .sort((x, y) => y.score - x.score);
  const top = hot[0]?.score ?? 0;
  const targets = (
    defence.weakTo.length
      ? hot.filter((r) => r.score >= 2)
      : hot.filter((r) => r.score === top)
  ).slice(0, maxElements);
  const move = (a: Aniimo, el: Element) =>
    countedSkills(a, allMoves)
      .filter((s) => s.element === el)
      .sort((x, y) => (y.power ?? 0) - (x.power ?? 0))[0];
  return targets.map((r) => ({
    element: r.element,
    score: r.score,
    picks: bestPerSpecies(roster, team, includeSupports, (a) =>
      attackElements(a, allMoves).includes(r.element)
        ? [
            a.elements.includes(r.element) ? 1 : 0,
            move(a, r.element)?.power ?? 0,
          ]
        : null,
    )
      .slice(0, perElement)
      .map(({ a }) => ({
        aniimo: a,
        elements: [r.element],
        move: move(a, r.element),
      })),
  }));
}

/**
 * Forms that close the team's offence gaps: every element nothing counted
 * lands super effectively on. Ranked by how many gaps a form closes, resisted
 * ones before merely neutral ones.
 */
export function coveragePicks(
  chart: Chart,
  roster: Aniimo[],
  team: Team,
  offence: Offence,
  includeSupports = false,
  allMoves = false,
  max = 6,
): Pick[] {
  const open = offence.rows.filter(
    (r) => r.verdict !== "good" || !offence.attackers.length,
  );
  if (!open.length) return [];
  const closes = (a: Aniimo) => {
    const els = attackElements(a, allMoves);
    return open.filter((r) =>
      els.some((e) => round(chart.pair(e, r.element)) > 1),
    );
  };
  return bestPerSpecies(roster, team, includeSupports, (a) => {
    const rows = closes(a);
    return rows.length
      ? [rows.length, rows.filter((r) => r.verdict === "bad").length]
      : null;
  })
    .slice(0, max)
    .map(({ a }) => ({ aniimo: a, elements: closes(a).map((r) => r.element) }));
}

/* ------------------------------------------------------------------- slots */

/** Ids for the share link: `_` holds an empty slot so the others keep their place. */
export const teamIds = (team: Team): (string | null)[] =>
  team.map((a) => a?.id ?? null);

/** Resolve ids against the roster, padded to a full team. Unknown ids become empty slots. */
export function teamFrom(
  ids: readonly (string | null)[],
  byId: ReadonlyMap<string, Aniimo>,
): Team {
  return Array.from({ length: TEAM_SIZE }, (_, i) => {
    const id = ids[i];
    return id ? (byId.get(id) ?? null) : null;
  });
}
