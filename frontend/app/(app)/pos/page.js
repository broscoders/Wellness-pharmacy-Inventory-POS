'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Clock, Minus, Pause, Plus, Printer, RefreshCw, Search, Trash2, Volume2, VolumeX, WifiOff, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useCatalog } from '@/context/CatalogContext';
import { dateOnly, dateTime, money, stockText } from '@/lib/format';
import { baseQtyOfType, round2, sellPrice } from '@/lib/units';
import { locationText, parseDiscount, parseQuery, stockOf } from '@/lib/search';
import { beep } from '@/lib/beep';
import { Badge, Button, Card, ErrorNote, Input, Modal, Select } from '@/components/ui';
import Receipt from '@/components/Receipt';
import CustomerPicker from '@/components/CustomerPicker';

// Held (parked) bills and counter preferences live in this browser only.
const HELD_KEY = 'wp_held_bills_v2';
const PREF_KEY = 'wp_pos_prefs_v1';
const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key) || ''); } catch { return fallback; } };
const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full or blocked */ } };

const NO_PAY = { cash: '', card: '', bank_transfer: '', credit: '' };
const defaultUnit = (m) => (m.salePrice?.strip > 0 || m.stripsPerBox > 1 ? 'strip' : m.salePrice?.unit > 0 ? 'unit' : 'box');
const uid = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

