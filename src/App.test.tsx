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

const ready = async () => {
  await waitFor(() => expect(screen.getByRole('combobox')).toBeTruthy());
};

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

  test('searching an Aniimo selects it and shows both panels', async () => {
    const user = userEvent.setup();
    render(<App />);
    await ready();

    await user.type(screen.getByRole('combobox'), 'glacy');
    const list = await screen.findByRole('listbox');
    await user.click(within(list).getAllByRole('option')[0]!);

    await waitFor(() => expect(window.location.hash).toBe('#/aniimo/glacy'));
    expect(await screen.findByText('Taking damage')).toBeTruthy();
    expect(await screen.findByText('Dealing damage')).toBeTruthy();
    // Glacy is Water/Ice - the dual note only renders for two-element defenders.
    expect(screen.getByText(/Both element sides are applied/i)).toBeTruthy();
  });

  test('the offence panel scores moves against a two-element target', async () => {
    const user = userEvent.setup();
    window.location.hash = '#/aniimo/emberpup';
    render(<App />);
    await ready();

    const targets = await screen.findByRole('group', { name: /target elements/i });
    await user.click(within(targets).getByRole('button', { name: /Water/ }));
    await user.click(within(targets).getByRole('button', { name: /Ice/ }));

    // Both stay selected, and the move list is now scored against the pair.
    expect(await screen.findByText('Moves vs Water / Ice')).toBeTruthy();

    // Emberpup has Fire and Earth moves. Into Water/Ice:
    //   Fire  = 0.625 (Water resists) x 1.6  (strong vs Ice) = 1x
    //   Earth = 0.625 (Water resists) x 1.6  (strong vs Ice) = 1x
    // so the best it can manage is 1x, not a super-effective hit.
    const summary = screen.getByRole('region', { name: /best result versus Water and Ice/i });
    expect(within(summary).getByText('1×')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /clear target/i }));
    expect(await screen.findByText(/^Attacking moves/)).toBeTruthy();
  });

  test('a third target element replaces the older one', async () => {
    const user = userEvent.setup();
    window.location.hash = '#/aniimo/emberpup';
    render(<App />);
    await ready();

    const targets = await screen.findByRole('group', { name: /target elements/i });
    await user.click(within(targets).getByRole('button', { name: /Water/ }));
    await user.click(within(targets).getByRole('button', { name: /Ice/ }));
    await user.click(within(targets).getByRole('button', { name: /Grass/ }));

    expect(await screen.findByText('Moves vs Ice / Grass')).toBeTruthy();
  });

  test('a deep link restores the selection', async () => {
    window.location.hash = '#/aniimo/emberpup';
    render(<App />);
    await ready();
    expect(await screen.findByRole('heading', { name: 'Emberpup' })).toBeTruthy();
    expect(await screen.findByText('Dealing damage')).toBeTruthy();
  });

  test('switching to the chart and back keeps the selection', async () => {
    const user = userEvent.setup();
    window.location.hash = '#/aniimo/glacy';
    render(<App />);
    await ready();

    await user.click(screen.getByRole('button', { name: 'Full chart' }));
    expect(await screen.findByRole('table')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Calculator' }));
    await waitFor(() => expect(window.location.hash).toBe('#/aniimo/glacy'));
    expect(await screen.findByRole('heading', { name: 'Glacy' })).toBeTruthy();
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

    // 2. Selecting it routes, and both panels score its new element pair.
    await user.click(option);
    await waitFor(() => expect(window.location.hash).toBe('#/aniimo/zzztest-basic'));
    expect(await screen.findByText('Dealing damage')).toBeTruthy();

    // Dark/Grass takes 2.56x from Wind, which is 1.6 into each half.
    const crit = screen.getByRole('region', { name: /^2\.56×/ });
    expect(within(crit).getByText('Wind')).toBeTruthy();

    // 3. Its move is scored like any other.
    expect(screen.getByText('Test Bolt')).toBeTruthy();
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
      prerender({ view: 'calc', kind: 'aniimo', id: 'glacy' });
      render(<App />);
      await ready();

      expect(await screen.findByRole('heading', { name: 'Glacy' })).toBeTruthy();
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
      await ready();

      expect(await screen.findByRole('heading', { name: 'Emberpup' })).toBeTruthy();
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
