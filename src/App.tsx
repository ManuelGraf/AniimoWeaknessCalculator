import { useEffect, useMemo, useRef, useState } from 'react';

import { createChart } from './lib/chart';
import { displayName, loadDatabase, moveElements, type Database } from './lib/data';
import { useHashRoute, type Route } from './lib/useHashRoute';
import type { Aniimo, Element } from './types';

import { AniimoCombobox } from './components/AniimoCombobox';
import { DefencePanel } from './components/DefencePanel';
import { ElementBadge } from './components/ElementBadge';
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
    <div className="min-h-dvh">
      <Header meta={db.meta} view={route.view} onView={(v) => navigate(v === 'chart' ? { view: 'chart' } : lastCalc.current)} />

      <main className="mx-auto w-full max-w-5xl px-4 pb-16 sm:px-6">
        {route.view === 'chart' ? (
          <MatrixView chart={chart} />
        ) : (
          <>
            <section className="card p-4 sm:p-5">
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
                <div>
                  <label htmlFor="aniimo-search" className="mb-2 block text-[11px] font-semibold tracking-[0.14em] text-ink-400 uppercase">
                    Find an Aniimo
                  </label>
                  <AniimoCombobox roster={db.roster} chart={db.chart} selected={selected} onSelect={selectAniimo} />
                  <p className="mt-2 text-[11px] text-ink-400">
                    {db.meta.counts.forms} forms, including regional and Prismana variants.
                  </p>
                </div>

                <div>
                  <span className="mb-2 block text-[11px] font-semibold tracking-[0.14em] text-ink-400 uppercase">
                    …or pick up to two elements
                  </span>
                  <div className="flex flex-wrap gap-1.5" role="group" aria-label="Elements">
                    {chart.order.map((el) => (
                      <ElementBadge
                        key={el}
                        element={el}
                        def={chart.defs[el]}
                        active={elements.includes(el)}
                        onClick={() => toggleElement(el)}
                      />
                    ))}
                  </div>
                  {elements.length === 2 && (
                    <p className="mt-2 text-[11px] text-ink-400">
                      Reading both sides at once. Pick a third to replace the older one.
                    </p>
                  )}
                </div>
              </div>

              {selected && <SelectionSummary aniimo={selected} chart={chart} />}
            </section>

            {elements.length === 0 ? (
              <p className="mt-8 text-center text-sm text-ink-400">
                Pick an element, or search for an Aniimo, to see what hits it hardest.
              </p>
            ) : (
              <div className="mt-5 grid gap-5">
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
              </div>
            )}
          </>
        )}
      </main>

      {/* A prerendered page keeps its own footer, with the same attribution. */}
      {!isPrerendered() && <Footer meta={db.meta} />}
    </div>
  );
}

function Panel({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section className="card p-4 sm:p-5">
      <header className="mb-4">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-ink-300">{subtitle}</p>
      </header>
      {children}
    </section>
  );
}

