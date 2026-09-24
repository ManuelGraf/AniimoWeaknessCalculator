import { useState, type KeyboardEvent, type MouseEvent } from 'react';

import type { Chart } from '../lib/chart';
import { GRAPH_H, GRAPH_W, graphModel, labelRect, nodeLeft, nodeTop, relations } from '../lib/graph';
import type { Element } from '../types';
import { ElChip, Icon } from './ElementBadge';

const slug = (s: string) => s.toLowerCase();

/** The community chart the layout follows. Credited on the card; see GRAPH.md. */
const CREDIT_URL = 'https://www.reddit.com/user/88IllusionllI88/';

/**
 * The element chart as a picture: every 1.6x matchup as an arrow from attacker
 * to defender, with the resists drawn in for whichever element is active.
 *
 * One highlight, three ways in. Hovering with a mouse, focusing a node from
 * the keyboard and tapping one all land on the same `active` element; a tap or
 * click also pins it so it survives the pointer leaving. Escape or a click on
 * the empty background lets go.
 *
 * The nodes are real buttons laid over the SVG rather than shapes inside it,
 * so they focus, announce and take a tap target like any other button. The
 * SVG itself is aria-hidden: the readout beside it says the same thing in
 * words, and the matrix table below carries the whole chart for anyone who
 * cannot see the arrows.
 *
 * Mirrored as graphCard() in scripts/lib/graph.mjs for the prerendered pages;
 * scripts/lib/graph.test.tsx holds the two to the same markup.
 */
export function ElementGraph({ chart, onOpen }: { chart: Chart; onOpen: (el: Element) => void }) {
  const [pinned, setPinned] = useState<Element | null>(null);
  const [hovered, setHovered] = useState<Element | null>(null);
  const active = hovered ?? pinned;

  const clear = () => {
    setPinned(null);
    setHovered(null);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') clear();
  };

  // Only a click on the bare background clears; one on a node bubbles up
  // through here too, and that one is a pin.
  const onBackground = (e: MouseEvent) => {
    if (!(e.target as HTMLElement).closest('.graph__node')) setPinned(null);
  };

  return (
    <section className="card graph-card" onKeyDown={onKeyDown}>
      <div className="graph-card__head">
        <h2>How the elements beat each other</h2>
        <p className="muted">Every 1.6× matchup in the game, as arrows from attacker to defender.</p>
      </div>
      <div className="graph-card__body">
        <Graph
          chart={chart}
          active={active}
          pinned={pinned}
          onBackground={onBackground}
          onHover={setHovered}
          onPin={(el) => setPinned((p) => (p === el ? null : el))}
        />
        <Readout chart={chart} active={active} onOpen={onOpen} />
      </div>
      {/* Mirrored in graphCard() in scripts/lib/graph.mjs. */}
      <p className="note graph-card__credit">
        Layout after the element chart by{' '}
        <a href={CREDIT_URL} target="_blank" rel="noopener">
          u/88IllusionllI88
        </a>
        .
      </p>
    </section>
  );
}

