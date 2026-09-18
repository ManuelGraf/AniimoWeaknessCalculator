/**
 * Shape of the files in public/data, written by `npm run sync`.
 *
 * These mirror scripts/lib/merge.mjs. If a source site changes shape the
 * scraper's own validation fails first, but keeping the types here means the
 * app breaks at compile time rather than silently rendering blanks.
 */

export const ELEMENTS = [
  'Fire', 'Water', 'Grass', 'Lightning', 'Earth', 'Wind', 'Dark', 'Ice', 'Light',
] as const;

export type Element = (typeof ELEMENTS)[number];

export interface ElementDef {
  color: string;
  text: string;
  wikiKey: string;
  strongAgainst: Element[];
  resistedBy: Element[];
}

export interface ChartData {
  multipliers: { strong: number; neutral: number; resisted: number };
  dualRule: 'multiply';
  order: Element[];
  elements: Record<Element, ElementDef>;
}

export interface Skill {
  name: string;
  description: string;
  section: 'Combat' | 'Innate' | 'Mobility' | 'Trait' | null;
  /** null when the source does not tag the skill with an element. */
  element: Element | null;
  power: number | null;
  cost: number | null;
  /** True only for element-tagged Combat/Innate skills - the ones that can score a matchup. */
  offensive: boolean;
  source: 'wiki' | 'guide';
}

export interface Stats {
  total: number;
  hp: number;
  physicalAttack: number;
  magicAttack: number;
  physicalDefense: number;
  magicDefense: number;
  haste: number;
}

export interface Aniimo {
  id: string;
  name: string;
  morphology: string;
  number: string | null;
  isBasic: boolean;
  stage: string | null;
  elements: Element[];
  roles: string[];
  description: string;
  stats: Stats | null;
  habitats: string[];
  /** Stage render, official wiki CDN where available. Always a still image. */
  image: string | null;
  /** Round head icon, used in the search list. */
  head: string | null;
  /** Official VFX loop (.mp4). Not currently rendered. */
  animation: string | null;
  skills: Skill[];
  sources: Array<'wiki' | 'guide'>;
}

export interface Meta {
  generatedAt: string;
  sources: string[];
  counts: {
    forms: number;
    base: number;
    skills: number;
    offensiveSkills: number;
    bySource: Record<string, number>;
  };
  warnings: number;
}
