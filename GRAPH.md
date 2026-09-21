# Element relation graph — design note

Not built yet. This records the thinking behind an interactive graph view of the element chart, so
the decisions do not have to be re-made from scratch.

The prompt for it is `public/weaknessgraph.jpeg` — a community-made relation graph that got a good
reception. Note that the file is currently shipped (`dist/weaknessgraph.jpeg`, 64 KB) but referenced
from nowhere in `src/` or `scripts/`. Either it becomes the layout reference for this work or it
should be deleted.

## Verdict: worth doing, no dependencies

The data in `public/data/elements.json` is already a directed graph. Rendering it is nine circles,
nineteen arrows and one special case.

| | count |
| --- | --- |
| Nodes | 9 |
| `strongAgainst` edges (1.6×) | 19 |
| `resistedBy` edges (0.625×) | 27 |
| …of which self-loops | 8 — every element resists itself except Dark |
| Bidirectional 1.6× pairs | 1 — Dark ↔ Light |

That is inline SVG: `<path>` per edge, a `<marker>` arrowhead per element colour, a `<text>` label at
each edge midpoint. Ballpark 250 lines of TSX plus 70 lines of CSS, against a current bundle of
256 KB. A graph library (cytoscape, d3-force, vis) would add 100–300 KB to draw nine circles, and a
force layout would produce a jittery blob instead of the composed picture that made the reference
image worth copying.

Colours and icons already exist: the `[data-el]` triplets in `src/aniimo-dark.css` and the
`#el-<name>` symbols in `src/aniimo-icons.svg`.

## Layout: fixed coordinates, not computed

The reference image reads well because a human placed the nodes so that edges mostly avoid crossing.
Hard-code that as a `{element: [x, y]}` map in normalised units — nine literals, trivial to nudge —
rather than deriving positions at runtime.

Approximate positions read off the reference image:

```
            Light (.51,.08)
     Dark (.34,.29)    Wind (.68,.28)
Grass (.07,.54)  Fire (.35,.54)  Ice (.68,.54)  Lightning (.92,.54)
       Water (.33,.92)      Earth (.68,.92)
```

The obvious alternative — nine points on a circle, positions derived from `order` — is symmetric and
self-maintaining, but every edge becomes a chord through the middle and legibility drops sharply.

**Dark ↔ Light** is the one pair needing geometry beyond a straight line: two opposed arrows on the
same axis. Curve both as quadratic paths with mirrored control-point offsets, or draw a single line
with an arrowhead at each end. Everything else can be straight.

## Interaction

At rest: the 19 strong edges only.

**Resist edges are the trap.** Nineteen arrows on this layout is already close to the legibility
ceiling; drawing all 27 resists on top makes a hairball and destroys the exact quality that made the
reference image worth copying. Show them only for the currently active node, as thin dashed strokes.
Self-resists are better drawn as a ring around the node than as a loop.

**Hover alone is not enough** — no hover on touch, and a dead end for keyboard. Each node should be a
real `<button>` inside the SVG:

- hover **or** focus → highlight
- click → pin the selection
- Escape or background click → clear

While a node is active, its in-edges and out-edges keep full opacity and show their multiplier label
(`1.6×` / `0.625×`); everything else drops to roughly 12% opacity. One highlight path, three input
methods, no branching logic.

## Two non-obvious costs

**1. Prerender duplication.** `scripts/lib/pages.mjs` hand-writes the HTML for the React views, the
same way `scripts/lib/chart.mjs` mirrors `src/lib/chart.ts`. Putting the graph on a prerendered page
means writing the SVG twice. Three ways out, cheapest last:

- accept the duplication (it is the established pattern in this repo)
- put the geometry in one shared plain-JS module that both sides import
- declare the graph a client-only enhancement sitting next to the existing matrix table — the table
  already carries the SEO and accessibility weight, so the graph can be `aria-hidden` decoration and
  skip prerender entirely

**2. The reference image disagrees with our data.** Read at that resolution it appears to show an
arrow from Dark into Fire, and no Earth → Fire; neither matches `elements.json`. The dashed edges
(Wind–Dark, Grass–Water) encode something undocumented. `elements.json` is hand-verified against
aniimoguide.com and is the source of truth — generate from it, and treat the image purely as a
layout reference.

## Open question

Where it lives:

- **third tab** next to Calc / Chart — keeps each page short, costs a navigation step
- **on the chart page**, above the matrix table — graph as the at-a-glance view, table directly below
  as the precise one, no navigation; makes that page long

Undecided.
