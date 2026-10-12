'use client';
import { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';

// A scannable barcode. Valid 13-digit numbers are drawn as EAN-13 (like manufacturer packs), anything else as Code 128.
export default function Barcode({ value, height = 40, width = 1.6, fontSize = 11, showText = true }) {
  const ref = useRef(null);
  useEffect(() => {
    const svg = ref.current;
    if (!svg || !value) return;
    const opts = { width, height, fontSize, displayValue: showText, margin: 0, lineColor: '#000', background: 'transparent' };
    try { JsBarcode(svg, value, { ...opts, format: /^\d{13}$/.test(value) ? 'EAN13' : 'CODE128' }); } catch { try { JsBarcode(svg, value, { ...opts, format: 'CODE128' }); } catch { return; } }
    // make it scale with its box (labels are different sizes) while keeping the bars crisp
    const w = svg.getAttribute('width'); const h = svg.getAttribute('height');
    if (w && h) { svg.setAttribute('viewBox', `0 0 ${parseFloat(w)} ${parseFloat(h)}`); svg.removeAttribute('width'); svg.removeAttribute('height'); }
  }, [value, height, width, fontSize, showText]);
  return <svg ref={ref} role="img" aria-label={`Barcode ${value}`} style={{ width: '100%', height: 'auto', display: 'block' }} />;
}
