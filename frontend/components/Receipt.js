'use client';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { dateTime, money } from '@/lib/format';
import { useSettings } from '@/context/SettingsContext';

// Groups the per-batch rows back into the lines the cashier entered.
function groupLines(items) {
  const map = new Map();
  for (const it of items) {
    const g = map.get(it.line) || { name: it.name, unitType: it.unitType, qty: it.cartQty, total: 0, batches: [] };
    g.total += it.lineTotal;
    g.batches.push(`${it.batchNumber}`);
    map.set(it.line, g);
  }
  return [...map.values()];
}

function Body({ sale }) {
  const { settings: st } = useSettings();
  const lines = groupLines(sale.items);
  return (
    <>
      <div className="text-center">
        <p className="text-base font-bold uppercase">{st.shopName}</p>
        {st.tagline && <p>{st.tagline}</p>}
        {st.address && <p>{st.address}</p>}
        {st.phone && <p>Tel: {st.phone}</p>}
        {st.licenseNo && <p>Drug license: {st.licenseNo}</p>}
        {st.ntn && <p>NTN: {st.ntn}</p>}
        <p className="mt-1 font-bold">{sale.type === 'wholesale' ? 'WHOLESALE INVOICE' : 'SALES RECEIPT'}</p>
      </div>
      <div className="my-2 border-y border-dashed border-black py-1">
        <p>Invoice: <b>{sale.invoiceNo}</b></p>
        <p>Date: {dateTime(sale.createdAt)}</p>
        <p>Cashier: {sale.createdByName}</p>
        <p>Customer: {sale.customerName || 'Walk-in'}</p>
      </div>
      <table className="w-full">
        <tbody>
          {lines.map((l, i) => (
            <tr key={i} className="align-top">
              <td className="pr-2">{l.name}<br /><span className="text-[10px]">{l.qty} {l.unitType} | batch {[...new Set(l.batches)].join(', ')}</span></td>
              <td className="text-right whitespace-nowrap">{money(l.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 border-t border-dashed border-black pt-1">
        <Row k="Subtotal" v={money(sale.subtotal)} />
        {sale.discount > 0 && <Row k="Discount" v={`- ${money(sale.discount)}`} />}
        <Row k="TOTAL" v={money(sale.total)} bold />
        {sale.payments.filter((p) => p.method !== 'credit').map((p, i) => <Row key={i} k={p.method.replace('_', ' ')} v={money(p.amount)} />)}
        {sale.changeGiven > 0 && <Row k="Change" v={money(sale.changeGiven)} />}
        {sale.creditAmount > 0 && <Row k="On credit (udhaar)" v={money(sale.creditAmount)} bold />}
      </div>
      <p className="mt-3 text-center">{st.receiptFooter}</p>
    </>
  );
}

// Shows the receipt on screen, and keeps a second copy at the end of <body> that is the ONLY thing
// printed (see .print-root in globals.css). This way the rest of the page takes no space on paper.
export default function Receipt({ sale }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return (
    <>
      <div className="mx-auto w-full max-w-[320px] bg-white font-mono text-[12px] leading-5 text-black"><Body sale={sale} /></div>
      {mounted && createPortal(<div className="print-root font-mono"><Body sale={sale} /></div>, document.body)}
    </>
  );
}

const Row = ({ k, v, bold }) => (
  <div className={`flex justify-between capitalize ${bold ? 'font-bold' : ''}`}><span>{k}</span><span>{v}</span></div>
);
