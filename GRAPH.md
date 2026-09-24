# Element relation graph — design note

Built. The chart page opens on it, above the matrix table, and every element page carries a static
copy with that element selected. This records why it looks the way it does, so the decisions do not
have to be re-made when someone wants to nudge it.

| | |
| --- | --- |
| Geometry | `src/lib/graph.ts`, mirrored in `scripts/lib/graph.mjs` |
| App | `src/components/ElementGraph.tsx` |
| Static pages | `graphCard()` in `scripts/lib/graph.mjs`, used by `chartPage()` and `elementPage()` |
| Styles | the "Element relation graph" section at the end of `src/aniimo-site.css` |
| Tests | `scripts/lib/graph.test.tsx` |

## No dependencies

Inline SVG for the edges and HTML buttons laid over it for the nodes. A graph library would add
100–300 KB to draw nine plates, and a force layout would produce a jittery blob instead of a
composed picture.

## Layout: fixed coordinates, taken from the community chart

The layout follows the community-made chart by
[u/88IllusionllI88](https://www.reddit.com/user/88IllusionllI88/), credited on the card itself
(`public/easy-element-chart-look-v0-mvp1v0pqs9rh1.webp`,
the updated version of the earlier `public/weaknessgraph.jpeg`): Light at the top, Dark and Wind
beneath it, a centre column of Lightning, Water, Earth and Fire, Grass and Ice on the wings. It is a
portrait box (600×800), which also suits a phone better than a landscape one.

The earlier image disagreed with `elements.json` on two edges (Dark → Fire instead of Dark →
Lightning, Earth → Lightning instead of Earth → Fire). The updated one matches all 19 strong edges.
`elements.json` stays the source of truth either way: the graph is generated from it, and the image
is only a layout reference.

**The strong graph is not planar.** A search over free node positions bottoms out at one crossing,
so none of the layouts is crossing-free. The community chart deals with this by running two arrows
straight through a node (Wind → Grass through Dark, Water → Fire through Earth). Here those two are
routed round the node instead (`ROUTES`), which costs one crossing each: Wind → Grass over Dark →
Lightning, and Water → Fire over Earth → Ice. The test pins that count at two.

Every other strong edge is straight, except Dark ↔ Light, the only pair that hit each other for
1.6×. Both of those bow to the left of travel, so they separate on their own.

## Interaction

At rest the graph shows the 19 strong edges only. Drawing all 27 resists as well would clutter it
beyond reading.

One highlight state (`active`), three inputs:

- a mouse hover previews
- keyboard focus previews (`:focus-visible` only, so a click's focus does not stick)
- a click or tap pins; a second click, Escape, or a click on the background unpins

Touch previews are ignored on purpose: an emulated touch hover never ends.

While an element is active, its in-edges and out-edges keep full opacity and everything else fades
to 12%. Its resists are drawn in as thin dashed curves. Each one picks the bend that clears the most
nodes, and elements that resist themselves get a dashed ring rather than a loop. Only the 1.6× edges
carry a label. The dashed stroke already means 0.625×, and nine more pills on the short edges
around a node would land on its neighbours.

The readout beside the graph states the same thing in words (hits for 1.6×, is resisted by, weak to,
resists), so the SVG itself is `aria-hidden`. The matrix table below it remains the full data view.

## Prerender

The graph is written twice, like the Aniimo tile: once as a React component, once as a template
string. The geometry is computed by a pure function, and that function is mirrored too, because the
scripts do not import from `src/`. The test holds both halves to identical geometry for every
element and identical markup at rest and with an element selected. The one intended difference is
that static nodes are links to the element pages and app nodes are toggle buttons.

- `/chart/`: the static copy is `data-app-owns` and the interactive one replaces it on boot.
- `/element/<el>/`: the static copy stays, drawn with that element active. Crawlers get nine
  internal links out of it.
