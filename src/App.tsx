import { useEffect, useMemo, useRef, useState } from 'react';

import { createChart } from './lib/chart';
import { loadDatabase, type Database } from './lib/data';
import { useHashRoute, type Route } from './lib/useHashRoute';
import type { Aniimo, Element } from './types';

import { AniimoCombobox } from './components/AniimoCombobox';
import { AniimoDetail } from './components/AniimoDetail';
import { AniimoGrid } from './components/AniimoGrid';
import { DefencePanel } from './components/DefencePanel';
import { ElPlate } from './components/ElementBadge';
import { MatrixView } from './components/MatrixView';

export default function App() {
  const [db, setDb] = useState<Database | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [route, navigate] = useHashRoute();

  useEffect(() => {
    loadDatabase().then(setDb, (e: Error) => setError(e.message));
  }, []);

  // A prerendered page (scripts/prerender.mjs) already answers the question in
  // plain HTML, and the app mounts above it rather than replacing it: the
  // headline, summary, questions and cross-links stay on the page for anyone
  // reading it, crawler or not. Only what the running app genuinely duplicates
  // is marked `data-app-owns`, and only once there is something to replace it
  // with, so the page never blanks mid-load.
  useEffect(() => {
    if (!db) return;
    for (const el of document.querySelectorAll('[data-app-owns]')) el.remove();
  }, [db]);

  if (error) return <Fatal message={error} />;
  if (!db) return isPrerendered() ? null : <Loading />;

  return <Ready db={db} route={route} navigate={navigate} />;
}

/** True on a page written by the prerenderer, which brings its own static copy. */
const isPrerendered = () => !!document.getElementById('prerender');

const siteRoot = () => window.__SITE_ROOT__ ?? './';

type Nav = ReturnType<typeof useHashRoute>[1];

