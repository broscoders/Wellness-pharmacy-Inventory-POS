'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { loadCache, saveCache } from '@/lib/catalogDb';
import { findByBarcode, prepare, search as runSearch, substitutes as runSubstitutes, takeLocal } from '@/lib/search';

// The whole medicine list lives in the browser. Searching never waits for the server.
//   first visit : one request loads everything (about a second for 5,000 medicines)
//   next visits : the saved copy shows instantly, then a tiny "what changed" request catches up
//   while open  : the same tiny request repeats every 30 seconds (other counters' sales, price edits, new stock)
// Checkout is still checked by the server, so a slightly old screen can never sell what is not there.
const POLL_MS = 30 * 1000;
const FULL_REFRESH_MS = 30 * 60 * 1000;
const MAX_CACHE_AGE_MS = 12 * 60 * 60 * 1000;
const OVERLAP_MS = 5000; // ask for a little more than "since the last sync" so nothing slips between two requests

const CatalogContext = createContext(null);
export const useCatalog = () => useContext(CatalogContext);

const strip = ({ _n, _c, _g, _m, _b, _words, _gwords, ...raw }) => raw; // eslint-disable-line no-unused-vars

export function CatalogProvider({ children }) {
  const { user, can } = useAuth();
  const enabled = !!user && (can('pos:use') || can('medicines:view'));

  const mapRef = useRef(new Map());
  const metaRef = useRef({ serverTime: null, fullAt: 0, categories: [] });
  const epochRef = useRef(0); // bumped by every local change, so an older server answer cannot undo it
  const syncing = useRef(false);
  const saveTimer = useRef(null);
  const [version, setVersion] = useState(0);
  const [status, setStatus] = useState({ state: 'idle', syncedAt: null, error: '', fromCache: false });

  const bump = useCallback(() => setVersion((v) => v + 1), []);

  const persist = useCallback(() => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const m = metaRef.current;
      saveCache({ items: [...mapRef.current.values()].map(strip), categories: m.categories, serverTime: m.serverTime, fullAt: m.fullAt });
    }, 1200);
  }, []);

  const ingest = useCallback((payload, mode) => {
    const map = mode === 'full' ? new Map() : mapRef.current;
    for (const id of payload.removed || []) map.delete(id);
    for (const raw of payload.data) map.set(raw._id, prepare(raw));
    mapRef.current = map;
    metaRef.current = {
      serverTime: payload.serverTime,
      fullAt: mode === 'full' ? Date.now() : metaRef.current.fullAt,
      categories: payload.categories || metaRef.current.categories,
    };
  }, []);

  const sync = useCallback(async ({ force = false } = {}) => {
    if (!enabled || syncing.current) return;
    syncing.current = true;
    const epoch = epochRef.current;
    try {
      const meta = metaRef.current;
      const full = force || !meta.serverTime || Date.now() - meta.fullAt > FULL_REFRESH_MS;
      const params = full ? {} : { since: new Date(new Date(meta.serverTime).getTime() - OVERLAP_MS).toISOString() };
      const r = await api('/medicines/catalog', { params });
      if (epoch !== epochRef.current && !full) { setTimeout(() => sync(), 400); return; } // a sale happened meanwhile: ask again instead of showing older numbers
      ingest(r, full ? 'full' : 'delta');
      bump(); persist();
      setStatus({ state: 'ready', syncedAt: Date.now(), error: '', fromCache: false });
    } catch (e) {
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
      setStatus((s) => ({ ...s, state: mapRef.current.size ? 'ready' : 'error', error: offline ? 'Offline' : (e.message || 'Could not refresh'), stale: true }));
    } finally { syncing.current = false; }
  }, [enabled, ingest, bump, persist]);

  // start / stop with the signed-in user
  useEffect(() => {
    if (!enabled) {
      // Not signed in (yet): forget what is in memory, but keep the saved copy. While the session is still being restored
      // on page load the user is briefly empty; the saved copy is wiped by logout() only.
      if (!user) { mapRef.current = new Map(); metaRef.current = { serverTime: null, fullAt: 0, categories: [] }; setStatus({ state: 'idle', syncedAt: null, error: '', fromCache: false }); bump(); }
      return undefined;
    }
    let alive = true;
    (async () => {
      setStatus((s) => ({ ...s, state: 'loading' }));
      const cached = await loadCache();
      if (!alive) return;
      if (cached && Date.now() - cached.savedAt < MAX_CACHE_AGE_MS) {
        ingest({ data: cached.items, categories: cached.categories, serverTime: cached.serverTime, removed: [] }, 'full');
        metaRef.current.fullAt = cached.fullAt || 0;
        bump();
        setStatus({ state: 'ready', syncedAt: cached.savedAt, error: '', fromCache: true });
      }
      if (alive) sync();
    })();
    return () => { alive = false; };
  }, [enabled, user, ingest, sync, bump]);

  // keep fresh: every 30 s while the tab is visible, and right away when the tab/network comes back
  useEffect(() => {
    if (!enabled) return undefined;
    const tick = () => { if (document.visibilityState === 'visible') sync(); };
    const id = setInterval(tick, POLL_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') sync(); };
    window.addEventListener('online', tick);
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(id); window.removeEventListener('online', tick); document.removeEventListener('visibilitychange', onVisible); };
  }, [enabled, sync]);

  // After a sale: subtract the sold stock on this screen at once (earliest expiry first, like the server).
  const applySale = useCallback((lines) => {
    const now = Date.now();
    for (const { id, baseQty } of lines) {
      const it = mapRef.current.get(id);
      if (it) mapRef.current.set(id, { ...it, batches: takeLocal(it.batches, baseQty, now), pop: (it.pop || 0) + 1 });
    }
    epochRef.current += 1;
    bump(); persist();
    setTimeout(() => sync(), 600); // confirm with the server shortly after
  }, [bump, persist, sync]);

  const value = useMemo(() => {
    const items = [...mapRef.current.values()].sort((a, b) => (a._n < b._n ? -1 : a._n > b._n ? 1 : 0));
    const cats = new Map(metaRef.current.categories.map((c) => [c._id, c.name]));
    return {
      ready: status.state === 'ready' || mapRef.current.size > 0,
      loading: status.state === 'loading' && mapRef.current.size === 0,
      status,
      count: items.length,
      items,
      categories: metaRef.current.categories,
      categoryName: (id) => cats.get(id) || '',
      get: (id) => mapRef.current.get(id),
      search: (q, opts) => runSearch(items, q, opts),
      byBarcode: (code) => findByBarcode(items, code),
      substitutes: (med) => runSubstitutes(items, med),
      applySale,
      refresh: () => sync({ force: true }),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, status, applySale, sync]);

  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}
