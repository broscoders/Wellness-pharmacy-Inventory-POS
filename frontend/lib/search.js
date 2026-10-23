// Pure helpers for the POS catalog (no React, no network) so they can be tested on their own.
//
// A catalog item is what GET /api/medicines/catalog returns:
//   { _id, name, genericName, manufacturer, category, barcode, stripsPerBox, unitsPerStrip,
//     salePrice, wholesalePrice, minStockLevel, requiresPrescription, pop, batches: [[quantity, expiryMs], ...] }
import { fromBase } from './units.js';

const DAY = 24 * 60 * 60 * 1000;

// "Panadol Extra 500mg" -> "panadol extra 500mg"; punctuation becomes a space; accents/case ignored.
export function normalize(s) {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\u0600-\u06ff]+/g, ' ')
    .trim();
}
const compact = (s) => normalize(s).replace(/ /g, '');

// Adds the search fields once, when an item is loaded (not on every keystroke).
export function prepare(item) {
  const name = normalize(item.name);
  const generic = normalize(item.genericName);
  const maker = normalize(item.manufacturer);
  return {
    ...item,
    _n: name,
    _c: compact(item.name),
    _g: generic,
    _m: maker,
    _b: String(item.barcode || '').toLowerCase(),
    _l: item.rack || item.row || item.side ? normalize(`rack ${item.rack || ''} row ${item.row || ''} ${item.side || ''}`) : '',
    _words: name.split(' ').filter(Boolean),
    _gwords: generic.split(' ').filter(Boolean),
  };
}

// Live stock from the batch list. "Sellable" = not expired, exactly like the server decides at checkout.
export function stockOf(item, now = Date.now()) {
  let total = 0; let sellable = 0; let expired = 0; let nearest = null;
  for (const [qty, exp] of item.batches || []) {
    if (!(qty > 0)) continue;
    total += qty;
    if (exp < now) expired += qty;
    else { sellable += qty; if (nearest === null || exp < nearest) nearest = exp; }
  }
  return {
    total, sellable, expired,
    nearestExpiry: nearest,
    daysToExpiry: nearest === null ? null : Math.ceil((nearest - now) / DAY),
    display: fromBase(item, sellable),
    isOut: sellable === 0,
    onlyExpired: sellable === 0 && expired > 0,
    isLow: sellable > 0 && sellable <= (item.minStockLevel || 0),
  };
}

// Same stock rule as the server (earliest expiry first), applied to the browser copy right after a sale
// so the screen is correct immediately; the next background sync confirms it.
export function takeLocal(batches, baseQty, now = Date.now()) {
  let left = baseQty;
  const sorted = [...batches].sort((a, b) => a[1] - b[1]);
  const out = sorted.map(([qty, exp]) => {
    if (left > 0 && exp >= now && qty > 0) {
      const take = Math.min(qty, left);
      left -= take;
      return [qty - take, exp];
    }
    return [qty, exp];
  });
  return out.filter(([qty]) => qty > 0);
}

// What can be typed in the search box before the name:
//   "3*panadol"   -> 3 of the default unit      "3x panadol" is the same
//   "10t*panadol" -> 10 tablets (loose units)   "2s*..." -> 2 strips   "1b*..." -> 1 box
// A plain search returns qty 1 and no unit.
const UNIT_LETTERS = { b: 'box', s: 'strip', t: 'unit', u: 'unit' };
export function parseQuery(raw) {
  const m = /^\s*(\d{1,4})\s*([bBsStTuU])?\s*[*xX\u00d7]\s*(\S.*)$/.exec(String(raw ?? ''));
  if (m && m[3].trim().length >= 2) {
    const out = { qty: Math.max(1, parseInt(m[1], 10)), text: m[3].trim() };
    if (m[2]) out.unit = UNIT_LETTERS[m[2].toLowerCase()];
    return out;
  }
  return { qty: 1, text: String(raw ?? '').trim() };
}

