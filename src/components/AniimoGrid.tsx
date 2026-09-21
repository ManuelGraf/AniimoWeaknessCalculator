/**
 * The whole roster as tiles: the artwork with its element and role badges
 * pinned over it, the number and name, and a five-column bar - one column per
 * damage band - saying which elements land where. Nothing behind a hover: the
 * point is to read a form's whole defensive profile while scanning.
 *
 * The same tile markup is written statically by aniimoTile() in
 * scripts/lib/pages.mjs for the /aniimo/ landing page, which this replaces on
 * boot. Both are painted by the `.tile` block in src/aniimo-site.css, so a
 * class renamed in one has to be renamed in the other.
 *
 * Every tile is a real <a> to that form's own prerendered page. A plain click
 * is intercepted and handled in-app, because the database is already loaded
 * and a page load would throw it away; a modified or middle click is left
 * alone so "open in new tab" still works.
 */
import { useMemo, useState } from 'react';

import { BANDS, formatMultiplier, verdict, type Chart, type Extreme } from '../lib/chart';
import { displayName, list } from '../lib/data';
import type { Aniimo, Element } from '../types';
import { ElPlate, Icon, ROLE_GLYPH, roleLabel } from './ElementBadge';

interface Props {
  chart: Chart;
  roster: Aniimo[];
  /** Where the site root sits relative to the current page, for tile hrefs. */
  siteRoot: string;
  onSelect: (a: Aniimo) => void;
}

/** Role keys in the order the filter offers them; anything else is appended. */
const ROLE_ORDER = ['dps', 'break', 'sup', 'heal', 'regen', 'energy'];

