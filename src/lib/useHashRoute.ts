import { useCallback, useEffect, useState } from 'react';

/**
 * State lives in the hash so a result can be linked to. GitHub Pages serves no
 * SPA fallback, so a path-based router would 404 on refresh; a hash never
 * reaches the server.
 *
 *   #/aniimo/glacy        a specific Aniimo (and its form)
 *   #/defense/water+ice   a bare element pairing
 *   #/chart               the full 9x9 chart
 */
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

export function useHashRoute(): [Route, (r: Route) => void] {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));

  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash));
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