function SelectionSummary({ aniimo, chart }: { aniimo: Aniimo; chart: ReturnType<typeof createChart> }) {
  const [imgFailed, setImgFailed] = useState(false);
  // Official stage render first, the round head as a stand-in if it is missing.
  const src = aniimo.image ?? aniimo.head;
  const tint = chart.defs[aniimo.elements[0]!]?.color ?? '#2a3140';

  return (
    <div className="mt-4 flex items-center gap-4 rounded-xl border border-white/6 bg-white/2 p-3">
      {src && !imgFailed ? (
        <img
          src={src}
          alt={aniimo.name}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setImgFailed(true)}
          className="size-20 flex-shrink-0 rounded-xl object-contain p-1 sm:size-24"
          style={{ background: `radial-gradient(circle at 50% 65%, ${tint}2e, transparent 70%)` }}
        />
      ) : (
        <span className="grid size-20 flex-shrink-0 place-items-center rounded-xl bg-ink-800 text-ink-400 sm:size-24">
          {aniimo.name.slice(0, 2)}
        </span>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <h3 className="text-base font-semibold">{aniimo.name}</h3>
          {!aniimo.isBasic && <span className="text-[11px] text-ink-400">{aniimo.morphology}</span>}
          {aniimo.number && <span className="font-mono text-[11px] text-ink-400">No. {aniimo.number}</span>}
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {aniimo.elements.map((el) => (
            <ElementBadge key={el} element={el} def={chart.defs[el]} />
          ))}
          {aniimo.roles.map((r) => (
            <span key={r} className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-ink-300 uppercase">
              {r}
            </span>
          ))}
        </div>
      </div>

      {aniimo.stats && (
        <dl className="hidden flex-shrink-0 grid-cols-3 gap-x-3 gap-y-0.5 text-right sm:grid">
          {([['HP', aniimo.stats.hp], ['P.ATK', aniimo.stats.physicalAttack], ['M.ATK', aniimo.stats.magicAttack]] as const).map(
            ([label, value]) => (
              <div key={label}>
                <dt className="text-[9px] tracking-wider text-ink-400 uppercase">{label}</dt>
                <dd className="font-mono text-sm">{value}</dd>
              </div>
            ),
          )}
        </dl>
      )}
    </div>
  );
}

function Header({ meta, view, onView }: { meta: Database['meta']; view: 'calc' | 'chart'; onView: (v: 'calc' | 'chart') => void }) {
  const synced = new Date(meta.generatedAt);
  return (
    <header className="sticky top-0 z-30 border-b border-white/6 bg-ink-950/80 backdrop-blur">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
        <span aria-hidden="true" className="grid size-9 flex-shrink-0 place-items-center rounded-xl bg-accent/15 text-lg">
          ⚡
        </span>
        <div className="min-w-0 flex-1">
          {/*
            On a prerendered page the heading belongs to that page's subject
            ("Fire type effectiveness in Aniimo"), so the site name steps down
            to a link home rather than competing as a second h1.
          */}
          {isPrerendered() ? (
            <a
              href={window.__SITE_ROOT__ ?? './'}
              className="text-[15px] leading-tight font-semibold hover:text-accent"
            >
              Aniimo Weakness Calculator
            </a>
          ) : (
            <h1 className="text-[15px] leading-tight font-semibold">Aniimo Weakness Calculator</h1>
          )}
          <p className="text-[11px] text-ink-400">
            {meta.counts.forms} forms · synced{' '}
            <time dateTime={meta.generatedAt}>{synced.toLocaleDateString()}</time>
          </p>
        </div>
        <nav className="flex gap-1 rounded-xl border border-white/8 bg-ink-850/60 p-1" aria-label="Views">
          {(['calc', 'chart'] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => onView(v)}
              aria-current={view === v ? 'page' : undefined}
              className={`cursor-pointer rounded-lg px-3 py-1.5 text-[13px] transition ${
                view === v ? 'bg-accent text-ink-950 font-semibold' : 'text-ink-300 hover:text-ink-100'
              }`}
            >
              {v === 'calc' ? 'Calculator' : 'Full chart'}
            </button>
          ))}
        </nav>
      </div>
    </header>
  );
}

function Footer({ meta }: { meta: Database['meta'] }) {
  return (
    <footer className="mx-auto w-full max-w-5xl px-4 pb-10 text-[11px] leading-relaxed text-ink-400 sm:px-6">
      <p>
        Element chart from{' '}
        <a className="text-ink-300 underline decoration-white/20 hover:text-accent" href="https://aniimoguide.com/elements" target="_blank" rel="noopener">
          aniimoguide.com
        </a>
        . Aniimo data from{' '}
        <a className="text-ink-300 underline decoration-white/20 hover:text-accent" href="https://wiki.aniimo.com/" target="_blank" rel="noopener">
          wiki.aniimo.com
        </a>{' '}
        (official){meta.sources.length > 1 && ' and aniimoguide.com'}. Refresh with{' '}
        <code className="rounded bg-white/6 px-1 py-0.5 font-mono">npm run sync</code>.
      </p>
      <p className="mt-1.5">
        Dual-element defenders multiply both matchups, so 1.6 × 1.6 = 2.56×. The game does not document this; it follows
        the rule and worked examples published on aniimoguide.
      </p>
    </footer>
  );
}

const Loading = () => (
  <div className="grid min-h-dvh place-items-center text-sm text-ink-400">Loading Aniimo data…</div>
);

const Fatal = ({ message }: { message: string }) => (
  <div className="grid min-h-dvh place-items-center px-6">
    <div className="card max-w-md p-6 text-center">
      <h1 className="text-base font-semibold">Could not load the database</h1>
      <p className="mt-2 text-sm text-ink-300">{message}</p>
    </div>
  </div>
);
