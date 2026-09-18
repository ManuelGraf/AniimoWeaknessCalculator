import type { CSSProperties } from 'react';
import type { Element, ElementDef } from '../types';

/** Inline custom property consumed by the `.el-chip` rules in index.css. */
export const elVars = (def: ElementDef | undefined): CSSProperties =>
  ({ '--el': def?.text ?? '#98a2b6' }) as CSSProperties;

interface Props {
  element: Element;
  def: ElementDef | undefined;
  size?: 'sm' | 'md';
  active?: boolean;
  onClick?: () => void;
  disabled?: boolean;
}

export function ElementBadge({ element, def, size = 'sm', active, onClick, disabled }: Props) {
  const pad = size === 'sm' ? 'px-2.5 py-1 text-[11px]' : 'px-3.5 py-2 text-sm';
  const classes = `el-chip ${active ? 'el-chip-on' : ''} ${pad} uppercase tracking-wider`;

  if (!onClick) {
    return (
      <span className={classes} style={elVars(def)}>
        <Dot />
        {element}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={!!active}
      className={`${classes} cursor-pointer disabled:cursor-not-allowed disabled:opacity-35 hover:brightness-125`}
      style={elVars(def)}
    >
      <Dot />
      {element}
    </button>
  );
}

const Dot = () => (
  <span
    aria-hidden="true"
    className="size-1.5 rounded-full"
    style={{ background: 'currentColor', boxShadow: '0 0 6px currentColor' }}
  />
);
