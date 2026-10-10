'use client';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSettings } from '@/context/SettingsContext';

// A printable A4 document. Render it anywhere on a page; on screen it is hidden and when the user prints,
// only this document is printed (same mechanism as the receipt). Call window.print() from a button.
export default function PrintDoc({ title, subtitle, children }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const { settings: st } = useSettings();
  if (!mounted) return null;
  return createPortal(
    <div className="print-root print-wide">
      <div className="mb-3 border-b border-black pb-2">
        <p className="text-lg font-bold uppercase">{st.shopName}</p>
        {st.address && <p>{st.address}{st.phone ? ` | Tel: ${st.phone}` : ''}</p>}
        <p className="mt-2 text-base font-bold">{title}</p>
        {subtitle && <p>{subtitle}</p>}
        <p className="text-[10px]">Printed {new Date().toLocaleString('en-GB')}</p>
      </div>
      {children}
    </div>,
    document.body
  );
}