export default function PosPage() {
  const { can } = useAuth();
  const catalog = useCatalog();
  const searchRef = useRef(null);
  const listRef = useRef(null);
  const keySeq = useRef(0);
  const attempt = useRef({ sig: '', id: '' }); // idempotency key for the bill on screen

  const [term, setTerm] = useState('');
  const [active, setActive] = useState(0);
  const [category, setCategory] = useState(null);
  const [cart, setCart] = useState([]); // { key, id, unitType, qty, name }
  const [lastKey, setLastKey] = useState(null);
  const [altFor, setAltFor] = useState(null); // medicine id whose alternatives are shown instead of the search results
  const [saleType, setSaleType] = useState('retail');
  const [customer, setCustomer] = useState(null);
  const [discountText, setDiscountText] = useState('');
  const [pay, setPay] = useState(NO_PAY);
  const [rx, setRx] = useState(false);
  const [rxLink, setRxLink] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const [held, setHeld] = useState([]);
  const [heldOpen, setHeldOpen] = useState(false);
  const [prefs, setPrefs] = useState({ sound: true, autoPrint: false });
  const [shiftOpen, setShiftOpen] = useState(true); // assume yes until the server says otherwise, so the warning never flashes
  const [, setTick] = useState(0);
  const useShifts = can('shifts:use');
  useEffect(() => { if (useShifts) api('/shifts/current').then((r) => setShiftOpen(!!r.data?._id)).catch(() => {}); }, [useShifts, done]);

  useEffect(() => { setHeld(read(HELD_KEY, [])); setPrefs((p) => ({ ...p, ...read(PREF_KEY, {}) })); }, []);
  const setPref = (patch) => setPrefs((p) => { const next = { ...p, ...patch }; write(PREF_KEY, next); return next; });
  const sound = (kind) => { if (prefs.sound) beep(kind); };
  useEffect(() => { const t = setInterval(() => setTick((n) => n + 1), 15000); return () => clearInterval(t); }, []); // "updated 12s ago" and expiry stay current
  useEffect(() => { if (!done) searchRef.current?.focus(); }, [done]);

  // ---------- search (all in memory, no waiting) ----------
  const parsed = useMemo(() => parseQuery(term), [term]);
  const results = useMemo(
    () => (catalog?.ready ? catalog.search(parsed.text, { limit: parsed.text || category ? 60 : 30, category }) : []),
    [catalog, parsed.text, category],
  );
  const altMed = altFor ? catalog?.get(altFor) : null;
  const alts = useMemo(() => (altMed ? catalog.substitutes(altMed) : []), [catalog, altMed]);
  const shown = altMed ? alts : results; // what the list on the left currently contains
  useEffect(() => { setActive(0); setAltFor(null); }, [parsed.text, category]);
  useEffect(() => { setActive(0); }, [altFor]);
  useEffect(() => { listRef.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' }); }, [active]);

  const fail = (msg) => { setError(msg); sound('bad'); };

  function addToCart(med, qty = 1) {
    const stock = stockOf(med);
    if (stock.isOut) {
      fail(`${med.name}: ${stock.onlyExpired ? 'only expired stock is left, it cannot be sold' : 'out of stock'}`);
      if (med.genericName) setAltFor(med._id); // show what else the shop has with the same generic name
      return false;
    }
    setError(''); setAltFor(null);
    const unitType = defaultUnit(med);
    const existing = cart.find((l) => l.id === med._id && l.unitType === unitType);
    let key;
    if (existing) {
      key = existing.key;
      setCart((c) => c.map((l) => (l.key === key ? { ...l, qty: l.qty + qty } : l)));
    } else {
      keySeq.current += 1; key = keySeq.current;
      setCart((c) => [...c, { key, id: med._id, unitType, qty, name: med.name }]);
    }
    setLastKey(key);
    setTerm(''); sound('ok');
    searchRef.current?.focus();
    return true;
  }

  function onSearchKey(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, Math.max(shown.length - 1, 0))); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); return; }
    if (e.key === 'Escape') { setTerm(''); setError(''); return; }
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const q = parseQuery(e.currentTarget.value); // read the box itself: a scanner types and presses Enter within milliseconds
    if (!q.text) return;
    const byCode = catalog.byBarcode(q.text);
    if (byCode) { addToCart(byCode, q.qty); return; }
    const pick = q.text === parsed.text ? shown[active] : catalog.search(q.text, { limit: 1 })[0];
    if (pick) addToCart(pick, q.qty);
    else { fail(`No medicine found for "${q.text}"`); e.currentTarget.select(); }
  }

  // ---------- the bill ----------
  const setLine = (key, patch) => setCart((c) => c.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const removeLine = (key) => setCart((c) => c.filter((l) => l.key !== key));

  const lines = useMemo(() => {
    const now = Date.now();
    const base = cart.map((l) => {
      const med = catalog?.get(l.id);
      if (!med) return { ...l, missing: true, unitPrice: 0, total: 0, needBase: 0, stock: null };
      const unitPrice = sellPrice(med, saleType, l.unitType);
      return { ...l, med, stock: stockOf(med, now), unitPrice, total: round2(unitPrice * l.qty), needBase: l.qty * baseQtyOfType(med, l.unitType) };
    });
    const used = new Map(); // the same medicine on two lines (strip + loose) shares one stock pool
    base.forEach((l) => { if (l.med) used.set(l.id, (used.get(l.id) || 0) + l.needBase); });
    return base.map((l) => ({ ...l, short: !!l.med && used.get(l.id) > l.stock.sellable }));
  }, [cart, saleType, catalog]);

  const subtotal = round2(lines.reduce((s, l) => s + l.total, 0));
  const disc = parseDiscount(discountText, subtotal);
  const total = round2(subtotal - disc);
  const entered = { cash: Number(pay.cash) || 0, card: Number(pay.card) || 0, bank_transfer: Number(pay.bank_transfer) || 0, credit: Number(pay.credit) || 0 };
  const nothingTyped = !entered.cash && !entered.card && !entered.bank_transfer && !entered.credit;
  const eff = nothingTyped ? { ...entered, cash: total } : entered; // nothing typed = customer pays the exact amount in cash
  const received = round2(eff.cash + eff.card + eff.bank_transfer);
  const remaining = round2(total - received - eff.credit);
  const change = received + eff.credit > total ? round2(received + eff.credit - total) : 0;
  const needsRx = lines.some((l) => l.med?.requiresPrescription);
  const hasShort = lines.some((l) => l.short || l.missing);
  const hasNoPrice = lines.some((l) => l.med && !l.unitPrice);
  const canPay = lines.length > 0 && total > 0 && remaining <= 0 && !hasShort && !hasNoPrice && (!needsRx || rx || !!rxLink) && (eff.credit === 0 || !!customer);

  const cashButtons = useMemo(() => {
    if (!total) return [];
    const set = new Set([Math.ceil(total / 100) * 100, 500, 1000, 5000].filter((v) => v > total));
    return [...set].sort((a, b) => a - b).slice(0, 3);
  }, [total]);

  async function checkout() {
    if (!canPay || busy) return;
    setBusy(true); setError('');
    const payments = [['cash', eff.cash], ['card', eff.card], ['bank_transfer', eff.bank_transfer], ['credit', eff.credit]].filter(([, a]) => a > 0).map(([method, amount]) => ({ method, amount }));
    const body = {
      type: saleType, customer: customer?._id || undefined, discount: disc || undefined, payments,
      prescriptionConfirmed: needsRx && !rxLink ? rx : undefined, prescription: rxLink?._id || undefined,
      items: lines.map((l) => ({ medicine: l.id, unitType: l.unitType, quantity: l.qty })),
    };
    // Same bill content = same key, so pressing the button again after a slow network can never bill twice.
    const sig = JSON.stringify(body);
    if (attempt.current.sig !== sig) attempt.current = { sig, id: uid() };
    try {
      const r = await api('/sales', { method: 'POST', body: { ...body, clientId: attempt.current.id }, timeoutMs: 25000 });
      const used = new Map();
      lines.forEach((l) => used.set(l.id, (used.get(l.id) || 0) + l.needBase));
      if (!r.duplicate) catalog.applySale([...used].map(([id, baseQty]) => ({ id, baseQty })));
      attempt.current = { sig: '', id: '' };
      setDone(r.data); sound('ok');
      if (prefs.autoPrint) setTimeout(() => window.print(), 250);
    } catch (e) { fail(e.message); } finally { setBusy(false); }
  }

  function clearBill() {
    setCart([]); setCustomer(null); setDiscountText(''); setPay(NO_PAY); setRx(false); setRxLink(null); setError(''); setLastKey(null);
    attempt.current = { sig: '', id: '' };
  }
  const newSale = useCallback(() => { setDone(null); clearBill(); }, []);

  // ---------- held bills ----------
  const snapshot = () => ({ id: Date.now(), at: new Date().toISOString(), cart: cart.map(({ id, unitType, qty, name }) => ({ id, unitType, qty, name })), saleType, customer, discountText });
  const saveHeld = (list) => { const next = list.slice(0, 20); setHeld(next); write(HELD_KEY, next); };
  function holdBill() {
    if (!cart.length || done) return;
    saveHeld([snapshot(), ...held]); clearBill(); searchRef.current?.focus();
  }
  function resumeBill(h) {
    setHeldOpen(false);
    let next = held.filter((x) => x.id !== h.id);
    if (cart.length) next = [snapshot(), ...next]; // the bill on screen is put aside, not lost
    saveHeld(next);
    clearBill();
    const alive = h.cart.filter((l) => catalog.get(l.id));
    setCart(alive.map((l) => { keySeq.current += 1; return { ...l, key: keySeq.current }; }));
    setSaleType(h.saleType); setCustomer(h.customer); setDiscountText(h.discountText || '');
    if (alive.length < h.cart.length) setError('Some medicines on this held bill are no longer available and were removed.');
    searchRef.current?.focus();
  }

  // ---------- keyboard: F2 search, F4 quantity of last line, F8 hold, F9 complete; Enter / P on the receipt ----------
  useEffect(() => {
    function onKey(e) {
      if (done) {
        if (e.key === 'Enter') { e.preventDefault(); newSale(); }
        else if (e.key.toLowerCase() === 'p' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); window.print(); }
        return;
      }
      if (heldOpen) return;
      if (e.key === 'F2') { e.preventDefault(); searchRef.current?.focus(); searchRef.current?.select(); }
      else if (e.key === 'F4') { e.preventDefault(); const el = document.getElementById(`qty-${lastKey ?? cart[cart.length - 1]?.key}`); el?.focus(); el?.select(); }
      else if (e.key === 'F8') { e.preventDefault(); holdBill(); }
      else if (e.key === 'F9') { e.preventDefault(); checkout(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const secondsAgo = catalog?.status.syncedAt ? Math.max(0, Math.round((Date.now() - catalog.status.syncedAt) / 1000)) : null;
  const offline = !!catalog?.status.error && catalog.count > 0;
  const showingBest = !parsed.text && !category;

  return (
    <div className="flex flex-col gap-3 xl:h-[calc(100dvh-3rem)]">
      {/* top bar */}
      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">POS / Billing</h1>
          <p className="flex items-center gap-2 text-xs text-muted">
            {!catalog?.ready ? 'Loading medicines...' : offline
              ? <span className="inline-flex items-center gap-1 font-medium text-amber"><WifiOff className="h-3.5 w-3.5" /> {catalog.status.error}: using the saved list ({catalog.count.toLocaleString()} medicines)</span>
              : <span>{catalog.count.toLocaleString()} medicines ready{secondsAgo !== null && !catalog.status.fromCache ? ` | updated ${secondsAgo < 5 ? 'just now' : `${secondsAgo}s ago`}` : ''}</span>}
            {catalog?.ready && <button onClick={() => catalog.refresh()} className="rounded p-1 text-muted hover:bg-mint hover:text-ink" title="Reload the medicine list now" aria-label="Reload medicine list"><RefreshCw className="h-3.5 w-3.5" /></button>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="hidden items-center gap-1.5 text-xs text-muted sm:flex"><input type="checkbox" checked={prefs.autoPrint} onChange={(e) => setPref({ autoPrint: e.target.checked })} /> Print after sale</label>
          <Button variant="ghost" size="sm" onClick={() => setPref({ sound: !prefs.sound })} title={prefs.sound ? 'Mute counter sounds' : 'Turn counter sounds on'} aria-label="Toggle sound">{prefs.sound ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}</Button>
          <Button variant="secondary" size="sm" onClick={holdBill} disabled={!cart.length} title="Put this bill aside (F8)"><Pause className="h-4 w-4" /> Hold</Button>
          <Button variant="secondary" size="sm" onClick={() => setHeldOpen(true)} disabled={!held.length} title="Bills put aside"><Clock className="h-4 w-4" /> Held ({held.length})</Button>
          <Select value={saleType} onChange={(e) => setSaleType(e.target.value)} className="h-8 w-32 text-[13px]" aria-label="Sale type"><option value="retail">Retail</option><option value="wholesale">Wholesale</option></Select>
        </div>
      </div>

      {useShifts && !shiftOpen && (
        <p className="no-print rounded-md bg-amber-soft px-3 py-2 text-sm text-amber">No cash shift is open, so today&apos;s cash cannot be checked at closing. <Link href="/shifts" className="font-medium underline">Open your shift</Link></p>
      )}
      <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[minmax(0,1fr)_500px]">
        {/* LEFT: find medicines */}
        <Card className="no-print flex min-h-0 flex-col">
          <div className="space-y-2 border-b border-line p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
              <Input ref={searchRef} className="h-12 pl-10 pr-24 text-base" placeholder="Scan barcode or type medicine name" value={term} autoComplete="off" spellCheck={false}
                onChange={(e) => setTerm(e.target.value)} onKeyDown={onSearchKey} aria-label="Search medicine" />
              {parsed.qty > 1 && parsed.text && <span className="absolute right-3 top-1/2 -translate-y-1/2 rounded bg-mint px-2 py-0.5 text-xs font-semibold text-pine-dark">Qty {parsed.qty}</span>}
            </div>
            <p className="hidden text-xs text-muted lg:block">
              <Kbd>Enter</Kbd> add &nbsp; <Kbd>Up</Kbd>/<Kbd>Down</Kbd> choose &nbsp; type <b>3*pana</b> for 3 pieces &nbsp; <Kbd>F4</Kbd> quantity &nbsp; <Kbd>F8</Kbd> hold &nbsp; <Kbd>F9</Kbd> complete
            </p>
            {catalog?.categories?.length > 0 && (
              <div className="flex gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Category">
                <Chip on={!category} onClick={() => setCategory(null)}>All</Chip>
                {catalog.categories.map((c) => <Chip key={c._id} on={category === c._id} onClick={() => setCategory(category === c._id ? null : c._id)}>{c.name}</Chip>)}
              </div>
            )}
          </div>

          <div ref={listRef} className="max-h-[46vh] min-h-0 flex-1 overflow-y-auto xl:max-h-none" role="listbox" aria-label="Medicines">
            {catalog?.loading && <p className="p-10 text-center text-muted">Loading the medicine list...</p>}
            {catalog?.status.state === 'error' && !catalog.count && (
              <div className="p-10 text-center"><p className="font-medium text-danger">Could not load medicines</p><p className="mt-1 text-sm text-muted">{catalog.status.error}</p><Button className="mt-3" onClick={() => catalog.refresh()}>Try again</Button></div>
            )}
            {altMed && (
              <div className="flex items-start justify-between gap-3 border-b border-amber/30 bg-amber-soft px-3 py-2 text-sm">
                <p><b>{altMed.name}</b> is not available. {alts.length ? <>Same generic (<b>{altMed.genericName}</b>), in stock. The pharmacist should confirm the substitute with the patient.</> : <>No other brand with <b>{altMed.genericName}</b> is in stock.</>}</p>
                <button className="shrink-0 text-xs font-medium text-amber underline" onClick={() => setAltFor(null)}>Back to search</button>
              </div>
            )}
            {catalog?.ready && !altMed && showingBest && results.length > 0 && <p className="px-3 pb-1 pt-2 text-xs font-medium text-muted">{results.some((m) => m.pop > 0) ? 'Sold most often' : 'All medicines A to Z'}</p>}
            {catalog?.ready && !altMed && !results.length && (
              <div className="p-10 text-center text-muted">
                {parsed.text ? <>No medicine matches <b className="text-ink">&ldquo;{parsed.text}&rdquo;</b>. Check the spelling, try the generic name, or scan the barcode.</> : 'No medicines in this category yet.'}
              </div>
            )}
            <ul>
              {shown.map((m, i) => <MedicineRow key={m._id} med={m} i={i} on={i === active} saleType={saleType} sameStrength={altMed ? m.sameStrength : undefined} onPick={() => addToCart(m, parsed.qty)} onHover={() => setActive(i)} />)}
            </ul>
          </div>
        </Card>

        {/* RIGHT: the bill */}
        <div className="flex min-h-0 flex-col gap-3">
          <Card className="flex min-h-[160px] flex-1 flex-col">
            <div className="no-print flex items-center justify-between border-b border-line px-3 py-2">
              <p className="text-sm font-semibold">Bill <span className="ml-1 font-normal text-muted">{lines.length ? `${lines.length} item${lines.length > 1 ? 's' : ''}` : ''}</span></p>
              {lines.length > 0 && <button className="text-xs text-muted hover:text-danger" onClick={() => { if (confirm('Clear this bill?')) clearBill(); }}>Clear</button>}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {lines.length === 0 ? <p className="p-8 text-center text-sm text-muted">Nothing on the bill yet.<br />Scan or search a medicine on the left.</p> : (
                <ul className="divide-y divide-line">
                  {lines.map((l) => <BillLine key={l.key} l={l} hot={l.key === lastKey} onChange={(p) => setLine(l.key, p)} onRemove={() => removeLine(l.key)} onAlt={() => setAltFor(l.id)} onDone={() => searchRef.current?.focus()} />)}
                </ul>
              )}
            </div>
          </Card>

          <Card className="no-print space-y-3 p-3">
            <CustomerPicker customer={customer} onChange={setCustomer} label="" placeholder="Customer (optional, needed for udhaar)" />
            <div className="rounded-lg bg-pine-dark px-4 py-3 text-white">
              <div className="num flex items-end justify-between">
                <span className="text-sm text-white/70">Total</span>
                <span className="text-3xl font-semibold leading-none tracking-tight">{money(total)}</span>
              </div>
              <div className="num mt-2 flex items-center justify-between gap-3 text-xs text-white/70">
                <span>Subtotal {money(subtotal)}</span>
                {can('sales:discount') && (
                  <label className="flex items-center gap-2">Discount
                    <input className="num h-7 w-20 rounded border border-white/30 bg-white/10 px-2 text-right text-white placeholder:text-white/40 focus:border-white focus:outline-none" value={discountText} onChange={(e) => setDiscountText(e.target.value)} placeholder="0 or 10%" inputMode="decimal" aria-label="Discount" />
                  </label>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-12 text-sm font-medium">Cash</span>
                <Input className="num h-10 flex-1 text-right text-base" type="number" min="0" value={pay.cash} onChange={(e) => setPay({ ...pay, cash: e.target.value })} placeholder={total ? `${total} (exact)` : '0'} aria-label="Cash received" />
              </div>
              {total > 0 && (
                <div className="flex flex-wrap gap-1.5 pl-14">
                  <Button variant="secondary" size="sm" onClick={() => setPay({ ...NO_PAY, cash: String(total) })}>Exact</Button>
                  {cashButtons.map((v) => <Button key={v} variant="secondary" size="sm" onClick={() => setPay({ ...pay, cash: String(v) })}>{v.toLocaleString()}</Button>)}
                </div>
              )}
              <div className="grid grid-cols-3 gap-2">
                {[['card', 'Card'], ['bank_transfer', 'Bank'], ['credit', 'Udhaar']].map(([k, label]) => (
                  <label key={k} className="block text-xs text-muted">{label}
                    <Input className="num mt-0.5 h-9 text-right text-sm text-ink" type="number" min="0" value={pay[k]} onChange={(e) => setPay({ ...pay, [k]: e.target.value })} placeholder="0" />
                  </label>
                ))}
              </div>
            </div>

            {needsRx && (
              <div className="space-y-2 rounded-md bg-amber-soft p-2 text-sm">
                <p className="font-medium text-amber">Prescription (Rx) medicines on this bill</p>
                {can('prescriptions:view') && <RxPicker value={rxLink} onChange={setRxLink} customer={customer} />}
                {!rxLink && <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={rx} onChange={(e) => setRx(e.target.checked)} /> I have checked the prescription for the Rx medicines.</label>}
              </div>
            )}
            {eff.credit > 0 && !customer && <p className="text-sm text-danger">Choose a customer to record udhaar.</p>}
            <div className="num min-h-5 text-sm">
              {total > 0 && remaining > 0 && <p className="font-medium text-danger">Still to pay: {money(remaining)}</p>}
              {change > 0 && <p className="text-base font-semibold text-pine-dark">Change to give back: {money(change)}</p>}
            </div>
            <ErrorNote error={error} />
            <Button size="lg" className="w-full" disabled={!canPay} loading={busy} onClick={checkout}>
              Complete sale{total ? ` - ${money(total)}` : ''} <span className="ml-1 hidden rounded bg-white/20 px-1.5 text-xs font-normal xl:inline">F9</span>
            </Button>
          </Card>
        </div>
      </div>

      <Modal open={heldOpen} onClose={() => setHeldOpen(false)} title="Held bills" width="max-w-xl">
        {held.length === 0 ? <p className="py-6 text-center text-muted">No held bills.</p> : (
          <ul className="divide-y divide-line">
            {held.map((h) => {
              const approx = round2(h.cart.reduce((sum, l) => { const m = catalog.get(l.id); return sum + (m ? sellPrice(m, h.saleType, l.unitType) * l.qty : 0); }, 0));
              return (
                <li key={h.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0"><p className="font-medium">{h.customer?.name || 'Walk-in'} <span className="num ml-1 text-sm font-normal text-muted">about {money(approx)}</span></p><p className="truncate text-xs text-muted">{dateTime(h.at)} | {h.cart.length} item(s): {h.cart.map((l) => l.name).join(', ')}</p></div>
                  <div className="flex shrink-0 gap-2"><Button size="sm" onClick={() => resumeBill(h)}>Resume</Button><Button size="sm" variant="ghost" onClick={() => saveHeld(held.filter((x) => x.id !== h.id))} aria-label="Delete held bill"><Trash2 className="h-4 w-4" /></Button></div>
                </li>
              );
            })}
          </ul>
        )}
      </Modal>

      <Modal open={!!done} onClose={newSale} title="Sale completed" width="max-w-sm"
        footer={<><Button variant="secondary" onClick={() => window.print()}><Printer className="h-4 w-4" /> Print <span className="text-xs text-muted">P</span></Button><Button onClick={newSale}>New sale <span className="text-xs opacity-70">Enter</span></Button></>}>
        {done && <Receipt sale={done} />}
      </Modal>
    </div>
  );
}

function Kbd({ children }) {
  return <kbd className="rounded border border-line bg-paper px-1 font-sans text-[11px] text-ink">{children}</kbd>;
}

function Chip({ on, onClick, children }) {
  return <button role="tab" aria-selected={on} onClick={onClick} className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${on ? 'border-pine bg-pine text-white' : 'border-line bg-white text-ink hover:bg-mint'}`}>{children}</button>;
}

// One medicine in the find list: what it is, what it costs, what is left, when it expires.
function MedicineRow({ med, i, on, saleType, sameStrength, onPick, onHover }) {
  const s = stockOf(med);
  const unit = defaultUnit(med);
  const price = sellPrice(med, saleType, unit);
  let stockBadge;
  if (s.onlyExpired) stockBadge = <Badge tone="bad">Expired stock only</Badge>;
  else if (s.isOut) stockBadge = <Badge tone="bad">Out of stock</Badge>;
  else if (s.daysToExpiry !== null && s.daysToExpiry <= 30) stockBadge = <Badge tone="warn">Expires in {s.daysToExpiry}d</Badge>;
  else if (s.isLow) stockBadge = <Badge tone="warn">Low</Badge>;
  return (
    <li data-i={i} role="option" aria-selected={on} aria-disabled={s.isOut}>
      <button type="button" onClick={onPick} onMouseMove={onHover}
        className={`grid w-full grid-cols-[1fr_auto] items-center gap-x-3 border-b border-line px-3 py-2 text-left ${on ? 'bg-mint' : 'hover:bg-paper'} ${s.isOut ? 'opacity-60' : ''}`}>
        <span className="min-w-0">
          <span className="flex items-center gap-2"><span className="truncate font-medium">{med.name}</span>{med.requiresPrescription && <Badge tone="warn">Rx</Badge>}{med.storage === 'fridge' && <Badge tone="good">Fridge</Badge>}{sameStrength === true && <Badge tone="good">Same strength</Badge>}{sameStrength === false && <Badge>Different strength</Badge>}</span>
          <span className="block truncate text-xs text-muted">{[med.genericName, med.manufacturer].filter(Boolean).join(' | ') || '\u00a0'}</span>
          {locationText(med) && <span className="block truncate text-xs font-medium text-pine-dark">{locationText(med)}</span>}
        </span>
        <span className="num text-right">
          <span className="block font-semibold">{price ? money(price) : 'No price'}<span className="text-xs font-normal text-muted"> / {unit}</span></span>
          <span className="flex items-center justify-end gap-2 text-xs text-muted">
            {stockBadge}
            {!s.isOut && <span>{stockText(s.display)}{s.nearestExpiry ? ` | exp ${dateOnly(s.nearestExpiry).slice(3)}` : ''}</span>}
          </span>
        </span>
      </button>
    </li>
  );
}

function BillLine({ l, hot, onChange, onRemove, onAlt, onDone }) {
  if (l.missing) {
    return <li className="flex items-center justify-between gap-3 bg-danger-soft p-3 text-sm text-danger"><span>{l.name} is no longer available</span><button onClick={onRemove} aria-label="Remove"><X className="h-4 w-4" /></button></li>;
  }
  return (
    <li className={`px-3 py-2 ${hot ? 'bg-mint/60' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 truncate font-medium">{l.med.name} {l.med.requiresPrescription && <Badge tone="warn">Rx</Badge>}</p>
        <p className="num shrink-0 font-semibold">{money(l.total)}</p>
      </div>
      {(locationText(l.med) || l.med.storage === 'fridge') && <p className="text-xs text-pine-dark">{locationText(l.med)}{l.med.storage === 'fridge' ? `${locationText(l.med) ? ' | ' : ''}Keep in fridge` : ''}</p>}
      <div className="mt-1 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Select value={l.unitType} onChange={(e) => onChange({ unitType: e.target.value })} className="h-8 w-[84px] px-2 text-[13px]" aria-label="Unit"><option value="box">Box</option><option value="strip">Strip</option><option value="unit">Unit</option></Select>
          <Button variant="secondary" size="sm" className="h-8 w-8 px-0" onClick={() => onChange({ qty: Math.max(1, l.qty - 1) })} aria-label="Less"><Minus className="h-4 w-4" /></Button>
          <Input id={`qty-${l.key}`} className="num h-8 w-14 px-1 text-center" type="number" min="1" value={l.qty}
            onChange={(e) => onChange({ qty: Math.max(1, parseInt(e.target.value, 10) || 1) })}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onDone(); } }} aria-label="Quantity" />
          <Button variant="secondary" size="sm" className="h-8 w-8 px-0" onClick={() => onChange({ qty: l.qty + 1 })} aria-label="More"><Plus className="h-4 w-4" /></Button>
        </div>
        <div className="flex items-center gap-2">
          <span className="num text-xs text-muted">{money(l.unitPrice)} each</span>
          {l.med.genericName && <button className="text-xs text-muted underline hover:text-ink" onClick={onAlt} title="Other brands with the same generic name">Alternatives</button>}
          <button className="rounded p-1.5 text-muted hover:bg-danger-soft hover:text-danger" onClick={onRemove} aria-label="Remove"><Trash2 className="h-4 w-4" /></button>
        </div>
      </div>
      {l.short && <p className="mt-1 text-xs font-medium text-danger">Only {stockText(l.stock.display)} available{l.stock.expired ? ` (${l.stock.expired} expired units cannot be sold)` : ''}</p>}
      {!l.unitPrice && <p className="mt-1 text-xs font-medium text-danger">Price not set for this unit</p>}
    </li>
  );
}

function RxPicker({ value, onChange, customer }) {
  const [term, setTerm] = useState('');
  const [list, setList] = useState([]);
  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => api('/prescriptions', { params: { search: term.trim() || customer?.name, limit: 5 } }).then((r) => { if (alive) setList(r.data); }).catch(() => {}), 250);
    return () => { alive = false; clearTimeout(t); };
  }, [term, customer]);
  if (value) return <div className="flex items-center justify-between rounded bg-white px-2 py-1"><span>{value.rxNo} - Dr. {value.doctorName}</span><button onClick={() => onChange(null)} aria-label="Unlink"><X className="h-4 w-4" /></button></div>;
  return (
    <div className="relative">
      <Input className="h-9 bg-white" placeholder="Link a recorded prescription (doctor, patient or RX no.)" value={term} onChange={(e) => setTerm(e.target.value)} />
      {list.length > 0 && term && (
        <ul className="absolute z-20 mt-1 w-full rounded-md border border-line bg-white shadow-lg">
          {list.map((r) => <li key={r._id}><button type="button" className="flex w-full justify-between px-3 py-2 text-left hover:bg-mint" onClick={() => { onChange(r); setTerm(''); }}><span>{r.rxNo} | Dr. {r.doctorName}</span><span className="text-xs text-muted">{r.customerName}</span></button></li>)}
        </ul>
      )}
    </div>
  );
}
