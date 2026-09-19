import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { Aniimo } from '../types';
import { displayName, searchRoster } from '../lib/data';
import { ElChip } from './ElementBadge';

interface Props {
  roster: Aniimo[];
  selected: Aniimo | null;
  onSelect: (a: Aniimo | null) => void;
}

/**
 * An ARIA 1.2 combobox with a listbox popup. Hand-rolled rather than pulled in,
 * because the behaviour needed here is small: filter, arrow through, commit.
 */
export function AniimoCombobox({ roster, selected, onSelect }: Props) {
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
    <div ref={rootRef} className="combo">
      <div className="field field--lg">
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
        />
      </div>

      {(selected || query) && (
        <button type="button" onClick={clear} aria-label="Clear selection" className="combo__clear">
          ×
        </button>
      )}

      {open && query && !matches.length && (
        <div className="combo__pop">
          <p className="combo__empty">No Aniimo matches “{query}”.</p>
        </div>
      )}

      {showList && (
        <div className="combo__pop">
          <ul id={listId} role="listbox" aria-label="Matching Aniimo" className="combo__list">
            {matches.map((a, i) => (
              <li
                key={a.id}
                id={optionId(i)}
                ref={i === active ? activeRef : undefined}
                role="option"
                aria-selected={i === active}
                onPointerEnter={() => setActive(i)}
                onPointerDown={(e) => { e.preventDefault(); commit(a); }}
                className="combo__option"
              >
                <Thumb aniimo={a} />
                <span className="combo__label">
                  <span className="combo__name">{a.name}</span>
                  <span className="combo__sub">
                    {a.isBasic ? (a.number ? `No. ${a.number}` : 'Base form') : a.morphology}
                  </span>
                </span>
                <span className="combo__els">
                  {a.elements.map((el) => (
                    <ElChip key={el} element={el} />
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Thumb({ aniimo }: { aniimo: Aniimo }) {
  const [failed, setFailed] = useState(false);
  const src = aniimo.head ?? aniimo.image;

  if (!src || failed) {
    return <span className="combo__thumb">{aniimo.name.slice(0, 2)}</span>;
  }
  return (
    <img
      className="combo__thumb"
      src={src}
      alt=""
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
