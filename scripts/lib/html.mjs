/**
 * The static HTML shell every prerendered page is poured into.
 *
 * Two audiences read this output and neither of them runs JavaScript: search
 * crawlers, and the AI crawlers (GPTBot, ClaudeBot, PerplexityBot and friends)
 * that answer "what is X weak to in Aniimo". They see an empty #root on a
 * client-rendered page, so the answer has to be in the markup they are served.
 *
 * The styling is a small hand-written stylesheet rather than Tailwind classes:
 * Tailwind only emits what it finds in src/, so classes invented here would
 * come out unstyled. Inlining it also means the static page is readable before
 * the app bundle arrives.
 */
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

export const STYLES = `
:root{color-scheme:dark;--ink-950:#07080b;--ink-900:#0b0d12;--ink-850:#10131a;--ink-700:#1e2430;--ink-400:#6b7689;--ink-300:#98a2b6;--ink-200:#c3cad8;--ink-100:#e8ecf4;--accent:#2ee6a8;--crit:#ff4d6d;--weak:#ff8a3d;--neutral:#6b7689;--resist:#3ba9f5;--immune:#7c6bff}
*{box-sizing:border-box}
body{margin:0;background:var(--ink-950);color:var(--ink-100);font:400 15px/1.6 'Inter',ui-sans-serif,system-ui,sans-serif;-webkit-font-smoothing:antialiased;background-image:radial-gradient(60rem 30rem at 12% -10%,rgb(46 230 168 / .09),transparent),radial-gradient(50rem 26rem at 92% -6%,rgb(124 107 255 / .11),transparent);background-attachment:fixed}
a{color:var(--accent);text-decoration:none}
a:hover{text-decoration:underline}
.wrap{max-width:64rem;margin:0 auto;padding:0 1rem 3rem}
@media(min-width:640px){.wrap{padding:0 1.5rem 3rem}}
.top{border-bottom:1px solid rgb(255 255 255 / .06);background:rgb(7 8 11 / .8);margin-bottom:1.5rem}
.top .wrap{display:flex;align-items:center;gap:.75rem;padding-top:.75rem;padding-bottom:.75rem}
.mark{flex:0 0 auto;display:grid;place-items:center;width:2.25rem;height:2.25rem;border-radius:.75rem;background:rgb(46 230 168 / .15);font-size:1.125rem}
.top .name{font-size:.9375rem;font-weight:600;line-height:1.2;color:var(--ink-100)}
.top .sub{font-size:.6875rem;color:var(--ink-400);margin:0}
.card{border:1px solid rgb(255 255 255 / .08);background:rgb(11 13 18 / .7);border-radius:1rem;padding:1rem;margin:0 0 1.25rem;box-shadow:inset 0 1px 0 0 rgb(255 255 255 / .04),0 20px 40px -24px rgb(0 0 0 / .8)}
@media(min-width:640px){.card{padding:1.25rem 1.5rem}}
h1{font-size:1.5rem;line-height:1.25;margin:0 0 .5rem;letter-spacing:-.01em}
@media(min-width:640px){h1{font-size:1.875rem}}
h2{font-size:1.125rem;margin:0 0 .35rem}
h3{font-size:.9375rem;margin:1.25rem 0 .5rem}
.lede{font-size:1rem;color:var(--ink-200);margin:0 0 .75rem}
.muted{color:var(--ink-400);font-size:.8125rem}
.answer{margin:.75rem 0;padding:.75rem .9rem;border-left:2px solid var(--accent);background:rgb(46 230 168 / .06);border-radius:0 .5rem .5rem 0}
.answer p{margin:0 0 .35rem}
.answer p:last-child{margin:0}
table{width:100%;border-collapse:collapse;font-size:.875rem}
caption{text-align:left;font-size:.75rem;color:var(--ink-400);padding-bottom:.5rem}
th,td{text-align:left;padding:.4rem .5rem;border-bottom:1px solid rgb(255 255 255 / .05)}
th{font-size:.6875rem;text-transform:uppercase;letter-spacing:.08em;color:var(--ink-400);font-weight:600}
tbody th{font-size:.875rem;text-transform:none;letter-spacing:0;color:var(--ink-100);font-weight:500}
td.num{font-family:'JetBrains Mono',ui-monospace,monospace;font-weight:700;text-align:right;white-space:nowrap}
.scroll{overflow-x:auto}
.grid{border-collapse:separate;border-spacing:.2rem;text-align:center;font-size:.75rem}
.grid th,.grid td{border:0;padding:0}
.grid thead th,.grid tbody th{padding:.2rem .3rem;white-space:nowrap}
.grid tbody th{text-align:right}
.grid td>span{display:block;padding:.4rem .25rem;border-radius:.4rem;font-family:'JetBrains Mono',ui-monospace,monospace;font-weight:700;border:1px solid rgb(255 255 255 / .06);background:rgb(255 255 255 / .02);color:var(--ink-400)}
.chip{display:inline-flex;align-items:center;gap:.4rem;border-radius:999px;border:1px solid;padding:.2rem .6rem;font-size:.6875rem;font-weight:500;text-transform:uppercase;letter-spacing:.06em;white-space:nowrap}
.chip::before{content:"";width:.375rem;height:.375rem;border-radius:999px;background:currentColor;box-shadow:0 0 6px currentColor}
.chips{display:flex;flex-wrap:wrap;gap:.35rem;margin:.5rem 0}
.legend{display:flex;flex-wrap:wrap;gap:1rem;margin-top:1rem;font-size:.6875rem;color:var(--ink-400)}
.legend span b{display:inline-block;width:.6rem;height:.6rem;border-radius:.15rem;margin-right:.3rem}
ul.plain{list-style:none;padding:0;margin:.5rem 0}
.cols{display:grid;gap:1rem}
@media(min-width:640px){.cols{grid-template-columns:1fr 1fr}}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(5rem,1fr));gap:.5rem;margin:.75rem 0 0;padding:0}
.stats div{background:rgb(255 255 255 / .03);border:1px solid rgb(255 255 255 / .05);border-radius:.5rem;padding:.4rem .5rem}
.stats dt{font-size:.625rem;text-transform:uppercase;letter-spacing:.08em;color:var(--ink-400)}
.stats dd{margin:.1rem 0 0;font-family:'JetBrains Mono',ui-monospace,monospace;font-size:.9375rem}
.roster{display:grid;gap:.25rem .75rem;grid-template-columns:repeat(auto-fill,minmax(11rem,1fr));list-style:none;padding:0;margin:.5rem 0 0;font-size:.875rem}
.crumbs{font-size:.75rem;color:var(--ink-400);margin:0 0 .75rem}
.crumbs a{color:var(--ink-300)}
.cta{display:inline-block;margin-top:.75rem;background:var(--accent);color:var(--ink-950);font-weight:600;font-size:.875rem;padding:.5rem 1rem;border-radius:.6rem}
.cta:hover{text-decoration:none;filter:brightness(1.1)}
.hero{display:flex;gap:1rem;align-items:flex-start}
.hero img{width:5.5rem;height:5.5rem;object-fit:contain;flex:0 0 auto;border-radius:.75rem;background:rgb(255 255 255 / .03)}
.foot{font-size:.75rem;color:var(--ink-400);line-height:1.7;border-top:1px solid rgb(255 255 255 / .06);padding-top:1rem}
.foot a{color:var(--ink-300)}
details{border:1px solid rgb(255 255 255 / .07);border-radius:.6rem;padding:.6rem .8rem;margin:0 0 .5rem;background:rgb(255 255 255 / .02)}
summary{cursor:pointer;font-weight:600;font-size:.9375rem}
details p{margin:.5rem 0 0;color:var(--ink-200);font-size:.875rem}
`;

