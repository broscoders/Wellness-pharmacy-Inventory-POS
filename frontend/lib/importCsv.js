// CSV helpers for the medicine import screen (no external library).

// Parses CSV text into an array of rows (arrays of strings). Handles quotes, "" escapes, commas/semicolons/tabs, BOM.
export function parseCsv(text) {
  const src = text.replace(/^\uFEFF/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] || '';
  const delim = [',', ';', '\t'].map((d) => [d, firstLine.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = [];
  let row = []; let cell = ''; let quoted = false;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i += 1; } else if (ch === '"') quoted = false; else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delim) { row.push(cell); cell = ''; } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      row.push(cell); cell = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
}

// canonical column -> accepted header spellings (compared after lower-casing and removing spaces/symbols)
const ALIASES = {
  name: ['name', 'medicinename', 'medicine', 'productname', 'product', 'item', 'itemname'],
  genericName: ['genericname', 'generic', 'formula', 'salt'],
  category: ['category', 'type', 'group'],
  manufacturer: ['manufacturer', 'company', 'mfr', 'brand', 'manufacturers'],
  barcode: ['barcode', 'code', 'sku'],
  supplier: ['supplier', 'vendor', 'distributor'],
  stripsPerBox: ['stripsperbox', 'stripsinbox', 'stripbox', 'stripspack'],
  unitsPerStrip: ['unitsperstrip', 'tabletsperstrip', 'tabsperstrip', 'pcsperstrip', 'piecesperstrip'],
  purchasePrice: ['purchaseprice', 'purchasepricebox', 'purchasepriceperbox', 'costprice', 'cost', 'purchaserate'],
  salePriceBox: ['salepricebox', 'boxprice', 'retailpricebox', 'salepriceperbox'],
  salePriceStrip: ['salepricestrip', 'stripprice', 'retailpricestrip', 'salepriceperstrip'],
  salePriceUnit: ['salepriceunit', 'unitprice', 'tabletprice', 'pieceprice', 'retailpriceunit', 'salepriceperunit'],
  wholesalePriceBox: ['wholesalepricebox', 'wholesalebox', 'wholesaleprice', 'wholesalepriceperbox'],
  minStock: ['minstock', 'minimumstock', 'minstocklevel', 'reorderlevel', 'minimumstocklevel'],
  requiresPrescription: ['requiresprescription', 'rx', 'prescription', 'prescriptionrequired'],
  batchNumber: ['batchnumber', 'batch', 'batchno', 'lot', 'lotno'],
  expiry: ['expiry', 'expirydate', 'expdate', 'exp'],
  openingBoxes: ['openingboxes', 'boxes', 'stockboxes', 'qtyboxes'],
  openingStrips: ['openingstrips', 'strips', 'stockstrips', 'qtystrips'],
  openingUnits: ['openingunits', 'units', 'stockunits', 'qtyunits', 'loose', 'looseunits'],
};
const norm = (h) => String(h).toLowerCase().replace(/[^a-z0-9]/g, '');
const LOOKUP = Object.fromEntries(Object.entries(ALIASES).flatMap(([key, list]) => list.map((a) => [a, key])));

// rows[0] = headers. Returns { records: [{canonicalKey: value}], recognised: [...], ignored: [...] }
export function mapRows(rows) {
  const [head, ...body] = rows;
  const map = head.map((h) => LOOKUP[norm(h)] || null);
  const recognised = [...new Set(map.filter(Boolean))];
  const ignored = head.filter((_, i) => !map[i]).map((h) => h.trim()).filter(Boolean);
  const records = body.map((r) => Object.fromEntries(map.map((key, i) => [key, r[i] ?? '']).filter(([key]) => key)));
  return { records, recognised, ignored };
}

export const TEMPLATE_COLUMNS = ['name', 'genericName', 'category', 'manufacturer', 'barcode', 'supplier', 'stripsPerBox', 'unitsPerStrip', 'purchasePrice', 'salePriceBox', 'salePriceStrip', 'salePriceUnit', 'wholesalePriceBox', 'minStock', 'requiresPrescription', 'batchNumber', 'expiry', 'openingBoxes', 'openingStrips', 'openingUnits'];
export const TEMPLATE_SAMPLE = [
  { name: 'Panadol 500mg', genericName: 'Paracetamol', category: 'Tablet', manufacturer: 'GSK', barcode: '6001234567890', supplier: 'Al-Shifa Distributors', stripsPerBox: 10, unitsPerStrip: 10, purchasePrice: 200, salePriceBox: 245, salePriceStrip: 25, salePriceUnit: 2.5, wholesalePriceBox: 225, minStock: 100, requiresPrescription: 'no', batchNumber: 'PN2401', expiry: '2028-06', openingBoxes: 5, openingStrips: 3, openingUnits: 0 },
  { name: 'Calpol Syrup 60ml', genericName: 'Paracetamol', category: 'Syrup', manufacturer: 'GSK', barcode: '', supplier: '', stripsPerBox: 1, unitsPerStrip: 12, purchasePrice: 930, salePriceBox: 1120, salePriceStrip: '', salePriceUnit: 95, wholesalePriceBox: 1040, minStock: 12, requiresPrescription: 'no', batchNumber: 'CS7781', expiry: '2027-12-31', openingBoxes: 0, openingStrips: 0, openingUnits: 36 },
];
