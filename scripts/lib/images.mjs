// The wiki serves a round head icon next to every stage render, under the same
// numeric id: Wiki_Aniimo_1005101.png -> Wiki_PetHead_1005101.png. That is a
// derived URL rather than one the payload hands us, so each candidate is
// checked before it reaches the database - most Prismana and weather forms
// have no head of their own and would otherwise ship as a broken image.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { mapWithProgress } from './http.mjs';

export const headCandidate = (stageImage) =>
  stageImage && stageImage.includes('Wiki_Aniimo_')
    ? stageImage.replace('Wiki_Aniimo_', 'Wiki_PetHead_')
    : null;

/**
 * Resolves `form.head` for every wiki form, mutating in place.
 * Results are cached by URL so repeat syncs cost nothing.
 */
export async function resolveHeads(forms, { cacheDir = null } = {}) {
  const cacheFile = cacheDir && path.join(cacheDir, 'images.json');
  const cache = new Map(Object.entries(await readCache(cacheFile)));

  const candidates = [...new Set(
    forms.map((f) => headCandidate(f.portrait)).filter((u) => u && !cache.has(u)),
  )];

  if (candidates.length) {
    const results = await mapWithProgress(candidates, 'head icons', async (url) => {
      try {
        const res = await fetch(url, { method: 'HEAD' });
        return res.ok && (res.headers.get('content-type') ?? '').startsWith('image/');
      } catch {
        return false;
      }
    }, { concurrency: 8 });
    candidates.forEach((url, i) => cache.set(url, results[i]));
  }

  let found = 0;
  for (const form of forms) {
    const url = headCandidate(form.portrait);
    form.head = url && cache.get(url) ? url : null;
    if (form.head) found++;
  }

  if (cacheFile) {
    await mkdir(cacheDir, { recursive: true });
    await writeFile(cacheFile, JSON.stringify(Object.fromEntries(cache), null, 0));
  }

  return { found, total: forms.length, checked: candidates.length };
}

async function readCache(file) {
  if (!file) return {};
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return {};
  }
}