const BAND_COLOR = {
  x256: 'var(--crit)',
  x16: 'var(--weak)',
  x1: 'var(--neutral)',
  x0625: 'var(--resist)',
  x039: 'var(--immune)',
};

/** Inline style for a multiplier cell, coloured by its band. Neutral stays bare. */
export const bandStyle = (key) => {
  if (key === 'x1') return '';
  const color = BAND_COLOR[key] ?? 'var(--neutral)';
  return ` style="color:${color};border-color:color-mix(in oklab,${color} 35%,transparent);background:color-mix(in oklab,${color} 12%,transparent)"`;
};

export const bandText = (key) =>
  key === 'x1' ? '' : ` style="color:${BAND_COLOR[key] ?? 'var(--neutral)'}"`;

export const bandSwatch = (key) => BAND_COLOR[key] ?? 'var(--neutral)';

/** An element pill, tinted from the colour in elements.json. */
export const chip = (chart, el, href) => {
  const tint = chart.defs[el]?.text ?? '#98a2b6';
  const inner = `<span class="chip" style="color:${tint};border-color:color-mix(in oklab,${tint} 40%,transparent);background:color-mix(in oklab,${tint} 13%,transparent)">${esc(el)}</span>`;
  return href ? `<a href="${esc(href)}">${inner}</a>` : inner;
};

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

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
${withCanonical ? `<link rel="canonical" href="${esc(canonical)}">
` : ''}<meta name="robots" content="${robots}">
<meta name="theme-color" content="#07080b">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(SITE_NAME)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
${withCanonical ? `<meta property="og:url" content="${esc(canonical)}">
` : ''}<meta property="og:locale" content="en_US">
<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
${imageTags}<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><text y='26' font-size='26'>%E2%9A%A1</text></svg>">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet">
<style>${STYLES}</style>
${ld.join('\n')}
<script>window.__SITE_ROOT__=${JSON.stringify(up)};window.__ROUTE__=${JSON.stringify(route ?? null)};</script>
${assets(up)}
</head>
<body>
<div id="root"></div>
<div id="prerender">
${body}
</div>
</body>
</html>
`;
}

/** Header, worded the same as the app's own so the swap is not jarring. */
export const header = (up, meta) => `<header class="top" data-app-owns><div class="wrap">
<span class="mark" aria-hidden="true">\u26a1</span>
<div><a class="name" href="${up}">${esc(SITE_NAME)}</a>
<p class="sub">${meta.counts.forms} forms \u00b7 synced <time datetime="${esc(meta.generatedAt)}">${new Date(meta.generatedAt).toISOString().slice(0, 10)}</time></p></div>
</div></header>`;

export const crumbs = (trail) =>
  `<nav class="crumbs" aria-label="Breadcrumb">${trail
    .map(
      (t, i) =>
        (t.href ? `<a href="${esc(t.href)}">${esc(t.name)}</a>` : `<span>${esc(t.name)}</span>`) +
        (i < trail.length - 1 ? ' \u203a ' : ''),
    )
    .join('')}</nav>`;

export const footer = (up, meta) => `<footer class="foot">
<p><strong>Where the numbers come from.</strong> The element chart is taken from
<a href="https://aniimoguide.com/elements" rel="nofollow noopener">aniimoguide.com</a> and re-verified against that page on
every data refresh. Aniimo, their forms, stats and move lists come from the official
<a href="https://wiki.aniimo.com/" rel="nofollow noopener">wiki.aniimo.com</a>, last synced
<time datetime="${esc(meta.generatedAt)}">${new Date(meta.generatedAt).toISOString().slice(0, 10)}</time>
(${meta.counts.forms} forms, ${meta.counts.skills} moves).</p>
<p>Dual-element defenders multiply both matchups, so 1.6 \u00d7 1.6 = 2.56\u00d7. The game does not document this; the
calculator follows the rule and worked examples published on aniimoguide.</p>
<p>An unofficial fan project, not affiliated with or endorsed by the makers of Aniimo.
<a href="${up}">Open the calculator</a> \u00b7 <a href="${up}chart/">Full element chart</a> \u00b7 <a href="${up}aniimo/">All Aniimo</a></p>
</footer>`;
