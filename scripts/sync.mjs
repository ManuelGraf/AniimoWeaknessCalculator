#!/usr/bin/env node
// Rebuild public/data/aniimo.json from the live sources. Deterministic, no AI in the
// loop: it reads structured payloads, merges them, validates, and only then
// overwrites the committed database.
//
//   npm run sync                 official wiki + aniimoguide (default)
//   npm run sync -- --wiki-only  official wiki only
//   npm run sync -- --no-cache   ignore the on-disk HTTP cache
//   npm run sync -- --dry-run    report, but do not write anything
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { makeClient } from './lib/http.mjs';
import { scrapeWiki } from './lib/wiki.mjs';
import { fetchRoster, attachSkillElements } from './lib/guide.mjs';
import { mergeRosters, validate, formKey } from './lib/merge.mjs';
import { verifyChart } from './lib/chart.mjs';
import { resolveHeads } from './lib/images.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');
const DATA = path.join(PUBLIC, 'data');
const CACHE = path.join(ROOT, '.cache');

const argv = new Set(process.argv.slice(2));
const wikiOnly = argv.has('--wiki-only');
const dryRun = argv.has('--dry-run');
const useCache = !argv.has('--no-cache');

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

async function main() {
  const startedAt = Date.now();
  const client = makeClient({ cacheDir: useCache ? CACHE : null, concurrency: 6 });
  const chart = JSON.parse(await readFile(path.join(DATA, 'elements.json'), 'utf8'));

  console.log(`\nAniimo data sync  (${wikiOnly ? 'official wiki only' : 'official wiki + aniimoguide'})\n`);

  console.log('wiki.aniimo.com');
  const wikiForms = await scrapeWiki(client);
  console.log(`  -> ${plural(wikiForms.length, 'form')}, ` +
              `${plural(wikiForms.reduce((n, f) => n + f.skills.length, 0), 'skill')}`);

  // Head icons come from a derived URL, so confirm each resolves before it
  // reaches the database rather than shipping a broken image.
  const heads = await resolveHeads(wikiForms, { cacheDir: useCache ? CACHE : null });
  console.log(`  -> ${heads.found}/${heads.total} head icons on the official CDN\n`);

  let guideForms = [];
  if (!wikiOnly) {
    console.log('aniimoguide.com');
    guideForms = await fetchRoster(client);
    console.log(`  aniidex: ${plural(guideForms.length, 'form')}`);

    // The wiki already types every skill it knows, so only fetch detail pages
    // for the forms the wiki is missing.
    const covered = new Set(wikiForms.map((w) => formKey(w.name, w.morphology)));
    const gaps = guideForms.filter((g) => !covered.has(formKey(g.name, g.morphology)));
    console.log(`  ${plural(gaps.length, 'form')} not on the wiki -> reading their skill elements`);
    await attachSkillElements(client, gaps);
    console.log('');
  }

  const roster = mergeRosters(wikiForms, guideForms);
  const { errors, warnings } = validate(roster, chart);

  // Confirm our committed chart still matches what the sources publish.
  const chartCheck = await verifyChart(client, chart);
  if (chartCheck.ok) console.log(`chart: verified against ${chartCheck.source}`);
  else console.log(`chart: NOT verified (${chartCheck.reason})`);
  for (const d of chartCheck.differences ?? []) errors.push(`chart drift: ${d}`);

  const bySource = roster.reduce((acc, a) => {
    const k = a.sources.join('+');
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});

  const offensive = roster.reduce((n, a) => n + a.skills.filter((s) => s.offensive).length, 0);
  console.log(`\nroster: ${plural(roster.length, 'form')}  (${Object.entries(bySource).map(([k, v]) => `${k}: ${v}`).join(', ')})`);
  const totalSkills = roster.reduce((n, a) => n + a.skills.length, 0);
  console.log(`skills: ${totalSkills} total, ${offensive} element-tagged offensive`);

  if (warnings.length) {
    console.log(`\n${plural(warnings.length, 'warning')}:`);
    for (const w of warnings.slice(0, 12)) console.log(`  - ${w}`);
    if (warnings.length > 12) console.log(`  ... and ${warnings.length - 12} more`);
  }

  if (errors.length) {
    console.error(`\n${plural(errors.length, 'ERROR')} - refusing to overwrite the database:`);
    for (const e of errors.slice(0, 20)) console.error(`  - ${e}`);
    process.exitCode = 1;
    return;
  }

  if (dryRun) {
    console.log('\n--dry-run: nothing written.');
    return;
  }

  const meta = {
    generatedAt: new Date().toISOString(),
    sources: wikiOnly ? ['wiki.aniimo.com'] : ['wiki.aniimo.com', 'aniimoguide.com'],
    counts: {
      forms: roster.length,
      base: roster.filter((a) => a.isBasic).length,
      skills: roster.reduce((n, a) => n + a.skills.length, 0),
      offensiveSkills: offensive,
      bySource,
    },
    warnings: warnings.length,
  };

  await mkdir(DATA, { recursive: true });
  await writeFile(path.join(DATA, 'aniimo.json'), `${JSON.stringify(roster, null, 1)}\n`);
  await writeFile(path.join(DATA, 'meta.json'), `${JSON.stringify(meta, null, 2)}\n`);

  console.log(`\nwrote public/data/aniimo.json and public/data/meta.json ` +
              `in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
}

main().catch((err) => {
  console.error('\nsync failed:', err.message);
  process.exitCode = 1;
});
