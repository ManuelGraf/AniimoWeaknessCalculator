#!/usr/bin/env node
/**
 * Turn the single-page build into a set of real, crawlable pages.
 *
 *   npm run build   ->  vite build, then this
 *
 * Why: the app renders entirely in the browser, so anything that does not run
 * JavaScript is served an empty <div id="root">. Google can execute JS, but the
 * AI crawlers that now answer "what is Glacy weak to" largely cannot. This
 * writes a static, fully-worded page for every element, every dual pairing and
 * every Aniimo form, each of which boots the real app on top of itself.
 *
 * Nothing here is committed. It all lands in dist/, which is gitignored and
 * rebuilt from scratch by CI on every deploy.
 */
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ORIGIN, BASE_PATH, SITE_NAME, DISCUSSION, REPO, abs, upTo } from './lib/site.mjs';
import { createChart, paths, displayName, formatMultiplier, band } from './lib/matchups.mjs';
import { renderPage, header, footer, list, clamp } from './lib/html.mjs';
import {
  homePage,
  chartPage,
  elementPage,
  dualPage,
  aniimoPage,
  rosterPage,
  notFoundPage,
  elementFacts,
} from './lib/pages.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const DATA = path.join(ROOT, 'public', 'data');

const exists = (p) => access(p).then(() => true, () => false);

/**
 * Pull the hashed asset tags out of Vite's index.html so every generated page
 * loads the same bundle, with `./` re-pointed at the right number of levels up.
 */
