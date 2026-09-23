/**
 * @vitest-environment happy-dom
 *
 * Smoke test for the wiring: real data in, rendered panels out. Deliberately
 * asserts on what a user sees rather than on internals.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import App from './App';

// Resolved from the project root: in a browser-like environment import.meta.url
// is not a file:// URL.
const file = (name: string) => readFileSync(resolve(process.cwd(), 'public/data', name), 'utf8');

beforeEach(() => {
  window.location.hash = '';
  delete window.__ROUTE__;
  delete window.__SITE_ROOT__;
  document.getElementById('prerender')?.remove();
  vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
    const name = String(input).split('/').pop()!;
    return new Response(file(name), { status: 200, headers: { 'content-type': 'application/json' } });
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** The calculator is up once its search box is. */
const ready = async () => {
  await waitFor(() => expect(screen.getByRole('combobox')).toBeTruthy());
};

/**
 * What landed in one band of the hero card's spread bar. The bar is drawn
 * aria-hidden - the same facts are given once in words beside it - so it is
 * read out of the DOM here rather than through a role query.
 */
const spreadBand = (label: string): string[] => {
  const band = [...document.querySelectorAll('.hero-spread__band')].find(
    (b) => b.querySelector('.tile__bandMult')!.textContent === label,
  );
  if (!band) throw new Error(`no ${label} band on the spread bar`);
  return [...band.querySelectorAll('.tile__bandEls .el-plate')].map((p) => p.getAttribute('data-el')!);
};

/**
 * A form's own page is up once its name is on it. It has no combobox: picking
 * an Aniimo leaves the calculator rather than holding a selection inside it.
 */
const detailReady = (name: string) => screen.findByRole('heading', { name });

