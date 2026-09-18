/**
 * Everything about *where* the site lives. Pointing a custom domain at the
 * Pages deployment means changing ORIGIN and BASE_PATH here (plus dropping a
 * CNAME file in public/); nothing else in the build reads the URL.
 */
export const ORIGIN = 'https://manuelgraf.github.io';
export const BASE_PATH = '/AniimoWeaknessCalculator';

export const SITE_NAME = 'Aniimo Weakness Calculator';
export const AUTHOR = 'Manuel Graf';
export const REPO = 'https://github.com/ManuelGraf/AniimoWeaknessCalculator';

/** The Reddit thread the tool was announced in, cited as the discussion page. */
export const DISCUSSION = 'https://www.reddit.com/r/Aniimo/comments/1wjdohf/aniimo_attack_type_effectiveness_calculator_for/';

/** Absolute URL for a site-relative path like `element/fire/`. */
export const abs = (rel = '') => `${ORIGIN}${BASE_PATH}/${rel}`.replace(/\/+$/, '/');

/**
 * How many directories deep a page sits, which is how the built asset URLs and
 * the cross-page links get their `../` prefix. `''` is the home page.
 */
export const depthOf = (rel) => rel.split('/').filter(Boolean).length;
export const upTo = (rel) => '../'.repeat(depthOf(rel)) || './';