function assetTagsFrom(html) {
  const tags = [];
  const patterns = [
    /<script\b[^>]*type="module"[^>]*><\/script>/g,
    /<link\b[^>]*rel="(?:stylesheet|modulepreload|preload)"[^>]*>/g,
  ];
  for (const re of patterns) {
    for (const [tag] of html.matchAll(re)) {
      // Google Fonts and the like are already in our own <head>; we only want
      // the build output, which Vite emits with a relative "./" href.
      if (/(?:src|href)="\.\//.test(tag)) tags.push(tag);
    }
  }
  if (!tags.some((t) => t.startsWith('<script'))) {
    throw new Error('No module script found in dist/index.html - did vite build run?');
  }
  return (up) => tags.map((t) => t.replace(/((?:src|href)=")\.\//g, `$1${up}`)).join('\n');
}

/**
 * Carry search-engine ownership tags over from index.html.
 *
 * Search Console, Bing and the rest hand you a <meta> tag and tell you to put
 * it in your home page's <head>. index.html is the obvious place to paste it,
 * but this generator replaces that head wholesale, so without this the tag
 * would silently never reach the deployed page. Copying it onto every page
 * also covers re-verification and any property added later for a subdirectory.
 */
function verificationTagsFrom(html) {
  const known = /^(?:msvalidate\.01|[a-z-]+-site-verification|facebook-domain-verification)$/i;
  const tags = [];
  for (const [tag, name] of html.matchAll(/<meta\b[^>]*\bname="([^"]+)"[^>]*>/g)) {
    if (known.test(name)) tags.push(tag.replace(/\s*\/?>$/, '>'));
  }
  return tags;
}

async function main() {
  const started = Date.now();

  const shell = await readFile(path.join(DIST, 'index.html'), 'utf8').catch(() => {
    throw new Error('dist/index.html is missing. Run `vite build` first.');
  });
  const assets = assetTagsFrom(shell);
  const verification = verificationTagsFrom(shell);
  if (verification.length) {
    console.log(`  carrying over ${verification.length} site-verification tag(s) from index.html`);
  }

  const [chartData, roster, meta] = await Promise.all([
    readFile(path.join(DATA, 'elements.json'), 'utf8').then(JSON.parse),
    readFile(path.join(DATA, 'aniimo.json'), 'utf8').then(JSON.parse),
    readFile(path.join(DATA, 'meta.json'), 'utf8').then(JSON.parse),
  ]);

  const chart = createChart(chartData);
  const ogImage = (await exists(path.join(DIST, 'og.png'))) ? 'og.png' : null;

  /** Everything a page needs, collected so the sitemap can be built from it. */
  const written = [];
  /** Every page produced, indexed or not, for the link check at the end. */
  const allPages = [];

  async function emit({ rel, title, description, page, route, noindex = false, ogImage: img, priority, changefreq, nav = null }) {
    const up = upTo(rel);
    const html = renderPage({
      rel,
      title,
      description,
      route,
      noindex,
      assets,
      ogImage: img === undefined ? ogImage : img,
      verification,
      jsonLd: page.jsonLd,
      body: `${header(up, meta, nav)}\n${page.body}\n${footer(up, meta)}`,
    });

    const file = path.join(DIST, rel, 'index.html');
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, html, 'utf8');
    allPages.push({ rel, file, title, description: clamp(description) });
    if (!noindex) written.push({ rel, priority, changefreq });
  }

  /* ------------------------------------------------------------------ home */

  await emit({
    rel: paths.home,
    title: 'Aniimo Type Effectiveness Chart & Weakness Calculator',
    description:
      'The full Aniimo element chart: what every type is strong and weak against, ' +
      `plus the weaknesses and move coverage of all ${meta.counts.forms} Aniimo forms.`,
    page: homePage({ chart, roster, meta, up: upTo(paths.home) }),
    route: null,
    priority: '1.0',
    changefreq: 'weekly',
  });

  await emit({
    rel: paths.chart,
    title: 'Aniimo Element Chart — Full 9×9 Damage Multiplier Table',
    description:
      'Every Aniimo matchup in one grid: which element deals 1.6×, which is resisted to 0.625×, and how dual-element defenders reach 2.56× or 0.39×.',
    page: chartPage({ chart, meta, up: upTo(paths.chart) }),
    route: { view: 'chart' },
    nav: 'chart',
    priority: '0.9',
    changefreq: 'monthly',
  });

  await emit({
    rel: paths.roster,
    title: `All ${meta.counts.forms} Aniimo and Their Weaknesses`,
    description:
      `Every Aniimo form with its elements, roles and weaknesses in one table — ` +
      `what deals each of the ${meta.counts.forms} forms the most damage, and what it resists.`,
    page: rosterPage({ chart, roster, meta, up: upTo(paths.roster) }),
    // The app's roster view replaces the tile grid here, so the page opens
    // straight into it rather than into an empty calculator.
    route: { view: 'roster' },
    nav: 'aniimo',
    priority: '0.9',
    changefreq: 'weekly',
  });

  /* -------------------------------------------------------------- elements */

  for (const el of chart.order) {
    const rel = paths.element(el);
    const f = elementFacts(chart, el);
    await emit({
      rel,
      title: `${el} Weaknesses in Aniimo — Type Effectiveness Chart`,
      description:
        `${el} is weak to ${list(f.weakTo)} (1.6×) and resists ${list(f.resists)} (0.625×). ` +
        `${el} moves hit ${list(f.strongAgainst)} hardest.`,
      page: elementPage({ chart, el, roster, up: upTo(rel) }),
      route: { view: 'calc', kind: 'elements', elements: [el.toLowerCase()] },
      priority: '0.9',
      changefreq: 'monthly',
    });
  }

  /* ---------------------------------------------------------- dual pairings */

  let dualIndexed = 0;
  for (const [a, b] of chart.pairs()) {
    const rel = paths.dual(chart.order, a, b);
    const page = dualPage({ chart, a, b, roster, up: upTo(rel) });
    // A pairing no Aniimo actually has still answers the question, but it is
    // not worth asking a crawler to index. Keep it reachable, keep it out of
    // the index.
    const unused = page.count === 0;
    if (!unused) dualIndexed++;
    await emit({
      rel,
      title: `${a}/${b} Aniimo Weaknesses — Dual Element Chart`,
      description: page.worst.length
        ? `A ${a}/${b} Aniimo takes the most damage from ${list(page.worst)}. Full dual-element multiplier table, 2.56× down to 0.39×.`
        : `Nothing is super effective against a ${a}/${b} Aniimo. Full dual-element multiplier table, 1× down to 0.39×.`,
      page,
      route: { view: 'calc', kind: 'elements', elements: [a.toLowerCase(), b.toLowerCase()] },
      noindex: unused,
      priority: '0.7',
      changefreq: 'monthly',
    });
  }

  /* ---------------------------------------------------------------- aniimo */

  for (const a of roster) {
    const rel = paths.aniimo(a);
    const page = aniimoPage({ chart, aniimo: a, roster, up: upTo(rel) });
    await emit({
      rel,
      title: `${displayName(a)} Weaknesses & Type Effectiveness`,
      description: page.description,
      page,
      route: { view: 'aniimo', id: a.id },
      // The official render makes a real card when the page is shared.
      ogImage: a.image ?? ogImage,
      priority: a.isBasic ? '0.7' : '0.6',
      changefreq: 'monthly',
    });
  }

  /* ------------------------------------------------------------------- 404 */

  // GitHub Pages serves this file's contents for any unknown path while the
  // address bar keeps that path, so every URL in it - assets included - has to
  // be absolute rather than relative to a directory that does not exist.
  const root = `${BASE_PATH}/`;
  const notFoundHtml = renderPage({
    rel: '',
    up: root,
    canonical: false,
    title: 'Page not found — Aniimo Weakness Calculator',
    description: 'That URL is not part of the Aniimo weakness calculator.',
    noindex: true,
    assets,
    verification,
    route: null,
    jsonLd: [],
    body: `${header(root, meta)}\n${notFoundPage({ up: root }).body}\n${footer(root, meta)}`,
  });
  await writeFile(path.join(DIST, '404.html'), notFoundHtml, 'utf8');

  /* --------------------------------------------------- robots and sitemaps */

  await writeFile(path.join(DIST, 'robots.txt'), robots(), 'utf8');
  await writeFile(path.join(DIST, 'sitemap.xml'), sitemap(written, meta), 'utf8');
  const llmsText = llms({ chart, roster, meta });
  // A stray `${}` picking up an imported helper instead of a local renders as
  // a lump of JavaScript, which reads as plausible markdown until you look.
  if (/<\/?[a-z]/i.test(llmsText)) {
    throw new Error('llms.txt contains markup - a template placeholder resolved to the wrong value');
  }
  await writeFile(path.join(DIST, 'llms.txt'), llmsText, 'utf8');

  await verify(allPages);

  const secs = ((Date.now() - started) / 1000).toFixed(1);
  console.log(
    `\nPrerendered ${written.length + (chart.pairs().length - dualIndexed)} pages in ${secs}s\n` +
      `  1 home, 1 chart, 1 roster index\n` +
      `  ${chart.order.length} elements, ${dualIndexed} dual pairings indexed ` +
      `(${chart.pairs().length - dualIndexed} unused pairings written as noindex)\n` +
      `  ${roster.length} Aniimo forms\n` +
      `  sitemap.xml (${written.length} URLs), robots.txt, llms.txt, 404.html\n`,
  );
}

/* ------------------------------------------------------------ verification */

/**
 * A relative link that climbs the wrong number of directories still renders
 * fine and only fails in production, so every internal href is resolved
 * against the file that contains it and checked on disk. Titles and
 * descriptions are reported rather than enforced: length limits are guidance,
 * a dead link is a bug.
 */
async function verify(pages) {
  const broken = [];
  const longTitles = [];
  const clipped = [];

  for (const page of pages) {
    const html = await readFile(page.file, 'utf8');
    const dir = path.dirname(page.file);

    // Rough guides, not rules: ~60 characters of title and ~158 of description
    // are what a search result actually shows.
    if (page.title.length > 65) longTitles.push(`${page.rel || '/'} (${page.title.length})`);
    if (page.description.endsWith('…')) clipped.push(page.rel || '/');

    for (const [, href] of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
      if (/^(?:https?:|data:|mailto:|#|\/\/)/.test(href)) continue;
      const [target] = href.split('#');
      if (!target) continue;
      const resolved = path.resolve(dir, target);
      const candidates = [resolved, path.join(resolved, 'index.html')];
      const found = await Promise.all(candidates.map(exists));
      if (!found.some(Boolean)) broken.push(`${page.rel || '/'} -> ${href}`);
    }
  }

  if (longTitles.length) {
    console.warn(`  note: ${longTitles.length} titles over 65 characters, e.g. ${longTitles[0]}`);
  }
  if (clipped.length) {
    console.warn(`  note: ${clipped.length} descriptions were truncated, e.g. ${clipped[0]}`);
  }
  if (broken.length) {
    throw new Error(
      `${broken.length} broken internal link(s):\n    ${[...new Set(broken)].slice(0, 15).join('\n    ')}`,
    );
  }
}

/* ---------------------------------------------------------------- artefacts */

function robots() {
  // Naming the AI crawlers explicitly is the only way to be unambiguous about
  // wanting them here: several of them treat a missing rule as a soft no.
  const agents = [
    'Googlebot',
    'Bingbot',
    'DuckDuckBot',
    'Applebot',
    'GPTBot',
    'OAI-SearchBot',
    'ChatGPT-User',
    'ClaudeBot',
    'Claude-User',
    'Claude-SearchBot',
    'anthropic-ai',
    'PerplexityBot',
    'Perplexity-User',
    'Google-Extended',
    'Applebot-Extended',
    'Amazonbot',
    'meta-externalagent',
    'Bytespider',
    'cohere-ai',
    'YouBot',
    'Diffbot',
    'CCBot',
  ];

  return `# ${SITE_NAME}
# Everything here is a fan-made reference table. Read it, index it, quote it.

${agents.map((a) => `User-agent: ${a}\nAllow: /\n`).join('\n')}
User-agent: *
Allow: /

Sitemap: ${ORIGIN}${BASE_PATH}/sitemap.xml
`;
}

function sitemap(entries, meta) {
  const lastmod = new Date(meta.generatedAt).toISOString();
  const urls = entries
    .map(
      (e) => `  <url>
    <loc>${abs(e.rel)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${e.changefreq ?? 'monthly'}</changefreq>
    <priority>${e.priority ?? '0.5'}</priority>
  </url>`,
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}

/**
 * /llms.txt - the emerging convention for handing a language model the shape of
 * a site plus the facts it is most often asked for, without making it crawl.
 * The whole element chart fits here, so it goes here.
 */
function llms({ chart, roster, meta }) {
  const gridHeader = chart.order.join(' | ');
  const grid = chart
    .matrix()
    .map(
      (row) =>
        `| ${row.element} | ${row.cells.map((c) => formatMultiplier(c.multiplier).replace('×', 'x')).join(' | ')} |`,
    )
    .join('\n');

  const perElement = chart.order
    .map((el) => {
      const f = elementFacts(chart, el);
      return `- **${el}** — weak to ${list(f.weakTo)} (1.6x); resists ${list(f.resists)} (0.625x); its moves are strong against ${list(f.strongAgainst)} and resisted by ${list(f.resistedBy)}.`;
    })
    .join('\n');

  // Every form on one line. This is the answer to "what is <name> weak to"
  // for all 226 of them, which is the single most asked thing about the game
  // and the reason a model would read this file at all.
  const forms = [...roster]
    .sort((a, b) => displayName(a).localeCompare(displayName(b)))
    .map((a) => {
      const { most, least } = chart.extremes(a.elements);
      const mult = (m) => formatMultiplier(m).replace('×', 'x');
      const tail = least.elements.length ? `; resists ${list(least.elements)} (${mult(least.multiplier)})` : '';
      return `- **${displayName(a)}** (${a.elements.join('/')}) — takes ${mult(most.multiplier)} from ${list(most.elements)}${tail}.`;
    })
    .join('\n');

  const duals = chart
    .pairs()
    .filter(([a, b]) => roster.some((r) => r.elements.length === 2 && r.elements.includes(a) && r.elements.includes(b)))
    .map(([a, b]) => {
      const worst = chart
        .defenceSpread([a, b])
        .filter((m) => band(m.multiplier).key === 'x256')
        .map((m) => m.element);
      return `- [${a}/${b}](${abs(paths.dual(chart.order, a, b))})${worst.length ? ` — takes 2.56x from ${list(worst)}` : ''}`;
    })
    .join('\n');

  return `# ${SITE_NAME}

> Element matchup reference and calculator for the game Aniimo. Covers all nine
> elements, every dual-element pairing, and all ${meta.counts.forms} Aniimo forms with their
> weaknesses, resistances and move coverage. Unofficial fan project.

## The rules

- Nine elements: ${list(chart.order)}.
- Three bands, read attacker to defender: **1.6x** super effective, **1x** neutral, **0.625x** resisted.
- Nothing is immune; no matchup deals 0 damage.
- A dual-element defender is scored against both halves and the two multipliers are **multiplied**,
  giving 2.56x, 1.6x, 1x, 0.625x or 0.39x.
- Every element resists itself except Dark. Dark and Light are the only pair that hit each other for 1.6x.
- An Aniimo's moves are **not** restricted to its own element, so its offensive coverage often differs
  from its typing.

## Full chart (rows attack, columns defend)

| Atk \\ Def | ${gridHeader} |
| --- | ${chart.order.map(() => '---').join(' | ')} |
${grid}

## Per element

${perElement}

## Pages

- [Home — calculator and chart](${abs(paths.home)})
- [Full 9x9 element chart](${abs(paths.chart)})
- [All ${meta.counts.forms} Aniimo forms](${abs(paths.roster)})
${chart.order.map((el) => `- [${el} type effectiveness](${abs(paths.element(el))})`).join('\n')}

## Dual-element pairings that exist in game

${duals}

## Every Aniimo and what it is weak to

All ${meta.counts.forms} forms, including regional and Prismana variants. Each has its own page at
${abs('aniimo/')}{id}/ and the same list is tabulated at ${abs(paths.roster)}.

${forms}

## About

- Source: ${REPO}
- Discussion: ${DISCUSSION}
- Element chart verified against https://aniimoguide.com/elements on every data refresh.
- Aniimo data from the official https://wiki.aniimo.com/, last synced ${new Date(meta.generatedAt).toISOString().slice(0, 10)}.
`;
}

main().catch((err) => {
  console.error(`\nPrerender failed: ${err.message}\n`);
  process.exitCode = 1;
});