function Graph({
  chart,
  active,
  pinned,
  onBackground,
  onHover,
  onPin,
}: {
  chart: Chart;
  active: Element | null;
  pinned: Element | null;
  onBackground: (e: MouseEvent) => void;
  onHover: (el: Element | null) => void;
  onPin: (el: Element) => void;
}) {
  const { nodes, edges } = graphModel(chart, active);

  return (
    <div className="graph" data-active={active ? slug(active) : undefined} onClick={onBackground}>
      <svg className="graph__svg" viewBox={`0 0 ${GRAPH_W} ${GRAPH_H}`} aria-hidden="true" focusable="false">
        <g className="graph__edges">
          {edges.map((e) => (
            <g
              key={`${e.kind}:${e.from}>${e.to}`}
              className="graph__edge"
              data-el={slug(e.from)}
              data-kind={e.kind}
              data-rel={e.rel ?? undefined}
            >
              <path className="graph__line" d={e.d} />
              <path className="graph__head" d={e.head} />
            </g>
          ))}
        </g>
        <g className="graph__labels">
          {/* Only the 1.6x edges are labelled: a dashed line already says
              0.625x, and nine more pills on the short edges round a node
              land on top of its neighbours. */}
          {edges
            .filter((e) => e.rel && e.kind === 'strong')
            .map((e) => {
              const r = labelRect(e);
              return (
                <g key={`${e.from}>${e.to}`} className="graph__label">
                  <rect x={r.x} y={r.y} width={r.width} height={r.height} rx={13} />
                  <text x={e.lx} y={e.ly}>
                    {e.label}
                  </text>
                </g>
              );
            })}
        </g>
      </svg>

      <div className="graph__nodes">
        {nodes.map((n) => (
          <button
            key={n.element}
            type="button"
            className="graph__node"
            data-el={slug(n.element)}
            data-rel={n.rel ?? undefined}
            aria-pressed={pinned === n.element}
            style={{ left: nodeLeft(n.x), top: nodeTop(n.y) }}
            // A touch "hover" is emulated on tap and never ends, so only a
            // real mouse previews; a tap goes straight to the pin below.
            onPointerEnter={(e) => e.pointerType === 'mouse' && onHover(n.element)}
            onPointerLeave={(e) => e.pointerType === 'mouse' && onHover(null)}
            // Likewise a click focuses the button in most browsers, and that
            // must not hold the highlight after the click unpins it.
            onFocus={(e) => e.currentTarget.matches(':focus-visible') && onHover(n.element)}
            onBlur={() => onHover(null)}
            onClick={() => onPin(n.element)}
          >
            {n.ring && <span className="graph__ring" aria-hidden="true" />}
            <span className="el-plate" data-el={slug(n.element)}>
              <Icon id={`el-${slug(n.element)}`} />
            </span>
            <span className="graph__name">{n.element}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** The key to the three marks. Mirrored as graphKey() in scripts/lib/graph.mjs. */
function GraphKey() {
  return (
    <ul className="graph-key">
      <li>
        <span className="graph-key__mark" data-kind="strong" aria-hidden="true" />
        Super effective, 1.6×
      </li>
      <li>
        <span className="graph-key__mark" data-kind="resist" aria-hidden="true" />
        Resisted, 0.625×
      </li>
      <li>
        <span className="graph-key__mark" data-kind="ring" aria-hidden="true" />
        Resists itself
      </li>
    </ul>
  );
}

/** What the active element does and takes, in words. Mirrored as readout() in scripts/lib/graph.mjs. */
function Readout({ chart, active, onOpen }: { chart: Chart; active: Element | null; onOpen: (el: Element) => void }) {
  if (!active) {
    return (
      <div className="graph-read" aria-live="polite">
        <p className="graph-read__title">Pick an element</p>
        <p className="muted">
          Each arrow points from an attacker to the element it hits for 1.6×. Pick one to see what it
          beats, what beats it, and what it shrugs off.
        </p>
        <GraphKey />
      </div>
    );
  }

  const r = relations(chart, active);
  const chips = (els: Element[]) => (
    <dd>
      {els.map((e) => (
        <ElChip key={e} element={e} />
      ))}
    </dd>
  );

  return (
    <div className="graph-read" aria-live="polite">
      <p className="graph-read__title">
        <ElChip element={active} />
      </p>
      <dl className="graph-read__list">
        <div>
          <dt>Hits for 1.6×</dt>
          {chips(r.strongAgainst)}
        </div>
        <div>
          <dt>Is resisted by</dt>
          {chips(r.resistedBy)}
        </div>
        <div>
          <dt>Weak to</dt>
          {chips(r.weakTo)}
        </div>
        <div>
          <dt>Resists</dt>
          {chips(r.resists)}
        </div>
      </dl>
      <p>
        <button type="button" className="btn btn--ghost" onClick={() => onOpen(active)}>
          Open {active} in the calculator
        </button>
      </p>
      <GraphKey />
    </div>
  );
}