// Every medicine can be given as a box, a strip (patta) or a single unit (goli), and the counter always asks in that same
// order, so the hands learn it. (For a pack with no strips a strip is simply the whole pack: the price follows.)
export function unitChoices() {
  return ['box', 'strip', 'unit'];
}
// the unit used when the cashier just presses Shift+Enter
export const defaultUnitFor = () => 'strip';
// "unit" is called by the name a pharmacist uses: a tablet/capsule when the pack is made of strips, otherwise just "Unit"
export function unitLabel(m, unit) {
  if (unit === 'box') return 'Box';
  if (unit === 'strip') return 'Strip';
  const f = String(m.dosageForm || '').toLowerCase();
  if (f === 'tablet') return 'Tablet';
  if (f === 'capsule') return 'Capsule';
  return !f && (m.stripsPerBox || 1) > 1 && (m.unitsPerStrip || 1) > 1 ? 'Tablet' : 'Unit';
}
// what the counter staff call it in Urdu, shown next to the English name on the buttons
export function unitHint(m, unit) {
  if (unit === 'strip') return 'patta';
  if (unit === 'unit' && ['Tablet', 'Capsule'].includes(unitLabel(m, 'unit'))) return 'goli';
  return '';
}
export const unitName = (m, unit) => `${unitLabel(m, unit)}${unitHint(m, unit) ? ` (${unitHint(m, unit)})` : ''}`;

// Edit distance <= 1 (insert, delete, replace, swap of neighbours) between a typed word and the start of a name word.
function closeEnough(typed, word) {
  const w = word.slice(0, typed.length + 1);
  if (Math.abs(w.length - typed.length) > 1) return false;
  const a = typed; const b = w.length > typed.length ? w : word.slice(0, typed.length);
  if (a === b) return true;
  if (a.length === b.length) {
    let diff = 0; let first = -1;
    for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) { diff += 1; if (first < 0) first = i; if (diff > 2) return false; }
    if (diff === 1) return true;
    return diff === 2 && a[first] === b[first + 1] && a[first + 1] === b[first];
  }
  const [long, short] = a.length > b.length ? [a, b] : [b, a];
  let i = 0; let j = 0; let skipped = 0;
  while (i < long.length && j < short.length) {
    if (long[i] === short[j]) { i += 1; j += 1; } else { skipped += 1; i += 1; if (skipped > 1) return false; }
  }
  return true;
}

const hasWordStart = (words, t) => words.some((w) => w.startsWith(t));

function scoreItem(it, terms, whole, wholeCompact, now) {
  let score = 0;
  // every typed word must match something (name, generic, maker or barcode)
  for (const t of terms) {
    let best = 0;
    if (it._words.length && it._words[0].startsWith(t)) best = Math.max(best, 120);
    else if (hasWordStart(it._words, t)) best = Math.max(best, 90);
    else if (it._n.includes(t)) best = Math.max(best, 60);
    if (hasWordStart(it._gwords, t)) best = Math.max(best, 70);
    else if (it._g.includes(t)) best = Math.max(best, 40);
    if (it._m.includes(t)) best = Math.max(best, 25);
    if (it._l && it._l.split(' ').includes(t)) best = Math.max(best, 30); // "rack a", "left"
    if (it._b && it._b.includes(t)) best = Math.max(best, t.length >= 5 ? 80 : 0);
    if (best === 0 && t.length >= 3 && it._c.includes(t)) best = 50; // typed without the space: "panadol500"
    if (best === 0) return -1;
    score += best;
  }
  if (it._b === whole) score += 2000;
  if (it._n === whole) score += 600;
  else if (it._n.startsWith(whole)) score += 400;
  else if (wholeCompact.length >= 3 && it._c.startsWith(wholeCompact)) score += 300;
  else if (wholeCompact.length >= 3 && it._c.includes(wholeCompact)) score += 120;
  const sellable = (it.batches || []).some(([q, e]) => q > 0 && e >= now);
  if (!sellable) score -= 1000; // out of stock / expired always sinks below sellable matches
  return score;
}

/**
 * Search the whole catalog in memory.
 *   search(items, 'para 500', { limit: 40, category: id })
 * Words can be in any order; each must match the name, generic name, manufacturer or barcode.
 * When nothing matches, one small typo is forgiven ("panadoll" finds Panadol).
 */
