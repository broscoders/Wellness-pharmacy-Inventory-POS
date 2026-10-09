'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Minus, Plus, Printer, Search, Trash2, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { money, stockText } from '@/lib/format';
import { baseQtyOfType, round2, sellPrice } from '@/lib/units';
import { Badge, Button, Card, ErrorNote, Field, Input, Modal, PageHeader, Select } from '@/components/ui';
import Receipt from '@/components/Receipt';
import CustomerPicker from '@/components/CustomerPicker';

const defaultUnit = (m) => (m.salePrice?.strip > 0 || m.stripsPerBox > 1 ? 'strip' : m.salePrice?.unit > 0 ? 'unit' : 'box');

export default function PosPage() {
  const { can } = useAuth();
  const searchRef = useRef(null);
  const [term, setTerm] = useState('');
  const [results, setResults] = useState([]);
  const [cart, setCart] = useState([]); // { med, unitType, qty }
  const [saleType, setSaleType] = useState('retail');
  const [customer, setCustomer] = useState(null);
  const [discount, setDiscount] = useState('');
  const [pay, setPay] = useState({ cash: '', card: '', bank_transfer: '', credit: '' });
  const [rx, setRx] = useState(false);
  const [rxLink, setRxLink] = useState(null); // recorded prescription used for this bill
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);

  useEffect(() => searchRef.current?.focus(), [done]);

  // live search (debounced)
  useEffect(() => {
    if (!term.trim()) { setResults([]); return undefined; }
    let alive = true; // ignore answers that arrive after the user typed something else or picked an item
    const t = setTimeout(() => {
      api('/medicines', { params: { search: term.trim(), active: 'true', limit: 8 } }).then((r) => { if (alive) setResults(r.data); }).catch(() => {});
    }, 200);
    return () => { alive = false; clearTimeout(t); };
  }, [term]);

  function addToCart(med) {
    setError('');
    setCart((c) => {
      const unitType = defaultUnit(med);
      const i = c.findIndex((l) => l.med._id === med._id && l.unitType === unitType);
      if (i >= 0) return c.map((l, k) => (k === i ? { ...l, qty: l.qty + 1 } : l));
      return [...c, { med, unitType, qty: 1 }];
    });
    setTerm(''); setResults([]); searchRef.current?.focus();
  }

  // Enter key: barcode scanners type the code and press Enter
  async function onSearchKey(e) {
    if (e.key !== 'Enter' || !term.trim()) return;
    e.preventDefault();
    try {
      const r = await api(`/medicines/barcode/${encodeURIComponent(term.trim())}`);
      addToCart(r.data);
    } catch {
      if (results[0]) addToCart(results[0]);
      else setError('No medicine found');
    }
  }

  const setLine = (i, patch) => setCart((c) => c.map((l, k) => (k === i ? { ...l, ...patch } : l)));
  const removeLine = (i) => setCart((c) => c.filter((_, k) => k !== i));

  const lines = useMemo(() => cart.map((l) => {
    const unitPrice = sellPrice(l.med, saleType, l.unitType);
    const needBase = l.qty * baseQtyOfType(l.med, l.unitType);
    return { ...l, unitPrice, total: round2(unitPrice * l.qty), needBase, short: needBase > l.med.stock.sellable };
  }), [cart, saleType]);

  const subtotal = round2(lines.reduce((s, l) => s + l.total, 0));
  const disc = Math.min(Number(discount) || 0, subtotal);
  const total = round2(subtotal - disc);
  const cash = Number(pay.cash) || 0, card = Number(pay.card) || 0, bank = Number(pay.bank_transfer) || 0, credit = Number(pay.credit) || 0;
  const received = round2(cash + card + bank);
  const remaining = round2(total - received - credit);
  const change = received + credit > total ? round2(received + credit - total) : 0;
  const needsRx = lines.some((l) => l.med.requiresPrescription);
  const hasShort = lines.some((l) => l.short);
  const hasNoPrice = lines.some((l) => !l.unitPrice);
  const canPay = lines.length > 0 && remaining <= 0 && !hasShort && !hasNoPrice && (!needsRx || rx || rxLink) && (credit === 0 || customer);

  async function checkout() {
    setBusy(true); setError('');
    const payments = [['cash', cash], ['card', card], ['bank_transfer', bank], ['credit', credit]].filter(([, a]) => a > 0).map(([method, amount]) => ({ method, amount }));
    try {
      const r = await api('/sales', {
        method: 'POST',
        body: {
          type: saleType, customer: customer?._id || undefined, discount: disc || undefined, payments,
          prescriptionConfirmed: needsRx && !rxLink ? rx : undefined, prescription: rxLink?._id || undefined,
          items: lines.map((l) => ({ medicine: l.med._id, unitType: l.unitType, quantity: l.qty })),
        },
      });
      setDone(r.data);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  function reset() {
    setDone(null); setCart([]); setCustomer(null); setDiscount(''); setPay({ cash: '', card: '', bank_transfer: '', credit: '' }); setRx(false); setRxLink(null); setError('');
  }

  return (
    <>
      <PageHeader title="POS / Billing" subtitle="Scan a barcode or search a medicine, then take payment"
        actions={<Select value={saleType} onChange={(e) => setSaleType(e.target.value)} className="w-36"><option value="retail">Retail</option><option value="wholesale">Wholesale</option></Select>} />
      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          <Card className="relative p-3">
            <Search className="absolute left-6 top-6 h-4 w-4 text-muted" />
            <Input ref={searchRef} className="h-12 pl-9 text-base" placeholder="Scan barcode or type medicine name, then Enter" value={term} onChange={(e) => setTerm(e.target.value)} onKeyDown={onSearchKey} />
            {results.length > 0 && (
              <ul className="absolute left-3 right-3 top-[60px] z-10 max-h-80 overflow-auto rounded-md border border-line bg-white shadow-lg">
                {results.map((m) => (
                  <li key={m._id}>
                    <button className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-mint disabled:opacity-50" onClick={() => addToCart(m)} disabled={m.stock.isOut}>
                      <span><span className="font-medium">{m.name}</span> <span className="text-xs text-muted">{m.genericName}</span></span>
                      <span className="num text-xs">{m.stock.isOut ? <Badge tone="bad">Out of stock</Badge> : `${stockText(m.stock.display)}`}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            {lines.length === 0 ? <p className="p-10 text-center text-muted">Cart is empty. Search or scan a medicine to start.</p> : (
              <ul className="divide-y divide-line">
                {lines.map((l, i) => (
                  <li key={i} className="grid grid-cols-[1fr_auto] gap-3 p-3 sm:grid-cols-[1fr_110px_130px_110px_36px] sm:items-center">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{l.med.name} {l.med.requiresPrescription && <Badge tone="warn">Rx</Badge>}</p>
                      <p className="text-xs text-muted">Available {stockText(l.med.stock.display)}</p>
                      {l.short && <p className="text-xs font-medium text-danger">Only {l.med.stock.sellable} units sellable</p>}
                      {!l.unitPrice && <p className="text-xs font-medium text-danger">Price not set for this unit</p>}
                    </div>
                    <Select value={l.unitType} onChange={(e) => setLine(i, { unitType: e.target.value })} aria-label="Unit"><option value="box">Box</option><option value="strip">Strip</option><option value="unit">Unit</option></Select>
                    <div className="flex items-center gap-1">
                      <Button variant="secondary" size="sm" onClick={() => setLine(i, { qty: Math.max(1, l.qty - 1) })} aria-label="Less"><Minus className="h-4 w-4" /></Button>
                      <Input className="num h-8 w-14 text-center" type="number" min="1" value={l.qty} onChange={(e) => setLine(i, { qty: Math.max(1, parseInt(e.target.value, 10) || 1) })} />
                      <Button variant="secondary" size="sm" onClick={() => setLine(i, { qty: l.qty + 1 })} aria-label="More"><Plus className="h-4 w-4" /></Button>
                    </div>
                    <p className="num text-right"><span className="block text-xs text-muted">{money(l.unitPrice)} each</span><b>{money(l.total)}</b></p>
                    <button className="rounded p-2 text-muted hover:bg-danger-soft hover:text-danger" onClick={() => removeLine(i)} aria-label="Remove"><Trash2 className="h-4 w-4" /></button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <Card className="h-fit space-y-3 p-4">
          <CustomerPicker customer={customer} onChange={setCustomer} label="Customer (optional, needed for udhaar)" />
          <div className="space-y-1 border-y border-line py-3 text-sm num">
            <div className="flex justify-between"><span className="text-muted">Subtotal</span><span>{money(subtotal)}</span></div>
            {can('sales:discount') && <div className="flex items-center justify-between gap-3"><span className="text-muted">Discount</span><Input className="num h-8 w-28 text-right" type="number" min="0" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0" /></div>}
            <div className="flex justify-between pt-1 text-lg font-semibold"><span>Total</span><span>{money(total)}</span></div>
          </div>

          <div className="space-y-2">
            {[['cash', 'Cash'], ['card', 'Card'], ['bank_transfer', 'Bank transfer'], ['credit', 'Udhaar (credit)']].map(([k, label]) => (
              <div key={k} className="flex items-center justify-between gap-3"><span className="text-sm">{label}</span><Input className="num h-9 w-32 text-right" type="number" min="0" value={pay[k]} onChange={(e) => setPay({ ...pay, [k]: e.target.value })} placeholder="0" /></div>
            ))}
            <Button variant="secondary" size="sm" className="w-full" onClick={() => setPay({ cash: String(total), card: '', bank_transfer: '', credit: '' })} disabled={!total}>Full amount in cash</Button>
          </div>

          {needsRx && (
            <div className="space-y-2 rounded-md bg-amber-soft p-2 text-sm">
              <p className="font-medium text-amber">This bill has prescription (Rx) medicines.</p>
              {can('prescriptions:view') && <RxPicker value={rxLink} onChange={setRxLink} customer={customer} />}
              {!rxLink && <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={rx} onChange={(e) => setRx(e.target.checked)} /> I have checked the prescription for the Rx medicines in this bill.</label>}
            </div>
          )}
          {credit > 0 && !customer && <p className="text-sm text-danger">Select a customer for udhaar.</p>}
          <div className="num text-sm">
            {remaining > 0 && <p className="font-medium text-danger">Remaining: {money(remaining)}</p>}
            {change > 0 && <p className="font-medium text-pine-dark">Change to return: {money(change)}</p>}
          </div>
          <ErrorNote error={error} />
          <Button size="lg" className="w-full" disabled={!canPay} loading={busy} onClick={checkout}>Complete sale {total ? `- ${money(total)}` : ''}</Button>
        </Card>
      </div>

      <Modal open={!!done} onClose={reset} title="Sale completed" width="max-w-sm"
        footer={<><Button variant="secondary" onClick={() => window.print()}><Printer className="h-4 w-4" /> Print receipt</Button><Button onClick={reset}>New sale</Button></>}>
        {done && <Receipt sale={done} />}
      </Modal>
    </>
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
