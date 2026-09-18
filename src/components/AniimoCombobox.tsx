import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { Aniimo, ChartData } from '../types';
import { displayName, searchRoster } from '../lib/data';
import { elVars } from './ElementBadge';

interface Props {
  roster: Aniimo[];
  chart: ChartData;
  selected: Aniimo | null;
  onSelect: (a: Aniimo | null) => void;
}

/**
 * An ARIA 1.2 combobox with a listbox popup. Hand-rolled rather than pulled in,
 * because the behaviour needed here is small: filter, arrow through, commit.
 */
export function AniimoCombobox({ roster, chart, selected, onSelect }: Props) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const listId = useId();
  const optionId = (i: number) => `${listId}-opt-${i}`;
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeRef = useRef<HTMLLIElement>(null);

  const matches = useMemo(() => searchRoster(roster, query), [roster, query]);

  // Close when focus or a click leaves the widget.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  // Keep the highlighted row in view while arrowing.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const commit = (a: Aniimo | undefined) => {
    if (!a) return;
    onSelect(a);
    setQuery('');
    setOpen(false);
    inputRef.current?.blur();
  };

  const clear = () => {
    onSelect(null);
    setQuery('');
    setOpen(false);
    inputRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        setActive(0);
        return;
      }
      if (!matches.length) return;
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((i) => (i + step + matches.length) % matches.length);
      return;
    }
    if (e.key === 'Home' && open) { e.preventDefault(); setActive(0); return; }
    if (e.key === 'End' && open) { e.preventDefault(); setActive(matches.length - 1); return; }
    if (e.key === 'Enter' && open) { e.preventDefault(); commit(matches[active]); return; }
    if (e.key === 'Escape') {
      if (open) { setOpen(false); return; }
      if (query) { setQuery(''); return; }
      if (selected) clear();
    }
  };

  const showList = open && matches.length > 0;

  return (
    <div ref={rootRef} className="relative">
      <div className="relative flex items-center">
        <SearchIcon />
        <input
          ref={inputRef}
          id="aniimo-search"
          type="text"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList ? optionId(active) : undefined}
          autoComplete="off"
          spellCheck={false}
          value={query}
          placeholder={selected ? displayName(selected) : 'Glacy, Hexxin, Magmarex…'}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); setActive(0); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className="w-full rounded-xl border border-white/10 bg-ink-850/80 py-3 pr-10 pl-10
                     text-[15px] placeholder:text-ink-400 focus:border-accent/50 focus:outline-none"
        />
        {(selected || query) && (
          <button
            type="button"
            onClick={clear}
            aria-label="Clear selection"
            className="absolute right-2 grid size-7 place-items-center rounded-lg text-ink-300
                       hover:bg-white/10 hover:text-ink-100"
          >
            ×
          </button>
        )}
      </div>

      {open && query && !matches.length && (
        <p className="absolute z-20 mt-2 w-full rounded-xl border border-white/10 bg-ink-850 px-4 py-3 text-sm text-ink-300">
          No Aniimo matches “{query}”.
        </p>
      )}

      {showList && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Matching Aniimo"
          className="scroll-slim absolute z-20 mt-2 max-h-96 w-full overflow-y-auto rounded-xl
                     border border-white/10 bg-ink-850/95 p-1 shadow-2xl backdrop-blur"
        >
          {matches.map((a, i) => (
            <li
              key={a.id}
              id={optionId(i)}
              ref={i === active ? activeRef : undefined}
              role="option"
              aria-selected={i === active}
              onPointerEnter={() => setActive(i)}
              onPointerDown={(e) => { e.preventDefault(); commit(a); }}
              className={`flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 ${
                i === active ? 'bg-white/10' : ''
              }`}
            >
              <Thumb aniimo={a} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{a.name}</span>
                <span className="block truncate text-[11px] text-ink-400">
                  {a.isBasic ? (a.number ? `No. ${a.number}` : 'Base form') : a.morphology}
                </span>
              </span>
              <span className="flex flex-shrink-0 gap-1">
                {a.elements.map((el) => (
                  <span
                    key={el}
                    className="el-chip px-2 py-0.5 text-[10px] uppercase"
                    style={elVars(chart.elements[el])}
                  >
                    {el}
                  </span>
                ))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Thumb({ aniimo }: { aniimo: Aniimo }) {
  const [failed, setFailed] = useState(false);
  const src = aniimo.head ?? aniimo.image;

  if (!src || failed) {
    return (
      <span className="grid size-8 flex-shrink-0 place-items-center rounded-full bg-ink-700 text-[11px] text-ink-300">
        {aniimo.name.slice(0, 2)}
      </span>
    );
  }
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="size-8 flex-shrink-0 rounded-full bg-ink-800 object-contain"
    />
  );
}

const SearchIcon = () => (
  <svg
    aria-hidden="true"
    viewBox="0 0 20 20"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    className="absolute left-3 size-4 text-ink-400"
  >
    <circle cx="9" cy="9" r="6" />
    <path d="M13.5 13.5 18 18" strokeLinecap="round" />
  </svg>
);
