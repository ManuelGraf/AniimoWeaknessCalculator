import { useEffect, useMemo, useRef, useState } from 'react';

import { createChart } from './lib/chart';
import { displayName, loadDatabase, moveElements, type Database } from './lib/data';
import { useHashRoute, type Route } from './lib/useHashRoute';
import type { Aniimo, Element } from './types';

import { AniimoCombobox } from './components/AniimoCombobox';
import { DefencePanel } from './components/DefencePanel';
import { ElPlate, RoleChip } from './components/ElementBadge';
import { MatrixView } from './components/MatrixView';
import { OffencePanel } from './components/OffencePanel';

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

  // Remember what was being inspected so the chart tab is a detour, not a reset.
  const lastCalc = useRef<Extract<Route, { view: 'calc' }>>({ view: 'calc', kind: 'empty' });
  if (route.view === 'calc') lastCalc.current = route;

  const byId = useMemo(() => new Map(db.roster.map((a) => [a.id, a])), [db.roster]);

  // The hash is the single source of truth for what is being inspected.
  const selected: Aniimo | null =
    route.view === 'calc' && route.kind === 'aniimo' ? (byId.get(route.id) ?? null) : null;

  const elements: Element[] = useMemo(() => {
    if (selected) return selected.elements;
    if (route.view === 'calc' && route.kind === 'elements') {
      return chart.order.filter((e) => route.elements.includes(e.toLowerCase()));
    }
    return [];
  }, [selected, route, chart.order]);

  const setElements = (next: Element[]) =>
    navigate(next.length ? { view: 'calc', kind: 'elements', elements: next } : { view: 'calc', kind: 'empty' });

  const toggleElement = (el: Element) => {
    if (elements.includes(el)) setElements(elements.filter((e) => e !== el));
    else if (elements.length < 2) setElements([...elements, el]);
    else setElements([elements[1]!, el]); // replace the oldest of the two
  };

  const selectAniimo = (a: Aniimo | null) =>
    navigate(a ? { view: 'calc', kind: 'aniimo', id: a.id } : { view: 'calc', kind: 'empty' });

  return (
    <>
      <Header
        meta={db.meta}
        view={route.view}
        onView={(v) => navigate(v === 'chart' ? { view: 'chart' } : lastCalc.current)}
      />

      <main className="page page--narrow section">
        {route.view === 'chart' ? (
          <MatrixView chart={chart} />
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
                  <AniimoCombobox roster={db.roster} selected={selected} onSelect={selectAniimo} />
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

                {selected && <SelectionSummary aniimo={selected} />}
              </div>
            </section>

            {elements.length === 0 ? (
              <p className="empty">
                Pick an element, or search for an Aniimo, to see what hits it hardest.
              </p>
            ) : (
              <>
                <Panel
                  title="Taking damage"
                  subtitle={
                    selected
                      ? `What each element does to ${displayName(selected)}.`
                      : `What each element does to a ${elements.join(' / ')} defender.`
                  }
                >
                  <DefencePanel chart={chart} defenders={elements} />
                </Panel>

                {selected && (
                  <Panel
                    title="Dealing damage"
                    subtitle={`Scored from the ${moveElements(selected).length || 'no'} move element${
                      moveElements(selected).length === 1 ? '' : 's'
                    } ${displayName(selected)} actually has — not from its own element.`}
                  >
                    <OffencePanel chart={chart} aniimo={selected} />
                  </Panel>
                )}
              </>
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

function SelectionSummary({ aniimo }: { aniimo: Aniimo }) {
  const [imgFailed, setImgFailed] = useState(false);
  // Official stage render first, the round head as a stand-in if it is missing.
  const src = aniimo.image ?? aniimo.head;

  return (
    <div className="selection">
      {src && !imgFailed ? (
        <img
          className="selection__art"
          src={src}
          alt={aniimo.name}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setImgFailed(true)}
        />
      ) : (
        <span className="selection__art">{aniimo.name.slice(0, 2)}</span>
      )}

      <div className="selection__body">
        <div className="form-hero__meta">
          <h3 className="selection__name">{aniimo.name}</h3>
          {!aniimo.isBasic && <span className="muted">{aniimo.morphology}</span>}
          {aniimo.number && <span className="form-hero__no">No. {aniimo.number}</span>}
        </div>
        <div className="selection__tags">
          {aniimo.elements.map((el) => (
            <ElPlate key={el} element={el} size="sm" />
          ))}
          {aniimo.roles.map((r) => (
            <RoleChip key={r} role={r} />
          ))}
        </div>
      </div>

      {aniimo.stats && (
        <dl className="stats">
          {([['HP', aniimo.stats.hp], ['P.ATK', aniimo.stats.physicalAttack], ['M.ATK', aniimo.stats.magicAttack]] as const).map(
            ([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ),
          )}
        </dl>
      )}
    </div>
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
function Header({ meta, view, onView }: { meta: Database['meta']; view: 'calc' | 'chart'; onView: (v: 'calc' | 'chart') => void }) {
  const synced = new Date(meta.generatedAt);
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
        {(['calc', 'chart'] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => onView(v)}
            aria-current={view === v ? 'page' : undefined}
          >
            {v === 'calc' ? 'Calculator' : 'Full chart'}
          </button>
        ))}
      </div>

      {/* Only a prerendered page has siblings to link to. */}
      {isPrerendered() && (
        <nav className="nav" aria-label="Primary">
          <a href={`${up}aniimo/`}>Aniimo</a>
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
