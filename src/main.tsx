import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

// The delivered design system first, then this site's extensions to it. Vite
// bundles the pair into one hashed stylesheet, and scripts/prerender.mjs
// copies that same <link> onto every generated page - so the static page and
// the running app are painted by literally the same file and cannot drift.
import './aniimo-dark.css';
import './aniimo-site.css';

import spriteMarkup from './aniimo-icons.svg?raw';

/**
 * Element and role glyphs. A prerendered page already carries the sprite in
 * its markup (scripts/lib/html.mjs inlines it), so this only fires on the dev
 * shell, where there is no prerender step to do it.
 */
if (!document.getElementById('aniimo-sprite')) {
  document.body.insertAdjacentHTML('afterbegin', spriteMarkup);
}

const root = document.getElementById('root');
if (!root) throw new Error('#root is missing from index.html');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