describe('App', () => {
  test('loads the database and shows the roster size', async () => {
    render(<App />);
    await ready();
    expect(screen.getByRole('heading', { name: /Aniimo Weakness Calculator/i })).toBeTruthy();
    expect(document.body.textContent).toMatch(/\d+ forms/);
  });

  test('prompts before anything is selected', async () => {
    render(<App />);
    await ready();
    expect(screen.getByText(/to see what hits it hardest/i)).toBeTruthy();
  });

  test('picking an element shows the defensive spread', async () => {
    const user = userEvent.setup();
    render(<App />);
    await ready();

    await user.click(screen.getByRole('button', { name: /^Fire$/i }));

    expect(await screen.findByText('Taking damage')).toBeTruthy();
    // Fire is weak to Water and Earth, so both must appear in the 1.6x group.
    const weak = screen.getByRole('region', { name: /^1\.6×/ });
    expect(within(weak).getByText('Water')).toBeTruthy();
    expect(within(weak).getByText('Earth')).toBeTruthy();
    // ... and Fire resists itself, so it must not be in that group.
    expect(within(weak).queryByText('Fire')).toBeNull();
    expect(window.location.hash).toBe('#/defense/fire');
  });

  test('searching an Aniimo opens that form’s own page', async () => {
    const user = userEvent.setup();
    render(<App />);
    await ready();

    await user.type(screen.getByRole('combobox'), 'glacy');
    const list = await screen.findByRole('listbox');
    await user.click(within(list).getAllByRole('option')[0]!);

    await waitFor(() => expect(window.location.hash).toBe('#/aniimo/glacy'));
    await detailReady('Glacy');
    expect(screen.getByText('Moves')).toBeTruthy();
    // The crumb is the way back out, and the roster tab stays lit behind it.
    expect(screen.getByRole('link', { name: /All Aniimo/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Aniimo' }).getAttribute('aria-current')).toBe('page');
  });

  test('the move list scores against a two-element target', async () => {
    const user = userEvent.setup();
    window.location.hash = '#/aniimo/emberpup';
    render(<App />);
    await detailReady('Emberpup');

    const targets = await screen.findByRole('group', { name: /target elements/i });
    await user.click(within(targets).getByRole('button', { name: /Water/ }));
    await user.click(within(targets).getByRole('button', { name: /Ice/ }));

    // Both stay selected, and the list is now scored against the pair.
    expect(await screen.findByText(/^Moves vs Water \/ Ice/)).toBeTruthy();

    // Emberpup has Fire and Earth moves. Into Water/Ice both come out at
    // 0.625 (Water resists) x 1.6 (strong vs Ice) = 1x, so what separates them
    // is base power and the 1.25 bonus the Fire ones carry:
    //   Fire Kick   72 x 1.25 x 1 = 90
    //   Pebble Kick 40 x 1    x 1 = 40
    const best = screen.getByRole('region', { name: /best move versus Water and Ice/i });
    expect(within(best).getByText('Fire Kick')).toBeTruthy();
    expect(within(best).getByText('90')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /clear target/i }));
    expect(await screen.findByText(/^Attacking moves/)).toBeTruthy();
  });

  test('a third target element replaces the older one', async () => {
    const user = userEvent.setup();
    window.location.hash = '#/aniimo/emberpup';
    render(<App />);
    await detailReady('Emberpup');

    const targets = await screen.findByRole('group', { name: /target elements/i });
    await user.click(within(targets).getByRole('button', { name: /Water/ }));
    await user.click(within(targets).getByRole('button', { name: /Ice/ }));
    await user.click(within(targets).getByRole('button', { name: /Grass/ }));

    expect(await screen.findByText(/^Moves vs Ice \/ Grass/)).toBeTruthy();
  });

  test('a deep link opens the form it names', async () => {
    window.location.hash = '#/aniimo/emberpup';
    render(<App />);
    await detailReady('Emberpup');
    expect(screen.getByText('Moves')).toBeTruthy();
  });

  test('a deep link to a form that is not in the data says so', async () => {
    window.location.hash = '#/aniimo/not-an-aniimo';
    render(<App />);
    expect(await screen.findByText(/No Aniimo with that name/i)).toBeTruthy();
  });

  test('switching to the chart and back keeps the pairing', async () => {
    const user = userEvent.setup();
    window.location.hash = '#/defense/fire+water';
    render(<App />);
    await ready();

    await user.click(screen.getByRole('button', { name: 'Full chart' }));
    expect(await screen.findByRole('table')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Calculator' }));
    await waitFor(() => expect(window.location.hash).toBe('#/defense/fire+water'));
    expect(await screen.findByText('Taking damage')).toBeTruthy();
  });

  test('an Aniimo added by a future sync flows through with no code change', async () => {
    // Everything the UI shows is derived from public/data, so a new entry has
    // to appear in search, in the count, and at its own deep link on its own.
    const newcomer = {
      id: 'zzztest-basic',
      name: 'Zzztest',
      morphology: 'Basic Form',
      number: '999',
      isBasic: true,
      stage: 'Lumin',
      elements: ['Dark', 'Grass'],
      roles: ['dps'],
      description: 'A synthetic Aniimo used to prove the app is data-driven.',
      stats: null,
      habitats: [],
      image: 'https://example.invalid/a.png',
      head: 'https://example.invalid/h.png',
      animation: null,
      skills: [
        { name: 'Test Bolt', description: '', section: 'Combat', element: 'Lightning',
          power: 90, cost: 0, offensive: true, source: 'wiki' },
      ],
      sources: ['wiki'],
    };

    const roster = [...JSON.parse(file('aniimo.json')), newcomer];
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
      const name = String(input).split('/').pop()!;
      const body = name === 'aniimo.json' ? JSON.stringify(roster) : file(name);
      return new Response(body, { status: 200, headers: { 'content-type': 'application/json' } });
    });

    const user = userEvent.setup();
    render(<App />);
    await ready();

    // 1. Autocomplete finds it.
    await user.type(screen.getByRole('combobox'), 'zzztest');
    const list = await screen.findByRole('listbox');
    const option = within(list).getAllByRole('option')[0]!;
    expect(within(option).getByText('Zzztest')).toBeTruthy();

    // 2. Selecting it routes to its own page, which reads its new element pair.
    await user.click(option);
    await waitFor(() => expect(window.location.hash).toBe('#/aniimo/zzztest-basic'));
    await detailReady('Zzztest');

    // Dark/Grass takes 2.56x from Wind, which is 1.6 into each half.
    expect(spreadBand('2.56×')).toEqual(['wind']);

    // 3. Its move is scored like any other - listed, and named as its best.
    expect(screen.getAllByText('Test Bolt')).toHaveLength(2);
  });

  /**
   * The roster view is the app half of the /aniimo/ landing page: the same
   * tiles, the same two matchup lines, with filters on top.
   */
  describe('the Aniimo roster', () => {
    const tiles = () => document.querySelectorAll('a.tile');

    test('the toggle opens it and every form gets a tile', async () => {
      const user = userEvent.setup();
      render(<App />);
      await ready();

      await user.click(screen.getByRole('button', { name: 'Aniimo' }));
      await waitFor(() => expect(window.location.hash).toBe('#/aniimo'));

      const roster = JSON.parse(file('aniimo.json')) as Array<unknown>;
      await waitFor(() => expect(tiles()).toHaveLength(roster.length));
    });

    test('a tile carries the number, name, element and role', async () => {
      window.location.hash = '#/aniimo';
      render(<App />);
      await waitFor(() => expect(tiles().length).toBeGreaterThan(0));

      const tile = document.querySelector('a[href$="aniimo/emberpup/"]')!;
      expect(tile.textContent).toContain('No. 001');
      expect(tile.textContent).toContain('Emberpup');
      // The badges are glyphs, so what they mean is said in text beside them.
      expect(tile.textContent).toContain('Fire type, DPS role.');
      expect(tile.querySelector('.tile__els .el-plate')!.getAttribute('data-el')).toBe('fire');
      expect(tile.querySelector('.tile__role')!.getAttribute('data-role')).toBe('dps');
    });

    test('the spread bar draws all five bands, empty ones included', async () => {
      window.location.hash = '#/aniimo';
      render(<App />);
      await waitFor(() => expect(tiles().length).toBeGreaterThan(0));

      const tile = document.querySelector('a[href$="aniimo/emberpup/"]')!;
      const bands = [...tile.querySelectorAll('.tile__band')];
      // Always five, whatever lands in them - otherwise the columns would not
      // line up from one tile to the next.
      expect(bands.map((b) => b.querySelector('.tile__bandMult')!.textContent)).toEqual([
        '2.56×', '1.6×', '1×', '0.625×', '0.39×',
      ]);

      const column = (label: string) =>
        [...bands.find((b) => b.querySelector('.tile__bandMult')!.textContent === label)!
          .querySelectorAll('.tile__bandEls .el-plate')].map((p) => p.getAttribute('data-el'));

      // Emberpup is single-element Fire: weak to Water and Earth, resists
      // Fire, Grass and Ice, and nothing can reach 2.56x or 0.39x on a single.
      expect(column('1.6×')).toEqual(['water', 'earth']);
      expect(column('0.625×')).toEqual(['fire', 'grass', 'ice']);
      expect(column('2.56×')).toEqual([]);
      expect(column('0.39×')).toEqual([]);
    });

    test('the bar is a picture, so the same facts are given once in words', async () => {
      window.location.hash = '#/aniimo';
      render(<App />);
      await waitFor(() => expect(tiles().length).toBeGreaterThan(0));

      const tile = document.querySelector('a[href$="aniimo/glacy/"]')!;
      expect(tile.querySelector('.tile__spread')!.getAttribute('aria-hidden')).toBe('true');
      // Glacy is Water/Ice, so both ends are dual-element products.
      expect(tile.textContent).toContain('Weak to Grass at 1.6×.');
      expect(tile.textContent).toContain('Resists Water at 0.391×.');
    });

    test('filtering by two elements narrows to that exact pairing', async () => {
      const user = userEvent.setup();
      window.location.hash = '#/aniimo';
      render(<App />);
      await waitFor(() => expect(tiles().length).toBeGreaterThan(0));

      const picker = screen.getByRole('group', { name: /filter by element/i });
      await user.click(within(picker).getByRole('button', { name: 'Water' }));
      await user.click(within(picker).getByRole('button', { name: 'Ice' }));

      const roster = JSON.parse(file('aniimo.json')) as Array<{ elements: string[] }>;
      const expected = roster.filter(
        (a) => a.elements.includes('Water') && a.elements.includes('Ice'),
      ).length;

      expect(expected).toBeGreaterThan(0);
      await waitFor(() => expect(tiles()).toHaveLength(expected));
      expect(document.querySelector('a[href$="aniimo/glacy/"]')).toBeTruthy();
    });

    test('the name filter and the clear button', async () => {
      const user = userEvent.setup();
      window.location.hash = '#/aniimo';
      render(<App />);
      await waitFor(() => expect(tiles().length).toBeGreaterThan(0));
      const all = tiles().length;

      await user.type(screen.getByRole('searchbox', { name: /filter aniimo/i }), 'glacy');
      await waitFor(() => expect(tiles().length).toBeLessThan(all));
      expect(document.querySelector('a[href$="aniimo/glacy/"]')).toBeTruthy();

      await user.click(screen.getByRole('button', { name: /clear filters/i }));
      await waitFor(() => expect(tiles()).toHaveLength(all));
    });

    test('a plain click opens the form in the app rather than loading its page', async () => {
      const user = userEvent.setup();
      window.location.hash = '#/aniimo';
      render(<App />);
      await waitFor(() => expect(tiles().length).toBeGreaterThan(0));

      await user.click(document.querySelector('a[href$="aniimo/glacy/"]')!);

      await waitFor(() => expect(window.location.hash).toBe('#/aniimo/glacy'));
      await detailReady('Glacy');
      // The same five bands the tile carried, enlarged onto the hero card.
      expect(spreadBand('1.6×')).toEqual(['grass']);
      expect(spreadBand('0.39×')).toEqual(['water']);
    });

    test('tiles link to the form’s own prerendered page, resolved from the site root', async () => {
      window.__SITE_ROOT__ = '../';
      window.location.hash = '#/aniimo';
      render(<App />);
      await waitFor(() => expect(tiles().length).toBeGreaterThan(0));

      expect(document.querySelector('a.tile')!.getAttribute('href')).toMatch(/^\.\.\/aniimo\/.+\/$/);
    });
  });

  test('the chart view renders all nine rows', async () => {
    window.location.hash = '#/chart';
    render(<App />);
    await waitFor(() => expect(screen.getByRole('table')).toBeTruthy());
    const rows = within(screen.getByRole('table')).getAllByRole('row');
    expect(rows).toHaveLength(10); // header + nine elements
  });

  /**
   * The deployed pages are static HTML written by scripts/prerender.mjs. The
   * app mounts above that markup rather than replacing it, and clears only the
   * parts it genuinely duplicates. Getting that wrong has no visible symptom
   * until a crawler reads either a blank page or the same table twice.
   */
  describe('on a prerendered page', () => {
    const prerender = (route: unknown, root = '../../') => {
      const div = document.createElement('div');
      div.id = 'prerender';
      div.innerHTML = `
        <header data-app-owns>static header</header>
        <h1>Fire type effectiveness in Aniimo</h1>
        <section data-app-owns><h2>Damage taken by a Fire Aniimo</h2></section>
        <section id="static-faq"><h2>Common questions</h2></section>
        <footer id="static-footer">Where the numbers come from.</footer>`;
      document.body.append(div);
      window.__ROUTE__ = route as Window['__ROUTE__'];
      window.__SITE_ROOT__ = root;
    };

    test('opens the route the page stands for, with no hash', async () => {
      prerender({ view: 'aniimo', id: 'glacy' });
      render(<App />);

      await detailReady('Glacy');
      expect(window.location.hash).toBe('');
    });

    test('the roster page opens on the grid, not on an empty calculator', async () => {
      prerender({ view: 'roster' }, '../');
      render(<App />);
      await waitFor(() => expect(document.querySelectorAll('a.tile').length).toBeGreaterThan(0));

      // The static page brings its own headline, so the app does not add one.
      expect(screen.queryByText(/All \d+ Aniimo and their weaknesses/)).toBeNull();
      expect(window.location.hash).toBe('');
    });

    test('an element page opens its own spread', async () => {
      prerender({ view: 'calc', kind: 'elements', elements: ['fire'] });
      render(<App />);
      await ready();

      expect(await screen.findByText('Taking damage')).toBeTruthy();
      const weak = screen.getByRole('region', { name: /^1\.6×/ });
      expect(within(weak).getByText('Water')).toBeTruthy();
    });

    test('only the duplicated sections are cleared, and not before the app is ready', async () => {
      prerender({ view: 'chart' });
      render(<App />);
      // Everything is still up while the database is in flight, so a slow
      // connection never sees the page blank out.
      expect(document.querySelectorAll('[data-app-owns]')).toHaveLength(2);

      await waitFor(() => expect(document.querySelectorAll('[data-app-owns]')).toHaveLength(0));
      expect(await screen.findByRole('table')).toBeTruthy();

      // The reference content a crawler came for stays on the page.
      expect(document.getElementById('static-faq')).toBeTruthy();
      expect(document.getElementById('static-footer')).toBeTruthy();
      expect(screen.getByRole('heading', { level: 1, name: /Fire type effectiveness/ })).toBeTruthy();
    });

    test('the page keeps a single h1, and it is the static page subject', async () => {
      prerender({ view: 'calc', kind: 'elements', elements: ['fire'] });
      render(<App />);
      await ready();

      const h1s = screen.getAllByRole('heading', { level: 1 });
      expect(h1s).toHaveLength(1);
      expect(h1s[0]!.textContent).toMatch(/Fire type effectiveness/);
      // The site name steps down to a link home.
      expect(screen.getByRole('link', { name: /Aniimo Weakness Calculator/ }).getAttribute('href'))
        .toBe('../../');
    });

    test('the app does not add a second footer', async () => {
      prerender({ view: 'calc', kind: 'elements', elements: ['fire'] });
      render(<App />);
      await ready();
      expect(document.body.textContent?.match(/Where the numbers come from/g)).toHaveLength(1);
    });

    test('an explicit hash wins over the page it was opened from', async () => {
      prerender({ view: 'calc', kind: 'elements', elements: ['fire'] });
      window.location.hash = '#/aniimo/emberpup';
      render(<App />);

      await detailReady('Emberpup');
    });

    test('data is fetched from the site root, not the page directory', async () => {
      const seen: string[] = [];
      vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
        seen.push(String(input));
        return new Response(file(String(input).split('/').pop()!), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      });

      prerender({ view: 'calc', kind: 'elements', elements: ['fire'] });
      render(<App />);
      await ready();

      // happy-dom serves the document from the origin root, so two levels up
      // from a /element/fire/ page lands back at /data/.
      expect(seen.every((u) => new URL(u).pathname.startsWith('/data/'))).toBe(true);
    });

    test('off a prerendered page the app owns the h1 and the footer', async () => {
      render(<App />);
      await ready();

      const h1s = screen.getAllByRole('heading', { level: 1 });
      expect(h1s).toHaveLength(1);
      expect(h1s[0]!.textContent).toBe('Aniimo Weakness Calculator');
      expect(screen.getByText(/Where the numbers come from|Element chart from/)).toBeTruthy();
    });
  });
});
