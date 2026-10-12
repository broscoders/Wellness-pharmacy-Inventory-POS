// EAN-13 helpers for the shop's OWN barcodes. Numbers starting with 20-29 are reserved worldwide for in-store use,
// so a label printed here can never clash with a manufacturer's real barcode.
function ean13CheckDigit(first12) {
  const d = String(first12).split('').map(Number);
  const sum = d.reduce((s, n, i) => s + n * (i % 2 === 0 ? 1 : 3), 0);
  return (10 - (sum % 10)) % 10;
}
const isValidEan13 = (code) => /^\d{13}$/.test(code) && ean13CheckDigit(code.slice(0, 12)) === Number(code[12]);
const internalEan13 = (seq) => { const body = `20${String(seq).padStart(10, '0')}`; return body + ean13CheckDigit(body); };

module.exports = { ean13CheckDigit, isValidEan13, internalEan13 };
