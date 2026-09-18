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

  test('a deep link restores the selection', async () => {
    window.location.hash = '#/aniimo/emberpup';
    render(<App />);
    await ready();
    expect(await screen.findByRole('heading', { name: 'Emberpup' })).toBeTruthy();
    expect(await screen.findByText('Dealing damage')).toBeTruthy();
  });

  test('the chart view renders all nine rows', async () => {
    window.location.hash = '#/chart';
    render(<App />);
    await waitFor(() => expect(screen.getByRole('table')).toBeTruthy());
    const rows = within(screen.getByRole('table')).getAllByRole('row');
    expect(rows).toHaveLength(10); // header + nine elements
  });
});