const byName = (a, b) => (a._n < b._n ? -1 : a._n > b._n ? 1 : 0);

export function search(items, query, { limit = 40, category = null, now = Date.now() } = {}) {
  const pool = category ? items.filter((i) => i.category === category) : items;
  const whole = normalize(query);
  if (!whole) {
    // nothing typed: the plain A-Z list
    return [...pool].sort(byName).slice(0, limit);
  }
  const terms = whole.split(' ');
  const wholeCompact = whole.replace(/ /g, '');
  const hits = [];
  for (const it of pool) {
    const s = scoreItem(it, terms, whole, wholeCompact, now);
    if (s > -1000000 && s !== -1) hits.push([s, it]);
  }
  if (hits.length < 3 && terms.every((t) => t.length >= 4)) {
    const seen = new Set(hits.map(([, it]) => it._id));
    for (const it of pool) {
      if (seen.has(it._id)) continue;
      const ok = terms.every((t) => it._words.some((w) => closeEnough(t, w)) || it._gwords.some((w) => closeEnough(t, w)));
      if (ok) hits.push([-500, it]);
    }
  }
  hits.sort((a, b) => b[0] - a[0] || byName(a[1], b[1]));
  return hits.slice(0, limit).map(([, it]) => it);
}

// Exact barcode (scanner). Returns the item or undefined.
export function findByBarcode(items, code) {
  const c = String(code ?? '').trim().toLowerCase();
  if (!c) return undefined;
  return items.find((i) => i._b === c);
}

// What the cashier types in the Discount box:
//   "2" or "2%"      -> 2 percent of the bill
//   "rs 50" / "50rs" -> a fixed Rs 50
// Never more than the bill, never negative; anything else counts as no discount.
export function parseDiscount(text, subtotal) {
  const s = String(text ?? '').trim().toLowerCase();
  if (!s) return 0;
  const money = /^(?:rs\.?\s*(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s*rs\.?)$/.exec(s);
  const percent = /^(\d+(?:\.\d+)?)\s*%?$/.exec(s);
  let v = NaN;
  if (money) v = parseFloat(money[1] ?? money[2]);
  else if (percent) v = (subtotal * parseFloat(percent[1])) / 100;
  if (!Number.isFinite(v) || v < 0) return 0;
  return Math.min(Math.round((v + Number.EPSILON) * 100) / 100, subtotal);
}

// ---------- substitutes: same active ingredient(s), different brand ----------
// "Paracetamol + Caffeine" and "caffeine / paracetamol" are the same combination.
export function genericKey(g) {
  return String(g ?? '').toLowerCase().split(/\s*(?:\+|\/|&|,|\band\b)\s*/).map(normalize).filter(Boolean).sort().join('|');
}
// "Panadol 500mg" -> "500mg"; null when the name carries no strength.
export function strengthOf(name) {
  const m = /(\d+(?:\.\d+)?)\s*(mg|mcg|g|ml|iu|%)/i.exec(String(name ?? ''));
  return m ? `${parseFloat(m[1])}${m[2].toLowerCase()}` : null;
}
/**
 * Other brands with the same generic name that can be sold right now, same strength first, then the best sellers.
 * It only suggests: whether a substitute is acceptable for this patient is the pharmacist's decision.
 */
export function substitutes(items, med, { limit = 8, now = Date.now() } = {}) {
  const key = genericKey(med.genericName);
  if (!key) return [];
  const strength = strengthOf(med.name);
  const sellable = (it) => (it.batches || []).some(([q, e]) => q > 0 && e >= now);
  return items
    .filter((it) => it._id !== med._id && genericKey(it.genericName) === key && sellable(it))
    .map((it) => ({ it, same: !!strength && strengthOf(it.name) === strength }))
    .sort((a, b) => Number(b.same) - Number(a.same) || byName(a.it, b.it))
    .slice(0, limit)
    .map(({ it, same }) => ({ ...it, sameStrength: same }));
}

// "Rack A | Row 3 | Left" (only the parts that are filled in)
export function locationText(item) {
  return [item.rack && `Rack ${item.rack}`, item.row && `Row ${item.row}`, item.side].filter(Boolean).join(' | ');
}
