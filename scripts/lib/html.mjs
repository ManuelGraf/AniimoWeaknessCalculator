/**
 * The static HTML shell every prerendered page is poured into.
 *
 * Two audiences read this output and neither of them runs JavaScript: search
 * crawlers, and the AI crawlers (GPTBot, ClaudeBot, PerplexityBot and friends)
 * that answer "what is X weak to in Aniimo". They see an empty #root on a
 * client-rendered page, so the answer has to be in the markup they are served.
 *
 * Styling is not inlined here any more. The page links the same hashed
 * stylesheet the app bundles from src/aniimo-dark.css + src/aniimo-site.css,
 * which prerender.mjs lifts out of dist/index.html. That is deliberate: the
 * app mounts on top of this markup rather than replacing it, so anything that
 * described the look twice would eventually describe it differently.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ORIGIN, BASE_PATH, SITE_NAME, abs, upTo } from './site.mjs';

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);

/** Collapses whitespace so a description never carries a stray newline. */
export const oneLine = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

/** Google truncates around 160 characters; cut on a word rather than mid-word. */
export function clamp(s, max = 158) {
  const text = oneLine(s);
  if (text.length <= max) return text;
  const cut = text.lastIndexOf(' ', max - 1);
  return `${text.slice(0, cut > 0 ? cut : max - 1)}\u2026`;
}

/** "Water, Earth and Light" - for the plain-language answer sentences. */
export const list = (items, conjunction = 'and') => {
  const a = items.filter(Boolean);
  if (!a.length) return 'nothing';
  if (a.length === 1) return a[0];
  return `${a.slice(0, -1).join(', ')} ${conjunction} ${a[a.length - 1]}`;
};

/* ------------------------------------------------------------------ assets */

const HERE = path.dirname(fileURLToPath(import.meta.url));

/**
 * The element and role glyphs, inlined at the top of <body>.
 *
 * Inlined rather than referenced as <use href="icons.svg#id"> because a
 * cross-document reference does not inherit currentColor, which is the whole
 * mechanism the plates are coloured by. ~15KB, and it is the same file the app
 * imports, so there is one copy of the artwork.
 */
const SPRITE = readFileSync(path.join(HERE, '..', '..', 'src', 'aniimo-icons.svg'), 'utf8')
  // The file documents itself with a worked <use href="..."> example. Left in,
  // that example ships on all 274 pages and the link checker below reads it as
  // a real reference to a file that does not exist.
  .replace(/<!--[\s\S]*?-->/g, '')
  .trim();

/**
 * The coloured field the sticky glass header blurs. A direct child of <body>,
 * pinned to the top of the document - see the note in src/aniimo-site.css for
 * why it is not inside the hero. Duplicated in index.html for the dev shell.
 */
const AMBIENT = '<div class="ambient" aria-hidden="true"><div class="ambient__grid"></div></div>';

/** Kept in step with the same pair in index.html. */
const FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@500;600;700&family=Manrope:wght@400;500;600;700&display=swap" rel="stylesheet">`;

/* ---------------------------------------------------------------- verdicts */

// 1.6 * 0.625 is not exactly 1 in binary floating point, so bucket on a
// rounded value rather than comparing the raw product.
const round4 = (n) => Math.round(n * 10000) / 10000;

/**
 * The single switch every multiplier-coloured component reads. Set from the
 * number, never from the text: "bad" takes more damage, "good" resists, "flat"
 * is neutral. Holds for duals too - 2.56 and 1.6 are both bad, 0.625 and 0.391
 * are both good, and 0.625 x 1.6 comes out flat on its own.
 */
export function verdict(multiplier) {
  const m = round4(multiplier);
  if (m > 1) return 'bad';
  if (m < 1) return 'good';
  return 'flat';
}

export const verdictAttr = (multiplier) => ` data-verdict="${verdict(multiplier)}"`;

/* ------------------------------------------------------------ element bits */

const slug = (el) => String(el).toLowerCase();

const glyph = (id) => `<svg class="icon" aria-hidden="true"><use href="#${id}"></use></svg>`;

/**
 * An element pill. The colour comes from the data-el attribute via the
 * stylesheet - no element hex is ever written into markup.
 */