function Ready({ db, route, navigate }: { db: Database; route: ReturnType<typeof useHashRoute>[0]; navigate: Nav }) {
  const chart = useMemo(() => createChart(db.chart), [db.chart]);

  // Remember the pairing being inspected, so the chart tab and a form's own
  // page are both detours rather than a reset.
  const lastCalc = useRef<Extract<Route, { view: 'calc' }>>({ view: 'calc', kind: 'empty' });
  if (route.view === 'calc') lastCalc.current = route;

  const byId = useMemo(() => new Map(db.roster.map((a) => [a.id, a])), [db.roster]);

  // The hash is the single source of truth for what is being inspected.
  const selected: Aniimo | null = route.view === 'aniimo' ? (byId.get(route.id) ?? null) : null;

  const elements: Element[] = useMemo(() => {
    if (route.view === 'calc' && route.kind === 'elements') {
      return chart.order.filter((e) => route.elements.includes(e.toLowerCase()));
    }
    return [];
  }, [route, chart.order]);

  const setElements = (next: Element[]) =>
    navigate(next.length ? { view: 'calc', kind: 'elements', elements: next } : { view: 'calc', kind: 'empty' });

  const toggleElement = (el: Element) => {
    if (elements.includes(el)) setElements(elements.filter((e) => e !== el));
    else if (elements.length < 2) setElements([...elements, el]);
    else setElements([elements[1]!, el]); // replace the oldest of the two
  };

  const selectAniimo = (a: Aniimo | null) =>
    navigate(a ? { view: 'aniimo', id: a.id } : { view: 'calc', kind: 'empty' });

  return (
    <>
      <Header
        meta={db.meta}
        view={route.view}
        onView={(v) =>
          navigate(v === 'chart' ? { view: 'chart' } : v === 'roster' ? { view: 'roster' } : lastCalc.current)
        }
      />

      <main className="page page--narrow section">
        {route.view === 'chart' ? (
          <MatrixView chart={chart} />
        ) : route.view === 'aniimo' ? (
          // Keyed by id so opening another form starts its target picker clean
          // rather than carrying the last one's over.
          selected ? (
            <AniimoDetail
              key={selected.id}
              chart={chart}
              aniimo={selected}
              siteRoot={siteRoot()}
              onRoster={() => navigate({ view: 'roster' })}
            />
          ) : (
            <p className="empty">
              No Aniimo with that name.{' '}
              <button type="button" className="linkish" onClick={() => navigate({ view: 'roster' })}>
                Browse all {db.meta.counts.forms} forms
              </button>
              .
            </p>
          )
        ) : route.view === 'roster' ? (
          <div className="stack">
            {/*
              The static /aniimo/ page keeps its own headline and lede, so this
              only adds one when the app is running on its own.
            */}
            {!isPrerendered() && (
              <div>
                <h2 className="roster-title">All {db.meta.counts.forms} Aniimo and their weaknesses</h2>
                <p className="muted">
                  Every form in the game, each with its whole defensive spread on it. Open one to
                  score its own moves.
                </p>
              </div>
            )}
            <AniimoGrid
              chart={chart}
              roster={db.roster}
              siteRoot={siteRoot()}
              onSelect={(a) => selectAniimo(a)}
            />
          </div>
        ) : (
          <div className="stack">
            <section className="card">
              {/*
                Search on its own row and the picker full width beneath it.
                The picker is nine across by design; squeezed into half a card
                its labels collide well before the viewport gets narrow.
              */}
              <div className="card__body stack">
                <div>
                  <label htmlFor="aniimo-search" className="eyebrow">
                    Find an Aniimo
                  </label>
                  {/*
                    Picking one leaves the calculator for that form's own page,
                    so nothing stays selected here - the search is a way in, not
                    a second place to hold a selection.
                  */}
                  <AniimoCombobox roster={db.roster} selected={null} onSelect={selectAniimo} />
                  <p className="note">
                    {db.meta.counts.forms} forms, including regional and Prismana variants.
                  </p>
                </div>

                <div>
                  <span className="eyebrow">…or pick up to two elements</span>
                  <div className="picker" role="group" aria-label="Elements">
                    {chart.order.map((el) => (
                      <button
                        key={el}
                        type="button"
                        className="picker__btn"
                        data-el={el.toLowerCase()}
                        aria-pressed={elements.includes(el)}
                        onClick={() => toggleElement(el)}
                      >
                        <ElPlate element={el} size="lg" />
                        {/* Hidden on phones, where the bar is one row of glyphs -
                            visually-hidden rather than removed, so the button
                            keeps "Fire" as its accessible name. */}
                        <span className="picker__name">{el}</span>
                      </button>
                    ))}
                  </div>
                  {elements.length === 2 && (
                    <p className="note">
                      Reading both sides at once. Pick a third to replace the older one.
                    </p>
                  )}
                </div>

              </div>
            </section>

            {elements.length === 0 ? (
              <p className="empty">
                Pick an element, or search for an Aniimo, to see what hits it hardest.
              </p>
            ) : (
              <Panel
                title="Taking damage"
                subtitle={`What each element does to a ${elements.join(' / ')} defender.`}
              >
                <DefencePanel chart={chart} defenders={elements} />
              </Panel>
            )}
          </div>
        )}
      </main>

      {/* A prerendered page keeps its own footer, with the same attribution. */}
      {!isPrerendered() && <Footer meta={db.meta} />}
    </>
  );
}

function Panel({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section className="card">
      <div className="card__head">
        <div>
          <h2>{title}</h2>
          <p className="muted">{subtitle}</p>
        </div>
      </div>
      <div className="card__body">{children}</div>
    </section>
  );
}

/**
 * The glass header.
 *
 * Structurally identical to header() in scripts/lib/html.mjs, because on a
 * prerendered page this one replaces that one on boot and any difference shows
 * up as a flicker. The static version carries plain nav links; this one swaps
 * the first of them for a view toggle, since the app can change view in place.
 *
 * "Aniimo" is written in mixed case and uppercased by CSS: the accessible name
 * and anything copied off the page stay readable.
 */
