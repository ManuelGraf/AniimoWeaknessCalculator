# Aniimo Weakness Calculator

Element matchup calculator for [Aniimo](https://aniimo.com). Pick an element pairing — or search any
Aniimo by name — and see what hits it hardest, plus what its own moves can hit back.

Static site: React + Vite, deployed to GitHub Pages. The Aniimo database is scraped ahead of time by
an `npm` script and committed, so the app has no backend.

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
```

Requires Node 20.19+ (Vite's floor).

## What it does

**Defence — "what hits this hard?"**
Choose one or two elements, or search an Aniimo, and every attacking element is grouped by what it
deals: 2.56×, 1.6×, 1×, 0.625×, 0.39×.

**Offence — "what can this hit?"**
Scored from the elements an Aniimo's *moves* actually have, not from its own element. That
distinction matters: Fire-type Emberpup carries an Earth move (Pebble Kick), and Water/Ice Glacy
carries a Light one (Glimmer Shot), so both cover more than their own typing suggests.

Pick **one or two** target elements and the moves are ranked by `power × multiplier` against that
exact defender. The two together are what make it useful — the best multiplier is often not the best
move. Hexxin into a Water/Ice defender:

| Move | Element | Multiplier | Effective |
| --- | --- | --- | --- |
| Annihilation Bomb | Dark | 0.625× | **103** |
| Shard Impact | Earth | 1× | 54 |
| Euphoric Sonic Blast | Grass | 1.6× | 48 |

The super-effective option comes last. Raw power outweighs the matchup here, which a coverage grid
alone will not tell you.

**Full chart** — the raw 9×9 grid, rows attack and columns defend.

State lives in the URL hash (`#/aniimo/glacy`, `#/defense/water+ice`, `#/chart`), so any result can be
linked. A hash is used rather than paths because GitHub Pages serves no SPA fallback.

## The element chart

Nine elements, three bands, read **attacker → defender**:

| Result | Multiplier |
| --- | --- |
| Super effective | 1.6× |
| Neutral | 1× |
| Resisted | 0.625× |

The chart is directional — Lightning deals 1.6× to Water, but Water deals 1× back. Dark and Light are
the only pair that hit each other for 1.6×. Every element resists itself except Dark.

### Dual elements

The game does not document how two-element Aniimo take damage.
[aniimoguide](https://aniimoguide.com/elements) states that both sides are read at once and the
multipliers multiply, with worked examples (Wind into Dark/Grass Hexxin is `1.6 × 1.6 = 2.56×`; Fire
into Water/Ice Glacy is `0.625 × 1.6 = 1×`). This app follows that rule, which yields five possible
results: 2.56, 1.6, 1, 0.625 and 0.390625. Both worked examples are pinned in the test suite.

If the game turns out to cap or average instead, `dualRule` in
[`public/data/elements.json`](public/data/elements.json) records the assumption in one place.

## Refreshing the data

```bash
npm run sync           # official wiki + aniimoguide  (default)
npm run sync:wiki      # official wiki only
npm run sync:check     # dry run, no cache, writes nothing
```

`sync` re-derives everything and **refuses to overwrite the database** if validation fails, so a
broken scrape cannot silently ship. It also re-checks the committed element chart against the live
source and fails on drift.

Output lands in `public/data/` and is committed:

| File | |
| --- | --- |
| `elements.json` | The element chart. Hand-maintained, verified on every sync. |
| `aniimo.json` | The roster: elements, roles, stats, skills. Generated. |
| `meta.json` | Sync timestamp, counts and per-source breakdown. Generated. |

[`sync-data.yml`](.github/workflows/sync-data.yml) runs this every Monday, commits anything that
changed, and then **calls the deploy workflow directly**. It has to call it: a push made with the
default `GITHUB_TOKEN` does not trigger other workflows, so the commit cannot set off the deploy by
itself.

Two things to know about the schedule:

- GitHub disables `schedule` triggers on a repository after **60 days without activity**. A refresh
  that finds changes commits, which counts — but a long quiet spell can switch it off. Re-enable it
  from the Actions tab.
- Cron is best-effort and often runs late under load. It is a refresh, not a deadline.

You can always run it by hand from the Actions tab (**Refresh Aniimo data → Run workflow**), which
also exposes the wiki-only option.

### Sources

**[wiki.aniimo.com](https://wiki.aniimo.com/)** — official. A Nuxt app that serves a `_payload.json`
next to every route, so the scraper reads structured data rather than parsing HTML. Critically, it
tags every combat skill with its element, which is what makes the offence panel possible.

**[aniimoguide.com](https://aniimoguide.com/aniidex)** — community. Tracks new Aniimo sooner and
carries base stats the wiki does not publish. Its whole Aniidex, including regional and Prismana
forms, is in one page payload.

The wiki wins on anything it knows; aniimoguide fills the gaps. At the time of writing that is 199
forms from both, 7 from the wiki alone and 20 from aniimoguide alone. The two were cross-checked
across every skill they share: **995 agreed and 0 contradicted** — the only differences were skills
aniimoguide leaves untagged, which the wiki supplies.

Skills that carry no element at all (movement, buffs, heals, and a few utility moves) are kept but
marked non-offensive, so they never count toward coverage.

### Artwork

Official art from the wiki's CDN is preferred, with aniimoguide as the fallback. Two traps here,
both handled in [`scripts/lib/images.mjs`](scripts/lib/images.mjs):

- The wiki's `illustrationImage` is an **`.mp4`** VFX loop, not a still. It is kept in its own
  `animation` field so it can never end up in an `<img>`. (Nothing renders it yet — it is there if
  you want an animated detail view.)
- Round head icons for the search list are **not** in the payload. They sit next to the stage render
  under the same id (`Wiki_Aniimo_1005101.png` → `Wiki_PetHead_1005101.png`), so the URL is derived —
  and therefore verified with a `HEAD` request before it is written, because 28 forms (mostly
  Prismana and weather variants) have no head of their own. Those fall back to aniimoguide.
  Results are cached, so repeat syncs cost nothing.

Currently 206/226 stage images and 180/226 head icons come from the official CDN; the rest from
aniimoguide. Every entry has both, and the test suite asserts they are still images.

## Tests

```bash
npm test
```

Three suites, no fixtures — they run against the real committed data:

- `src/lib/chart.test.ts` — matchup maths, including a 729-case check that dual-element order never
  changes the result, and aniimoguide's two published examples.
- `src/lib/data.test.ts` — database integrity. Every Aniimo has 1–2 known elements, every offensive
  skill has a valid element, and off-element moves survive the merge. This is what catches a bad scrape.
- `src/App.test.tsx` — renders the app against the real data: search, selection, deep links, chart.

## Deploying

[`deploy.yml`](.github/workflows/deploy.yml) builds and publishes `dist/` to Pages on every push to
`main`, after running the tests. Enable it once under **Settings → Pages → Source → GitHub Actions**.

`vite.config.ts` uses a relative `base`, so the build works from a Pages project sub-path without
naming the repository anywhere.

## Layout

```
src/
  lib/chart.ts        matchup maths (no React, no DOM)
  lib/data.ts         loading, search ranking
  lib/useHashRoute.ts URL state
  components/         combobox, defence, offence, chart
scripts/
  sync.mjs            orchestrates a refresh, validates, writes
  lib/wiki.mjs        official wiki  (Nuxt payloads)
  lib/guide.mjs       aniimoguide    (Next.js flight chunks)
  lib/devalue.mjs     rehydrates Nuxt's flattened payload format
  lib/merge.mjs       merge + validation rules
  lib/chart.mjs       verifies the committed chart against the live source
public/data/          the generated database
```

The scraper is plain Node with no dependencies and does not import anything from `src/`.

## Caveats

- Dual-element handling is an inference, not documented game behaviour. See above.
- 27 combat skills across ~10 Aniimo carry no element on either source and are excluded from
  coverage; `npm run sync` lists them as warnings.
- Artwork is hotlinked from the source CDNs rather than vendored, and falls back to a monogram if a
  request fails.
- Not affiliated with Aniimo or Pawprint Studio.
