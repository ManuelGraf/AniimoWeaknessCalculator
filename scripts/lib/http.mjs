// Tiny fetch helper: retries, polite concurrency, optional on-disk cache.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const UA = 'AniimoWeaknessCalculator/1.0 (+https://github.com/ManuelGraf/AniimoWeaknessCalculator)';

export function makeClient({ cacheDir = null, concurrency = 6, retries = 3 } = {}) {
  let active = 0;
  const queue = [];

  const pump = () => {
    while (active < concurrency && queue.length) {
      const job = queue.shift();
      active++;
      job().finally(() => { active--; pump(); });
    }
  };

  const schedule = (fn) => new Promise((resolve, reject) => {
    queue.push(() => fn().then(resolve, reject));
    pump();
  });

  const cachePath = (url) =>
    cacheDir && path.join(cacheDir, createHash('sha1').update(url).digest('hex').slice(0, 16));

  async function get(url, { json = false } = {}) {
    const cp = cachePath(url);
    if (cp) {
      try { return json ? JSON.parse(await readFile(cp, 'utf8')) : await readFile(cp, 'utf8'); }
      catch { /* miss */ }
    }
    let lastErr;
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const res = await schedule(() => fetch(url, { headers: { 'user-agent': UA, accept: '*/*' } }));
        if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
        const body = await res.text();
        if (cp) { await mkdir(cacheDir, { recursive: true }); await writeFile(cp, body); }
        return json ? JSON.parse(body) : body;
      } catch (err) {
        lastErr = err;
        // Exponential backoff; the last attempt does not sleep.
        if (attempt < retries - 1) await new Promise((r) => setTimeout(r, 400 * 2 ** attempt));
      }
    }
    throw lastErr;
  }

  return { get };
}

// Run tasks with a live progress line so a 200-page crawl is not a silent wait.
export async function mapWithProgress(items, label, worker, { concurrency = 6 } = {}) {
  const out = new Array(items.length);
  let done = 0, cursor = 0;
  const tick = () => {
    done++;
    if (process.stdout.isTTY) process.stdout.write(`\r  ${label}: ${done}/${items.length}`);
    else if (done === items.length) process.stdout.write(`  ${label}: ${done}/${items.length}\n`);
  };
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      out[i] = await worker(items[i], i);
      tick();
    }
  });
  await Promise.all(runners);
  if (process.stdout.isTTY) process.stdout.write('\n');
  return out;
}
