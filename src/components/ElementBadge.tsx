/**
 * The element and role primitives.
 *
 * Nothing here takes a colour. An element carries `data-el` and a role carries
 * `data-role`; the stylesheet turns that attribute into the tint, the border,
 * the glow and the icon colour (src/aniimo-dark.css, sections 2 and 8). The
 * same markup shapes are emitted by scripts/lib/html.mjs for the prerendered
 * pages, so the static page and the app paint identically.
 */
import type { Element } from '../types';

const slug = (s: string) => s.toLowerCase();

/** A glyph from the sprite inlined at the top of <body>. */
export const Icon = ({ id }: { id: string }) => (
  <svg className="icon" aria-hidden="true">
    <use href={`#${id}`} />
  </svg>
);

type PlateSize = 'xxs' | 'xs' | 'sm' | 'md' | 'lg';

/** The square element plate. */
export function ElPlate({
  element,
  size = 'md',
  active,
}: {
  element: Element;
  size?: PlateSize;
  active?: boolean;
}) {
  return (
    <span
      className={`el-plate el-plate--${size}`}
      data-el={slug(element)}
      data-active={active ? 'true' : undefined}
    >
      <Icon id={`el-${slug(element)}`} />
    </span>
  );
}

/** The inline element pill: glyph plus name. */
export function ElChip({ element }: { element: Element }) {
  return (
    <span className="el-chip" data-el={slug(element)}>
      <Icon id={`el-${slug(element)}`} />
      {element}
    </span>
  );
}

/**
 * Role badge. The data calls the support role "sup" while the artwork calls it
 * "support", and "energy" appears in the data with no glyph and no colour
 * token in the design - it falls back to a plain tag rather than borrowing
 * another role's icon. Mirrored in scripts/lib/html.mjs.
 */
export const ROLE_GLYPH: Record<string, string> = {
  dps: 'dps',
  heal: 'heal',
  sup: 'support',
  break: 'break',
  regen: 'regen',
};

const ROLE_LABEL: Record<string, string> = {
  dps: 'DPS',
  heal: 'Heal',
  sup: 'Support',
  break: 'Break',
  regen: 'Regen',
  energy: 'Energy',
};

/** How a role is written for a reader. Mirrors ROLE_LABEL in scripts/lib/html.mjs. */
export const roleLabel = (role: string): string => ROLE_LABEL[slug(role)] ?? role;

export function RoleChip({ role }: { role: string }) {
  const key = slug(role);
  const label = roleLabel(role);
  const icon = ROLE_GLYPH[key];

  if (!icon) return <span className="tag">{label}</span>;

  return (
    <span className="role-chip" data-role={icon}>
      <span className="role-chip__mark">
        <Icon id={`role-${icon}`} />
      </span>
      {label}
    </span>
  );
}
