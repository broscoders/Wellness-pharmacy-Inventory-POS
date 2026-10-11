// Saves the POS catalog in the browser (IndexedDB) so the counter opens instantly the next morning
// and still has the medicine list if the internet drops for a while. It holds selling prices and stock only
// (never purchase prices) and is wiped on sign-out.
const DB = 'wellness-pos';
const STORE = 'kv';
const KEY = 'catalog';
const SCHEMA = 1;

function open() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB not available')); return; }
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore(mode, fn) {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const out = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(out?.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}

export async function loadCache() {
  try {
    const v = await withStore('readonly', (s) => s.get(KEY));
    return v && v.schema === SCHEMA && Array.isArray(v.items) ? v : null;
  } catch { return null; }
}

export async function saveCache({ items, categories, serverTime, fullAt }) {
  try { await withStore('readwrite', (s) => s.put({ schema: SCHEMA, items, categories, serverTime, fullAt, savedAt: Date.now() }, KEY)); } catch { /* private mode / quota: the app still works, just without the cache */ }
}

export async function clearCache() {
  try { await withStore('readwrite', (s) => s.delete(KEY)); } catch { /* nothing to clear */ }
}