export function AniimoGrid({ chart, roster, siteRoot, onSelect }: Props) {
  const [query, setQuery] = useState('');
  const [elements, setElements] = useState<Element[]>([]);
  const [role, setRole] = useState<string | null>(null);

  // Sorted once. The dex number is the order players know the roster in, and
  // it keeps a form next to the base it belongs to.
  const ordered = useMemo(
    () => [...roster].sort((a, b) => (a.number ?? '').localeCompare(b.number ?? '') || a.name.localeCompare(b.name)),
    [roster],
  );

  const roles = useMemo(() => {
    const present = new Set(roster.flatMap((a) => a.roles));
    return [...ROLE_ORDER.filter((r) => present.has(r)), ...[...present].filter((r) => !ROLE_ORDER.includes(r))];
  }, [roster]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ordered.filter((a) => {
      if (q && !displayName(a).toLowerCase().includes(q) && !(a.number ?? '').includes(q)) return false;
      // Both selected elements have to be present, so picking two finds that
      // exact dual rather than everything that is either.
      if (!elements.every((el) => a.elements.includes(el))) return false;
      if (role && !a.roles.includes(role)) return false;
      return true;
    });
  }, [ordered, query, elements, role]);

  const toggleElement = (el: Element) => {
    if (elements.includes(el)) setElements(elements.filter((e) => e !== el));
    else if (elements.length < 2) setElements([...elements, el]);
    else setElements([elements[1]!, el]); // replace the oldest of the two
  };

  const filtered = query.trim() !== '' || elements.length > 0 || role !== null;

  return (
    <>
      <div className="filters">
        <div className="filters__row">
          <div className="field field--lg filters__search">
            <SearchIcon />
            <input
              type="search"
              value={query}
              aria-label="Filter Aniimo by name or number"
              placeholder="Filter by name or number…"
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <div className="filters__chips" role="group" aria-label="Filter by element">
            {chart.order.map((el) => (
              <button
                key={el}
                type="button"
                className="filters__el"
                data-el={el.toLowerCase()}
                aria-pressed={elements.includes(el)}
                title={el}
                onClick={() => toggleElement(el)}
              >
                <ElPlate element={el} size="xs" active={elements.includes(el)} />
                <span className="sr-only">{el}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="filters__row">
          <div className="filters__chips" role="group" aria-label="Filter by role">
            {roles.map((r) => (
              <button
                key={r}
                type="button"
                className="filters__role"
                aria-pressed={role === r}
                onClick={() => setRole(role === r ? null : r)}
              >
                {roleLabel(r)}
              </button>
            ))}
          </div>

          <p className="filters__count">
            {/* Only the count is live: a button announced on every keystroke
                is noise, and it is reachable by Tab either way. */}
            <span aria-live="polite">
              {shown.length === ordered.length
                ? `${ordered.length} forms`
                : `${shown.length} of ${ordered.length} forms`}
            </span>
            {filtered && (
              <>
                {' · '}
                <button
                  type="button"
                  className="linkish"
                  onClick={() => { setQuery(''); setElements([]); setRole(null); }}
                >
                  Clear filters
                </button>
              </>
            )}
          </p>
        </div>

        {elements.length === 2 && (
          <p className="note">
            Showing forms that are {elements.join(' and ')} at once. Pick a third to replace the older one.
          </p>
        )}
      </div>

      <TileLegend />

      {shown.length === 0 ? (
        <p className="empty">No Aniimo matches those filters.</p>
      ) : (
        <ul className="tile-grid">
          {shown.map((a) => (
            <li key={a.id}>
              <Tile chart={chart} aniimo={a} siteRoot={siteRoot} onSelect={onSelect} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/**
 * What the five columns on every tile mean, said once above the grid rather
 * than 226 times inside it. Mirrored by tileLegend() in scripts/lib/pages.mjs.
 */
function TileLegend() {
  return (
    <p className="tile-legend">
      <span>Each tile’s bar reads left to right, most damage taken to least:</span>
      {BANDS.map((b) => (
        <span key={b.key} data-verdict={verdict(b.mult)}>
          <b>{b.label}</b> {b.blurb.toLowerCase()}
        </span>
      ))}
    </p>
  );
}

function Tile({
  chart,
  aniimo,
  siteRoot,
  onSelect,
}: {
  chart: Chart;
  aniimo: Aniimo;
  siteRoot: string;
  onSelect: (a: Aniimo) => void;
}) {
  const bands = chart.spreadByBand(aniimo.elements);

  return (
    <a
      className="tile"
      data-el={aniimo.elements[0]?.toLowerCase()}
      href={`${siteRoot}aniimo/${aniimo.id}/`}
      onClick={(e) => {
        // Leave anything but a plain primary click to the browser, so the
        // static page is still one middle-click away.
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        onSelect(aniimo);
      }}
    >
      <span className="tile__figure">
        <Art aniimo={aniimo} />
        <span className="tile__els">
          {aniimo.elements.map((el) => (
            <ElPlate key={el} element={el} size="xs" />
          ))}
        </span>
        {aniimo.roles.map((r) => (
          <RoleBadge key={r} role={r} />
        ))}
        <span className="sr-only">
          {aniimo.elements.join('/')} type{aniimo.roles.length ? `, ${aniimo.roles.map(roleLabel).join(' and ')} role` : ''}.
        </span>
      </span>

      {aniimo.number && <span className="tile__no">No. {aniimo.number}</span>}
      <span className="tile__name">{displayName(aniimo)}</span>

      {/* The bar is a picture of the same numbers, so it is read out once, in
          words, rather than as five headings and nine unlabelled glyphs. */}
      <span className="sr-only">{spokenSpread(chart, aniimo.elements)}</span>

      <span className="tile__spread" aria-hidden="true">
        {bands.map(({ band: b, entries }) => (
          <span key={b.key} className="tile__band" data-verdict={verdict(b.mult)}>
            <span className="tile__bandMult">{b.label}</span>
            <span className="tile__bandEls">
              {entries.length ? (
                entries.map((e) => <ElPlate key={e.element} element={e.element} size="xxs" />)
              ) : (
                <span className="tile__bandNone">·</span>
              )}
            </span>
          </span>
        ))}
      </span>
    </a>
  );
}

/**
 * What the spread bar says, in a sentence. Mirrored by the same line in
 * aniimoTile() in scripts/lib/pages.mjs.
 */
function spokenSpread(chart: Chart, elements: Element[]): string {
  const { most, least } = chart.extremes(elements);
  const one = (e: Extreme) =>
    e.elements.length ? `${e.label} ${list(e.elements)} at ${formatMultiplier(e.multiplier)}.` : '';
  return `${one(most)} ${one(least)}`.trim();
}

/** The role glyph alone, sized to sit on the artwork. */
function RoleBadge({ role }: { role: string }) {
  const key = role.toLowerCase();
  const icon = ROLE_GLYPH[key];
  // `energy` is in the data with no glyph and no colour token in the design,
  // so it says its name rather than borrowing another role's icon.
  if (!icon) return <span className="tile__role tile__role--text">{roleLabel(role)}</span>;
  return (
    <span className="tile__role" data-role={icon} title={roleLabel(role)}>
      <Icon id={`role-${icon}`} />
    </span>
  );
}

function Art({ aniimo }: { aniimo: Aniimo }) {
  const [failed, setFailed] = useState(false);
  // The round head reads better at tile size than the full stage render.
  const src = aniimo.head ?? aniimo.image;

  if (!src || failed) return <span className="tile__art">{aniimo.name.slice(0, 2)}</span>;

  return (
    <img
      className="tile__art"
      src={src}
      alt=""
      width={64}
      height={64}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}

const SearchIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7">
    <circle cx="9" cy="9" r="6" />
    <path d="M13.5 13.5 18 18" strokeLinecap="round" />
  </svg>
);