export const elChip = (el, href) => {
  const body = `${glyph(`el-${slug(el)}`)}${esc(el)}`;
  return href
    ? `<a class="el-chip" data-el="${slug(el)}" href="${esc(href)}">${body}</a>`
    : `<span class="el-chip" data-el="${slug(el)}">${body}</span>`;
};

/** The square icon plate. `size` is one of xs, sm, md, lg. */
export const elPlate = (el, size = 'md') =>
  `<span class="el-plate el-plate--${size}" data-el="${slug(el)}">${glyph(`el-${slug(el)}`)}</span>`;

/**
 * Role badge. The data calls the support role "sup"; the artwork calls it
 * "support". `energy` is in the data but has no glyph and no colour token in
 * the design, so it falls back to a plain tag rather than borrowing another
 * role's icon.
 */
const ROLE_GLYPH = { dps: 'dps', heal: 'heal', sup: 'support', break: 'break', regen: 'regen' };
const ROLE_LABEL = { dps: 'DPS', heal: 'Heal', sup: 'Support', break: 'Break', regen: 'Regen', energy: 'Energy' };

export const roleChip = (role) => {
  const key = slug(role);
  const label = esc(ROLE_LABEL[key] ?? role);
  const icon = ROLE_GLYPH[key];
  if (!icon) return `<span class="tag">${label}</span>`;
  return `<span class="role-chip" data-role="${icon}">
<span class="role-chip__mark">${glyph(`role-${icon}`)}</span>${label}</span>`;
};

/** How a role is written for a reader. Mirrors roleLabel() in src/components/ElementBadge.tsx. */
export const roleLabel = (role) => ROLE_LABEL[slug(role)] ?? role;

/**
 * The glyph on its own, sized to sit on an Aniimo's artwork. The twin of
 * <RoleBadge> in src/components/AniimoGrid.tsx.
 */
export const roleBadge = (role) => {
  const icon = ROLE_GLYPH[slug(role)];
  const label = esc(roleLabel(role));
  if (!icon) return `<span class="tile__role tile__role--text">${label}</span>`;
  return `<span class="tile__role" data-role="${icon}" title="${label}">${glyph(`role-${icon}`)}</span>`;
};

/* ------------------------------------------------------------------- shell */

/**
 * The document. `rel` is the site-relative directory (`''` for home), which
 * fixes both the canonical URL and how far `../` has to climb for assets.
 *
 * #root comes first and #prerender second, because the app does not replace
 * this page - it mounts above it. Only the parts the running app genuinely
 * duplicates are marked `data-app-owns` and removed on boot; the headline, the
 * summary, the questions and the cross-links stay, so a crawler that renders
 * JavaScript reads the same page a crawler that does not.
 */
