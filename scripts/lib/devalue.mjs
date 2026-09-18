// Nuxt ships its payload in devalue's flattened form: a flat array where every
// nested value is an index into that array. Rehydrate it back into plain JSON.
const REF_WRAPPERS = new Set(['ShallowReactive', 'Reactive', 'Ref', 'ShallowRef', 'EmptyRef', 'NuxtError']);

export function hydrate(flat) {
  if (!Array.isArray(flat)) throw new Error('devalue payload must be an array');
  const memo = new Map();

  const resolve = (index) => {
    if (typeof index !== 'number') return index;   // already a literal
    if (index < 0) return null;                    // devalue's hole/undefined marker
    if (memo.has(index)) return memo.get(index);

    const node = flat[index];

    if (Array.isArray(node)) {
      if (node.length === 2 && REF_WRAPPERS.has(node[0])) return resolve(node[1]);
      const arr = [];
      memo.set(index, arr);                        // set before recursing: payloads contain cycles
      for (const child of node) arr.push(resolve(child));
      return arr;
    }

    if (node && typeof node === 'object') {
      const obj = {};
      memo.set(index, obj);
      for (const [key, child] of Object.entries(node)) obj[key] = resolve(child);
      return obj;
    }

    memo.set(index, node);
    return node;
  };

  return resolve(0);
}

// Pull the `data` bag out of a hydrated Nuxt payload.
export function payloadData(flat) {
  const root = hydrate(flat);
  return root?.data ?? {};
}