type View = Route['view'];

/** The three the toggle offers; `aniimo` is a page you arrive at, not a tab. */
type Tab = 'calc' | 'roster' | 'chart';

const VIEW_LABEL: Record<Tab, string> = { calc: 'Calculator', roster: 'Aniimo', chart: 'Full chart' };

/**
 * Which button is lit. One form's own page belongs to the roster it was opened
 * from, so "Aniimo" stays current there rather than the toggle going blank.
 */
const currentTab = (view: View): Tab => (view === 'aniimo' ? 'roster' : view);

function Header({ meta, view, onView }: { meta: Database['meta']; view: View; onView: (v: Tab) => void }) {
  const synced = new Date(meta.generatedAt);
  const current = currentTab(view);
  const up = siteRoot();

  const brand = (
    <>
      <span className="brand__mark">
        <img src={`${up}logo.svg`} alt="" width={23} height={23} />
      </span>
      {/*
        The explicit space is a flex child that flex layout ignores, but it
        keeps the accessible name and anything copied off the page reading
        "Aniimo Weakness Calculator" rather than running the two lines together.
      */}
      <span className="brand__text">
        <span className="brand__name">Aniimo</span>{' '}
        <span className="brand__sub">Weakness Calculator</span>
      </span>
    </>
  );

  return (
    <header className="site-header">
      {/*
        On a prerendered page the heading belongs to that page's subject
        ("Fire type effectiveness in Aniimo"), so the site name steps down
        to a link home rather than competing as a second h1.
      */}
      {isPrerendered() ? (
        <a className="brand" href={up}>
          {brand}
        </a>
      ) : (
        <h1 className="brand">{brand}</h1>
      )}

      <div className="view-toggle" role="group" aria-label="Views">
        {(['calc', 'roster', 'chart'] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => onView(v)}
            aria-current={current === v ? 'page' : undefined}
          >
            {VIEW_LABEL[v]}
          </button>
        ))}
      </div>

      {/* Only a prerendered page has siblings to link to. The roster is in the
          toggle above, so all that is left here is the on-page FAQ anchor. */}
      {isPrerendered() && (
        <nav className="nav" aria-label="Primary">
          <a href={`${up}#faq`}>FAQ</a>
        </nav>
      )}

      <div className="header-spacer" />

      <span className="status-chip">
        {meta.counts.forms} forms ·{' '}
        <time dateTime={meta.generatedAt}>
          {synced.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })}
        </time>
      </span>
    </header>
  );
}

function Footer({ meta }: { meta: Database['meta'] }) {
  return (
    <footer className="site-footer">
      <div className="page">
        <div className="foot-note">
          <p>
            Element chart from{' '}
            <a href="https://aniimoguide.com/elements" target="_blank" rel="noopener">
              aniimoguide.com
            </a>
            . Aniimo data from{' '}
            <a href="https://wiki.aniimo.com/" target="_blank" rel="noopener">
              wiki.aniimo.com
            </a>{' '}
            (official){meta.sources.length > 1 && ' and aniimoguide.com'}. Refresh with{' '}
            <code>npm run sync</code>.
          </p>
          <p>
            Dual-element defenders multiply both matchups, so 1.6 × 1.6 = 2.56×. The game does not
            document this; it follows the rule and worked examples published on aniimoguide.
          </p>
          <p>An unofficial fan project, not affiliated with or endorsed by the makers of Aniimo.</p>
        </div>
      </div>
    </footer>
  );
}

const Loading = () => <p className="empty">Loading Aniimo data…</p>;

const Fatal = ({ message }: { message: string }) => (
  <main className="page page--narrow section">
    <div className="card card--flow">
      <h1>Could not load the database</h1>
      <p className="muted">{message}</p>
    </div>
  </main>
);