export function renderPage({
  rel,
  title,
  description,
  body,
  jsonLd = [],
  assets,
  route,
  noindex = false,
  ogImage = null,
  // Ownership tags lifted from index.html; see verificationTagsFrom().
  verification = [],
  // 404.html is served for any unknown path at any depth, so it cannot use a
  // relative prefix; it passes an absolute one and drops its canonical.
  up: upOverride,
  canonical: withCanonical = true,
}) {
  const up = upOverride ?? upTo(rel);
  const canonical = abs(rel);
  const desc = clamp(description);
  const ld = jsonLd
    .filter(Boolean)
    .map((o) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`);

  // Aniimo pages hand us the official CDN render, which is already absolute;
  // anything else is a file shipped in the site root.
  const image = ogImage ? (/^https?:\/\//.test(ogImage) ? ogImage : `${ORIGIN}${BASE_PATH}/${ogImage}`) : null;
  const imageTags = image
    ? `<meta property="og:image" content="${esc(image)}">
<meta property="og:image:alt" content="${esc(title)}">
<meta name="twitter:image" content="${esc(image)}">
`
    : '';

  const robots = noindex
    ? 'noindex, follow'
    : 'index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1';

  // Search Console checks the very top of the head, so these go in first.
  const ownership = verification.length ? `${verification.join('\n')}\n` : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${ownership}<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
${withCanonical ? `<link rel="canonical" href="${esc(canonical)}">
` : ''}<meta name="robots" content="${robots}">
<meta name="theme-color" content="#070A10">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(SITE_NAME)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
${withCanonical ? `<meta property="og:url" content="${esc(canonical)}">
` : ''}<meta property="og:locale" content="en_US">
<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
${imageTags}<link rel="icon" href="${up}logo-mono.svg">
<link rel="apple-touch-icon" href="${up}logo.svg">
${FONTS}
${ld.join('\n')}
<script>window.__SITE_ROOT__=${JSON.stringify(up)};window.__ROUTE__=${JSON.stringify(route ?? null)};</script>
${assets(up)}
</head>
<body>
${SPRITE}
${AMBIENT}
<div id="root"></div>
<div id="prerender">
${body}
</div>
</body>
</html>
`;
}

/* ------------------------------------------------------------------ chrome */

/** Short "18 Sep" for the header status chip. */
const shortDate = (iso) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

const isoDate = (iso) => new Date(iso).toISOString().slice(0, 10);

/**
 * The glass header, worded and structured the same as the app's own so the
 * swap on boot is not visible. `current` marks the active nav item and is one
 * of 'chart', 'aniimo' or null.
 *
 * The brand mark is an <img> rather than inlined SVG so the logo lives in
 * exactly one file that both this and the React header point at.
 */
export const header = (up, meta, current = null) => {
  // `key` is null for links that are never "the current page" (the FAQ anchor
  // lives on every page). Comparing against a null `current` would otherwise
  // mark them all, so an absent key never matches.
  const item = (href, label, key) =>
    `<a href="${up}${href}"${key !== null && current === key ? ' aria-current="page"' : ''}>${label}</a>`;

  return `<header class="site-header" data-app-owns>
<a class="brand" href="${up}">
<span class="brand__mark"><img src="${up}logo.svg" alt="" width="23" height="23"></span>
<span class="brand__text">
<span class="brand__name">Aniimo</span>
<span class="brand__sub">Weakness Calculator</span>
</span>
</a>
<nav class="nav" aria-label="Primary">
${item('chart/', 'Full chart', 'chart')}
${item('aniimo/', 'Aniimo', 'aniimo')}
${item('#faq', 'FAQ', null)}
</nav>
<div class="header-spacer"></div>
<span class="status-chip">${meta.counts.forms} forms \u00b7 <time datetime="${esc(meta.generatedAt)}">${esc(shortDate(meta.generatedAt))}</time></span>
</header>`;
};

/**
 * A page's opening block: breadcrumbs, headline, lede and the lead answer.
 * The coloured field the header blurs is AMBIENT below, emitted once per
 * document rather than per hero.
 */
export const hero = (inner) => `<div class="hero">
<div class="page page--narrow hero__inner">
${inner}
</div>
</div>`;

export const crumbs = (trail) =>
  `<nav class="crumbs" aria-label="Breadcrumb">${trail
    .map(
      (t, i) =>
        (t.href ? `<a href="${esc(t.href)}">${esc(t.name)}</a>` : `<span>${esc(t.name)}</span>`) +
        (i < trail.length - 1 ? ' \u203a ' : ''),
    )
    .join('')}</nav>`;

export const footer = (up, meta) => `<footer class="site-footer">
<div class="page">
<div class="foot-note">
<p><strong>Where the numbers come from.</strong> The element chart is taken from
<a href="https://aniimoguide.com/elements" rel="nofollow noopener">aniimoguide.com</a> and re-verified against that page on
every data refresh. Aniimo, their forms, stats and move lists come from the official
<a href="https://wiki.aniimo.com/" rel="nofollow noopener">wiki.aniimo.com</a>, last synced
<time datetime="${esc(meta.generatedAt)}">${esc(isoDate(meta.generatedAt))}</time>
(${meta.counts.forms} forms, ${meta.counts.skills} moves).</p>
<p>Dual-element defenders multiply both matchups, so 1.6 \u00d7 1.6 = 2.56\u00d7. The game does not document this; the
calculator follows the rule and worked examples published on aniimoguide.</p>
<p>An unofficial fan project, not affiliated with or endorsed by the makers of Aniimo.</p>
</div>
<nav aria-label="Site">
<a href="${up}">Calculator</a>
<a href="${up}chart/">Full chart</a>
<a href="${up}aniimo/">All Aniimo</a>
</nav>
</div>
</footer>`;
