import { useCallback, useEffect, useState } from 'react';

/**
 * State lives in the hash so a result can be linked to. GitHub Pages serves no
 * SPA fallback, so a path-based router would 404 on refresh; a hash never
 * reaches the server.
 *
 *   #/aniimo/glacy        a specific Aniimo (and its form)
 *   #/defense/water+ice   a bare element pairing
 *   #/chart               the full 9x9 chart
 *
 * The prerendered pages (scripts/prerender.mjs) are the exception. They are
 * real files at real paths, so there is no hash to read; each one declares the
 * route it stands for in `window.__ROUTE__` and the app picks up from there. An
 * explicit hash still wins, so a link into a prerendered page keeps working.
 */
declare global {
  interface Window {
    /** The route a prerendered page stands for. Absent on the dev server. */
    __ROUTE__?: Route | null;
    /** Relative prefix from the current page back to the site root, e.g. `../../`. */
    __SITE_ROOT__?: string;
  }
}

export type Route =
  | { view: 'calc'; kind: 'aniimo'; id: string }
  | { view: 'calc'; kind: 'elements'; elements: string[] }
  | { view: 'calc'; kind: 'empty' }
  | { view: 'chart' };

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#\/?/, '').trim().toLowerCase();
  if (path === 'chart') return { view: 'chart' };

  const [head, rest] = [path.split('/')[0] ?? '', path.split('/')[1] ?? ''];
  if (head === 'aniimo' && rest) return { view: 'calc', kind: 'aniimo', id: rest };
  if (head === 'defense' && rest) {
    const elements = rest.split('+').filter(Boolean).slice(0, 2);
    if (elements.length) return { view: 'calc', kind: 'elements', elements };
  }
  return { view: 'calc', kind: 'empty' };
}

export function formatHash(route: Route): string {
  if (route.view === 'chart') return '#/chart';
  if (route.kind === 'aniimo') return `#/aniimo/${route.id}`;
  if (route.kind === 'elements') return `#/defense/${route.elements.join('+').toLowerCase()}`;
  return '#/';
}

/** The route the app should open on: an explicit hash, else the prerendered page's own. */
export function initialRoute(): Route {
  if (window.location.hash) return parseHash(window.location.hash);
  return window.__ROUTE__ ?? { view: 'calc', kind: 'empty' };
}

export function useHashRoute(): [Route, (r: Route) => void] {
  const [route, setRoute] = useState<Route>(initialRoute);

  useEffect(() => {
    // Going back past the first in-page navigation empties the hash. On a
    // prerendered page that should land on the page's own subject again, not
    // on a blank calculator, so the fallback is the same one used on load.
    const onChange = () => setRoute(initialRoute());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  const navigate = useCallback((next: Route) => {
    const hash = formatHash(next);
    if (hash === window.location.hash) setRoute(next);
    else window.location.hash = hash; // the hashchange listener applies it
  }, []);

  return [route, navigate];
}
