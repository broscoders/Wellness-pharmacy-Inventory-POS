// Renders the real POS screen with the real catalog provider; only the network (fetch) is faked.
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, within, fireEvent, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider } from '@/context/AuthContext';
import { CatalogProvider } from '@/context/CatalogContext';
import PosPage from '@/app/(app)/pos/page';
import { clearCache, loadCache } from '@/lib/catalogDb';

const day = 86400000;
const med = (id, name, extra = {}) => ({
  _id: id, name, genericName: '', manufacturer: '', category: 'c1', barcode: '', stripsPerBox: 10, unitsPerStrip: 10,
  salePrice: { box: 0, strip: 25, unit: 0 }, wholesalePrice: { box: 0, strip: 0, unit: 0 }, minStockLevel: 0,
  requiresPrescription: false, pop: 0, batches: [[1000, Date.now() + 300 * day]], ...extra,
});
const CATALOG = [
  med('m1', 'Panadol 500mg', { genericName: 'Paracetamol', manufacturer: 'GSK', barcode: '8961000000001', pop: 40 }),
  med('m2', 'Calpol Syrup', { genericName: 'Paracetamol', salePrice: { box: 0, strip: 0, unit: 120 } }),
  med('m3', 'Brufen 400mg', { batches: [] }), // out of stock
  med('m4', 'Augmentin 625mg', { requiresPrescription: true, salePrice: { box: 0, strip: 640, unit: 0 } }),
];

let calls; let failNextSale; let saleBodies;
function installFetch() {
  calls = []; saleBodies = [];
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    calls.push(`${opts.method || 'GET'} ${u}`);
    const ok = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
    if (u.startsWith('/api/auth/refresh')) return ok({ accessToken: 't', user: { id: 'u1', name: 'Cashier', role: 'cashier', permissions: ['pos:use', 'medicines:view', 'sales:discount', 'prescriptions:view'] } });
    if (u.startsWith('/api/settings')) return ok({ data: {} });
    if (u.startsWith('/api/medicines/catalog')) return ok({ success: true, mode: 'full', serverTime: new Date().toISOString(), categories: [{ _id: 'c1', name: 'Tablet' }], removed: [], data: CATALOG });
    if (u.startsWith('/api/sales') && opts.method === 'POST') {
      const body = JSON.parse(opts.body); saleBodies.push(body);
      if (failNextSale) { failNextSale = false; throw new TypeError('network down'); }
      return ok({ success: true, data: { _id: 's1', invoiceNo: 'INV-000001', items: [], payments: body.payments, total: 0, subtotal: 0, createdAt: new Date().toISOString(), type: 'retail' } }, 201);
    }
    return ok({ success: true, data: [] });
  };
}

async function open() {
  const user = userEvent.setup();
  render(<AuthProvider><CatalogProvider><PosPage /></CatalogProvider></AuthProvider>);
  await screen.findByText(/\d+ medicines ready/);
  return user;
}
const searchBox = () => screen.getByLabelText('Search medicine');
const resultRows = () => within(screen.getByRole('listbox')).queryAllByRole('option'); // only the search results (selects also have options)
const searchCalls = () => calls.filter((c) => c.includes('/api/medicines') && !c.includes('/catalog')).length;

beforeEach(async () => { await clearCache(); failNextSale = false; installFetch(); });

describe('POS counter', () => {
  it('shows no medicine list until you search: only what you type or scan appears', async () => {
    await open();
    expect(resultRows()).toHaveLength(0);
    expect(screen.getByText('Type a medicine name or scan its barcode')).toBeInTheDocument();
    expect(screen.queryByRole('tab')).toBeNull(); // no category buttons either
    await userEvent.setup().type(searchBox(), 'pana');
    expect(within(screen.getByRole('listbox')).getAllByRole('option')).toHaveLength(1);
    expect(screen.queryByText('Type a medicine name or scan its barcode')).toBeNull();
  });

  it('search is instant and never calls the server', async () => {
    const user = await open();
    const before = searchCalls();
    await user.type(searchBox(), 'calp');
    expect(within(screen.getByRole('listbox')).getAllByRole('option')).toHaveLength(1);
    expect(screen.getByRole('option', { name: /Calpol Syrup/ })).toBeInTheDocument();
    expect(searchCalls()).toBe(before); // zero extra requests while typing
  });

  it('Enter asks how many for the highlighted medicine; arrow keys choose another', async () => {
    const user = userEvent.setup();
    await open();
    await user.type(searchBox(), 'paracetamol');     // Calpol Syrup, Panadol 500mg
    expect(within(screen.getByRole('listbox')).getAllByRole('option')[0]).toHaveTextContent('Calpol Syrup');
    await user.keyboard('{ArrowDown}{Enter}');       // the second one
    expect(await screen.findByTestId('ask-qty')).toHaveTextContent('Panadol 500mg');
    await user.keyboard('3{Enter}');                 // 3 goli
    expect(screen.getByLabelText('Quantity').closest('li')).toHaveTextContent('Panadol 500mg');
    expect(screen.getByLabelText('Quantity')).toHaveValue(3);
    expect(searchBox()).toHaveFocus();
    expect(searchBox()).toHaveValue('');
    expect(resultRows()).toHaveLength(0);            // ready for the next medicine
  });

  it('a scanned barcode adds the medicine on Enter', async () => {
    const user = userEvent.setup();
    await open();
    await user.type(searchBox(), '8961000000001{Enter}');
    const line = screen.getByLabelText('Quantity').closest('li');
    expect(line).toHaveTextContent('Panadol 500mg');
    expect(line).toHaveTextContent('x Rs 25 per strip');
    expect(within(line).getByLabelText('Unit')).toHaveValue('strip');
  });

  it('"3*pana" adds three at once and the total follows', async () => {
    const user = await open();
    await user.type(searchBox(), '3*pana{Enter}');
    expect(screen.getByLabelText('Quantity')).toHaveValue(3);
    expect(screen.getAllByText('Rs 75').length).toBeGreaterThan(0);
  });

  it('an out-of-stock medicine cannot be added and says why', async () => {
    const user = await open();
    await user.type(searchBox(), 'brufen{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent(/out of stock/i);
    expect(screen.queryByLabelText('Quantity')).toBeNull();
  });

  it('an unknown name shows a clear message', async () => {
    const user = await open();
    await user.type(searchBox(), 'zzzzzz{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent('No medicine found for "zzzzzz"');
  });

  it('F9 completes the sale with exact cash, stock drops on screen at once', async () => {
    const user = await open();
    await user.type(searchBox(), '2*pana{Enter}');
    await user.keyboard('{F9}');
    await screen.findByText('Sale completed');
    expect(saleBodies).toHaveLength(1);
    expect(saleBodies[0].payments).toEqual([{ method: 'cash', amount: 50 }]);
    expect(saleBodies[0].items).toEqual([{ medicine: 'm1', unitType: 'strip', quantity: 2 }]);
    expect(saleBodies[0].clientId).toMatch(/.{8,}/);
    await user.keyboard('{Enter}'); // Enter = new sale
    await waitFor(() => expect(screen.queryByText('Sale completed')).toBeNull());
    expect(screen.getByText(/Nothing on the bill yet/)).toBeInTheDocument();
    // 1000 units - 2 strips (20 units) = 980 units = 9 strips + 8 units + ... shown as box/strip/unit
    await user.type(searchBox(), 'pana');
    expect(within(screen.getByRole('listbox')).getAllByRole('option')[0]).toHaveTextContent('9 box, 8 strip');
  });

  it('a retry after a network failure sends the SAME bill key (no double billing)', async () => {
    const user = await open();
    await user.type(searchBox(), '1*pana{Enter}');
    failNextSale = true;
    await user.keyboard('{F9}');
    expect(await screen.findByRole('alert')).toHaveTextContent(/Cannot reach the server/);
    await user.keyboard('{F9}');
    await screen.findByText('Sale completed');
    expect(saleBodies).toHaveLength(2);
    expect(saleBodies[1].clientId).toBe(saleBodies[0].clientId);
  });

  it('changing the bill after a failed attempt gets a NEW key', async () => {
    const user = await open();
    await user.type(searchBox(), '1*pana{Enter}');
    failNextSale = true;
    await user.keyboard('{F9}');
    await screen.findByRole('alert');
    await user.type(searchBox(), '1*pana{Enter}'); // one more pack on the bill
    await user.keyboard('{F9}');
    await screen.findByText('Sale completed');
    expect(saleBodies[1].clientId).not.toBe(saleBodies[0].clientId);
    expect(saleBodies[1].items[0].quantity).toBe(2);
  });

  it('udhaar needs a customer; change is shown for cash over the total', async () => {
    const user = await open();
    await user.type(searchBox(), '1*pana{Enter}');
    await user.type(screen.getByLabelText('Cash received'), '100');
    expect(screen.getByText(/Change to give back/)).toHaveTextContent('Rs 75');
    await user.clear(screen.getByLabelText('Cash received'));
    await user.click(screen.getByRole('button', { name: 'Card / Bank / Udhaar' })); // these boxes are tucked away until needed
    await user.type(screen.getByLabelText('Udhaar'), '25');
    expect(screen.getByText(/Choose a customer to record udhaar/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Complete sale/ })).toBeDisabled();
  });

  it('prescription medicines block the sale until the check box is ticked', async () => {
    const user = await open();
    await user.type(searchBox(), '1*augm{Enter}');
    expect(screen.getByRole('button', { name: /Complete sale/ })).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: /checked the prescription/ }));
    expect(screen.getByRole('button', { name: /Complete sale/ })).toBeEnabled();
  });

  it('the discount box takes a percent: typing 10 gives 10% off, and it shows the amount', async () => {
    const user = userEvent.setup();
    await open();
    await user.type(searchBox(), '4*pana{Enter}'); // Rs 100
    await user.type(screen.getByLabelText('Discount percent'), '10');
    expect(screen.getAllByText('Rs 90').length).toBeGreaterThan(0);
    expect(screen.getByText('= Rs 10')).toBeInTheDocument();
  });

  it('typing 2 means 2%, not Rs 2', async () => {
    const user = userEvent.setup();
    await open();
    await user.type(searchBox(), '40*pana{Enter}'); // Rs 1,000
    await user.type(screen.getByLabelText('Discount percent'), '2');
    expect(screen.getAllByText('Rs 980').length).toBeGreaterThan(0); // 2% of 1,000 = 20
    expect(screen.getByText('= Rs 20')).toBeInTheDocument();
  });

  it('card / bank / udhaar boxes stay hidden until asked for, and open by themselves once used', async () => {
    const user = userEvent.setup();
    await open();
    await user.type(searchBox(), '1*pana{Enter}');
    expect(screen.queryByText('Bank')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Card / Bank / Udhaar' }));
    expect(screen.getByText('Bank')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Bank'), '10');
    expect(screen.getByRole('button', { name: 'Hide' })).toBeInTheDocument();
  });

  it('opens from the saved copy when the server is unreachable', async () => {
    await open(); // first visit saves the catalog
    await waitFor(async () => expect(await loadCache()).not.toBeNull(), { timeout: 4000 }); // the save is debounced
    cleanup();
    globalThis.fetch = async (url) => { if (String(url).startsWith('/api/auth/refresh')) return { ok: true, status: 200, json: async () => ({ accessToken: 't', user: { id: 'u1', name: 'C', role: 'cashier', permissions: ['pos:use', 'medicines:view'] } }) }; throw new TypeError('offline'); };
    render(<AuthProvider><CatalogProvider><PosPage /></CatalogProvider></AuthProvider>);
    expect(await screen.findByText(/using the saved list/)).toBeInTheDocument();
    await user_type_check();
  });
});

async function user_type_check() {
  const user = userEvent.setup();
  await user.type(searchBox(), 'pana');
  expect(within(screen.getByRole('listbox')).getAllByRole('option')).toHaveLength(1);
}

describe('substitutes', () => {
  it('an out-of-stock medicine offers in-stock brands of the same generic', async () => {
    const user = userEvent.setup();
    CATALOG.push(med('m5', 'Ibugesic 400mg', { genericName: 'Ibuprofen' }), med('m6', 'Old Ibu 200mg', { genericName: 'Ibuprofen', batches: [] }));
    CATALOG[2].genericName = 'Ibuprofen';
    try {
      render(<AuthProvider><CatalogProvider><PosPage /></CatalogProvider></AuthProvider>);
      await screen.findByText(/medicines ready/);
      await user.type(searchBox(), 'brufen{Enter}');
      expect(await screen.findByText(/is not available/)).toBeInTheDocument();
      const opts = within(screen.getByRole('listbox')).getAllByRole('option');
      expect(opts).toHaveLength(1);
      expect(opts[0]).toHaveTextContent('Ibugesic 400mg');
      expect(opts[0]).toHaveTextContent('Same strength');
      await user.keyboard('{Enter}'); // Enter takes the highlighted alternative and asks how many
      expect(await screen.findByTestId('ask-qty')).toHaveTextContent('Ibugesic 400mg');
      await user.keyboard('1{Enter}');
      expect(screen.getByLabelText('Quantity')).toHaveValue(1);
      expect(screen.queryByText(/is not available/)).toBeNull();
    } finally { CATALOG.length = 4; CATALOG[2].genericName = ''; }
  });
});

describe('bill table', () => {
  it('shows the whole medicine name with its unit, quantity, rate and amount', async () => {
    const user = userEvent.setup();
    CATALOG.push(med('m9', 'Dexamethasone 4mg Injection With A Very Long Name 100 Vials Pack', { genericName: 'Dexamethasone', manufacturer: 'Generic Pharma' }));
    try {
      await open();
      await user.type(searchBox(), '1*dexameth{Enter}');
      expect(screen.getByText('Medicine, unit, quantity, rate')).toBeInTheDocument();
      const name = screen.getAllByText(/Very Long Name 100 Vials Pack/).find((el) => el.closest('li') && !el.closest('[role="listbox"]'));
      expect(name).toBeTruthy();
      expect(name.className).not.toMatch(/truncate/); // never cut short on the bill
      const line = name.closest('li');
      expect(line).toHaveTextContent('Dexamethasone | Generic Pharma');
      expect(line).toHaveTextContent('x Rs 25 per strip');
      expect(within(line).getByLabelText('Unit')).toHaveValue('strip');
      expect(within(line).getByLabelText('Quantity')).toHaveValue(1);
    } finally { CATALOG.length = 4; }
  });
});

describe('shelf location', () => {
  it('shows rack/row/side on the list and the bill, and finds medicines by rack', async () => {
    const user = userEvent.setup();
    Object.assign(CATALOG[1], { rack: 'C', row: '2', side: 'Left', storage: 'fridge' });
    try {
      render(<AuthProvider><CatalogProvider><PosPage /></CatalogProvider></AuthProvider>);
      await screen.findByText(/medicines ready/);
      await user.type(searchBox(), 'rack c');
      const opts = within(screen.getByRole('listbox')).getAllByRole('option');
      expect(opts[0]).toHaveTextContent('Calpol Syrup');
      expect(opts[0]).toHaveTextContent('Rack C | Row 2 | Left');
      expect(opts[0]).toHaveTextContent('Fridge');
      await user.keyboard('{Enter}');
      await user.keyboard('1{Enter}');                                            // 1 goli
      expect(screen.getByText(/Keep in fridge/)).toBeInTheDocument(); // the bill line reminds where it is and how to store it
    } finally { for (const k of ['rack', 'row', 'side']) CATALOG[1][k] = ''; CATALOG[1].storage = 'room'; }
  });
});

describe('keyboard only (no mouse needed)', () => {
  const options = () => within(screen.getByRole('listbox')).getAllByRole('option');
  const rowButton = (i) => within(options()[i]).getAllByRole('button')[0]; // the pointer events belong to the button inside the row

  it('Up/Down then Enter chooses a result without touching the mouse', async () => {
    const user = userEvent.setup();
    await open();
    await user.type(searchBox(), 'mg');                      // Augmentin 625mg, Brufen 400mg, Panadol 500mg
    expect(options()).toHaveLength(3);
    expect(options()[0]).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowUp}'); // ends on the second row
    expect(options()[1]).toHaveAttribute('aria-selected', 'true');
  });

  it('a mouse resting over the list does not steal the highlight from the arrow keys', async () => {
    const user = userEvent.setup();
    await open();
    await user.type(searchBox(), 'mg');
    fireEvent.mouseMove(rowButton(2), { screenX: 10, screenY: 10 });   // the pointer really moves onto the last row
    expect(options()[2]).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{ArrowUp}');
    expect(options()[1]).toHaveAttribute('aria-selected', 'true');
    fireEvent.mouseMove(rowButton(2), { screenX: 10, screenY: 10 });   // the browser repeats the event when the list scrolls under a still pointer
    expect(options()[1]).toHaveAttribute('aria-selected', 'true');     // keyboard choice stays
    fireEvent.mouseMove(rowButton(0), { screenX: 80, screenY: 40 });   // a real movement does move it
    expect(options()[0]).toHaveAttribute('aria-selected', 'true');
  });

  it('typing anywhere starts a search, even after clicking a button', async () => {
    const user = userEvent.setup();
    await open();
    await user.click(screen.getByRole('button', { name: 'Reload medicine list' }));
    expect(document.activeElement).not.toBe(searchBox());
    await user.keyboard('pana');
    expect(searchBox()).toHaveValue('pana');
    expect(options()[0]).toHaveTextContent('Panadol 500mg');
    await user.keyboard('{Enter}');
    expect(await screen.findByTestId('ask-qty')).toHaveTextContent('Panadol 500mg');
  });

  it('Ctrl+Enter completes the sale (for laptops where F9 needs the Fn key)', async () => {
    const user = userEvent.setup();
    await open();
    await user.type(searchBox(), '1*pana{Enter}');
    await user.keyboard('{Control>}{Enter}{/Control}');
    await screen.findByText('Sale completed');
    expect(saleBodies).toHaveLength(1);
  });

  it('F9 never fails silently: it says why the bill cannot be completed', async () => {
    const user = userEvent.setup();
    await open();
    await user.keyboard('{F9}');
    expect(await screen.findByRole('alert')).toHaveTextContent('Add a medicine to the bill first');
    await user.type(searchBox(), '1*augm{Enter}');                      // a prescription medicine
    expect(screen.getByText(/Tick "I have checked the prescription"/)).toBeInTheDocument(); // visible before pressing anything
    await user.keyboard('{F9}');
    expect(await screen.findByRole('alert')).toHaveTextContent(/prescription/);
    expect(saleBodies).toHaveLength(0);
    await user.click(screen.getByRole('checkbox', { name: /checked the prescription/ }));
    await user.keyboard('{F9}');
    await screen.findByText('Sale completed');
    expect(saleBodies).toHaveLength(1);
  });
});

describe('choosing box, strip or tablet right in the search result', () => {
  const stuff = () => {
    CATALOG.push(
      med('t1', 'Unit Test Tabs', { genericName: 'Testamol', dosageForm: 'Tablet', salePrice: { box: 245, strip: 25, unit: 3 } }),
      med('t2', 'Single Bottle Syrup', { genericName: 'Syrupmol', stripsPerBox: 1, unitsPerStrip: 1, dosageForm: 'Syrup', salePrice: { box: 0, strip: 0, unit: 120 } }),
    );
  };
  const cleanup = () => { CATALOG.length = 4; };

  it('every result shows a button per unit with that unit\'s own price', async () => {
    stuff();
    try {
      const user = userEvent.setup();
      await open();
      await user.type(searchBox(), 'unit test');
      const row = within(screen.getByRole('listbox')).getAllByRole('option')[0];
      expect(within(row).getByRole('button', { name: /Box.*Rs 245/ })).toBeInTheDocument();
      expect(within(row).getByRole('button', { name: /Strip.*Rs 25/ })).toBeInTheDocument();
      expect(within(row).getByRole('button', { name: /Tablet.*Rs 3/ })).toBeInTheDocument(); // "Tablet" because it is a tablet
      expect(within(row).getByRole('button', { name: /Strip \(patta\).*Rs 25/ })).toBeInTheDocument();  // the words counter staff use
      expect(within(row).getByRole('button', { name: /Tablet \(goli\).*Rs 3/ })).toBeInTheDocument();
    } finally { cleanup(); }
  });

  it('pressing Tablet adds ONE tablet at the tablet price; Box adds a box; Shift+Enter adds the usual strip', async () => {
    stuff();
    try {
      const user = userEvent.setup();
      await open();
      await user.type(searchBox(), 'unit test');
      await user.click(within(resultRows()[0]).getByRole('button', { name: /Tablet/ }));
      let line = screen.getByLabelText('Quantity').closest('li');
      expect(within(line).getByLabelText('Unit')).toHaveValue('unit');
      expect(line).toHaveTextContent('x Rs 3 per tablet');
      expect(line).toHaveTextContent('Rs 3');
      expect(resultRows()).toHaveLength(0); // the list closes after choosing

      await user.type(searchBox(), 'unit test');
      await user.click(within(resultRows()[0]).getByRole('button', { name: /Box/ }));
      await user.type(searchBox(), '1*unit test{Enter}');           // Enter = the usual unit
      const units = screen.getAllByLabelText('Unit').map((el) => el.value);
      expect(units).toEqual(['unit', 'box', 'strip']);             // three separate lines, one per unit
      expect(screen.getAllByText('Rs 245').length).toBeGreaterThan(0);
    } finally { cleanup(); }
  });

  it('"10t*unit test" gives 10 tablets in one go (price 10 x 3)', async () => {
    stuff();
    try {
      const user = userEvent.setup();
      await open();
      await user.type(searchBox(), '10t*unit test');
      expect(screen.getByText('Qty 10 loose')).toBeInTheDocument();
      await user.keyboard('{Enter}');
      const line = screen.getByLabelText('Quantity').closest('li');
      expect(within(line).getByLabelText('Unit')).toHaveValue('unit');
      expect(screen.getByLabelText('Quantity')).toHaveValue(10);
      expect(screen.getAllByText('Rs 30').length).toBeGreaterThan(0);
    } finally { cleanup(); }
  });

  it('a single bottle only offers Unit (no pointless Box / Strip buttons)', async () => {
    stuff();
    try {
      const user = userEvent.setup();
      await open();
      await user.type(searchBox(), 'single bottle');
      const row = resultRows()[0];
      const unitButtons = within(within(row).getByRole('group', { name: /Choose unit/ })).getAllByRole('button');
      expect(unitButtons).toHaveLength(1); // only "Unit"
      expect(within(row).getByRole('button', { name: /Unit.*Rs 120/ })).toBeInTheDocument();
      await user.keyboard('{Enter}');                       // one unit only, so a single question
      expect(await screen.findByTestId('ask-qty')).toHaveTextContent('How many Unit?');
      await user.keyboard('2{Enter}');
      expect(within(screen.getByLabelText('Quantity').closest('li')).getByLabelText('Unit')).toHaveValue('unit');
      expect(screen.getByLabelText('Quantity')).toHaveValue(2);
    } finally { cleanup(); }
  });
});

describe('how many: set the quantity on the result before choosing the unit', () => {
  const add = () => CATALOG.push(med('q1', 'Qty Test Tabs', { genericName: 'Qtymol', dosageForm: 'Tablet', salePrice: { box: 245, strip: 25, unit: 3 } }));
  const row = () => within(screen.getByRole('listbox')).getAllByRole('option')[0];

  it('2 tablets (goli): set 2, press Tablet -> 2 x Rs 3', async () => {
    add();
    try {
      const user = userEvent.setup();
      await open();
      await user.type(searchBox(), 'qty test');
      const qty = within(row()).getByLabelText('Quantity to add of Qty Test Tabs');
      expect(qty).toHaveValue(1);
      await user.clear(qty); await user.type(qty, '2');
      await user.click(within(row()).getByRole('button', { name: /Tablet \(goli\)/ }));
      const line = screen.getByLabelText('Quantity').closest('li');
      expect(screen.getByLabelText('Quantity')).toHaveValue(2);
      expect(within(line).getByLabelText('Unit')).toHaveValue('unit');
      expect(line).toHaveTextContent('Rs 6');            // 2 x Rs 3
    } finally { CATALOG.length = 4; }
  });

  it('3 strips (patta) with the + button, and the next medicine starts again at 1', async () => {
    add();
    try {
      const user = userEvent.setup();
      await open();
      await user.type(searchBox(), 'qty test');
      await user.click(within(row()).getByRole('button', { name: 'More Qty Test Tabs' }));
      await user.click(within(row()).getByRole('button', { name: 'More Qty Test Tabs' }));
      expect(within(row()).getByLabelText('Quantity to add of Qty Test Tabs')).toHaveValue(3);
      await user.click(within(row()).getByRole('button', { name: /Strip \(patta\)/ }));
      expect(screen.getByLabelText('Quantity')).toHaveValue(3);
      expect(screen.getByLabelText('Quantity').closest('li')).toHaveTextContent('Rs 75'); // 3 x Rs 25
      await user.type(searchBox(), 'qty test');
      expect(within(row()).getByLabelText('Quantity to add of Qty Test Tabs')).toHaveValue(1);
    } finally { CATALOG.length = 4; }
  });

  it('a typed "5*" prefills the quantity on the results and adds at once', async () => {
    add();
    try {
      const user = userEvent.setup();
      await open();
      await user.type(searchBox(), '5*qty test');
      expect(within(row()).getByLabelText('Quantity to add of Qty Test Tabs')).toHaveValue(5);
      await user.keyboard('{Enter}');
      expect(screen.getByLabelText('Quantity')).toHaveValue(5);
    } finally { CATALOG.length = 4; }
  });

  it('a quantity set on the row also applies to Shift+Enter in the search box', async () => {
    add();
    try {
      const user = userEvent.setup();
      await open();
      await user.type(searchBox(), 'qty test');
      await user.click(within(row()).getByRole('button', { name: 'More Qty Test Tabs' }));
      searchBox().focus();
      await user.keyboard('{Shift>}{Enter}{/Shift}');             // Shift+Enter = the usual strip, right now
      expect(screen.getByLabelText('Quantity')).toHaveValue(2);
    } finally { CATALOG.length = 4; }
  });
});


describe('quantity boxes can be cleared and retyped', () => {
  it('on the bill line: clear, type 2 gives 2 (not 12)', async () => {
    const user = userEvent.setup();
    await open();
    await user.type(searchBox(), '1*pana{Enter}');
    const qty = screen.getByLabelText('Quantity');
    await user.clear(qty);
    await user.type(qty, '2');
    expect(qty).toHaveValue(2);
    expect(screen.getAllByText('Rs 50').length).toBeGreaterThan(0);
    await user.clear(qty);
    await user.tab();                    // leaving it empty puts the real quantity back
    expect(qty).toHaveValue(2);
  });
});

describe('the keyboard questions after Enter: goli, then patta, then box', () => {
  const addTabs = () => CATALOG.push(med('w1', 'Wizard Tabs', { genericName: 'Wizamol', dosageForm: 'Tablet', salePrice: { box: 245, strip: 25, unit: 3 } }));
  const ask = () => screen.getByTestId('ask-qty');
  const start = async (user) => { await user.type(searchBox(), 'wizard'); await user.keyboard('{Enter}'); await screen.findByTestId('ask-qty'); };
  const lineUnits = () => screen.queryAllByLabelText('Unit').map((el) => el.value);

  it('asks for goli first; a number then Enter adds exactly that many goli', async () => {
    addTabs();
    try {
      const user = userEvent.setup();
      await open();
      await start(user);
      expect(ask()).toHaveTextContent('How many Tablet (goli)?');
      expect(screen.getByLabelText('How many Tablet (goli)')).toHaveFocus();     // typing needs no click
      await user.keyboard('10');
      expect(ask()).toHaveTextContent('10 x Rs 3 = Rs 30');                    // the price follows while typing
      await user.keyboard('{Enter}');
      expect(screen.queryByTestId('ask-qty')).toBeNull();
      expect(lineUnits()).toEqual(['unit']);
      expect(screen.getByLabelText('Quantity')).toHaveValue(10);
      expect(searchBox()).toHaveFocus();
    } finally { CATALOG.length = 4; }
  });

  it('Up key adds one: Up, Up, Enter = 2 goli', async () => {
    addTabs();
    try {
      const user = userEvent.setup();
      await open();
      await start(user);
      await user.keyboard('{ArrowUp}{ArrowUp}{ArrowUp}{ArrowDown}');          // 3 up, 1 down = 2
      expect(screen.getByLabelText('How many Tablet (goli)')).toHaveValue('2');
      await user.keyboard('{Enter}');
      expect(screen.getByLabelText('Quantity')).toHaveValue(2);
      expect(screen.getAllByText('Rs 6').length).toBeGreaterThan(0);
    } finally { CATALOG.length = 4; }
  });

  it('leaving 0 and pressing Enter asks about patta; a 1 then Enter gives one strip', async () => {
    addTabs();
    try {
      const user = userEvent.setup();
      await open();
      await start(user);
      await user.keyboard('{Enter}');                                          // 0 goli -> next
      expect(ask()).toHaveTextContent('How many Strip (patta)?');
      await user.keyboard('{ArrowUp}{Enter}');
      expect(lineUnits()).toEqual(['strip']);
      expect(screen.getByLabelText('Quantity')).toHaveValue(1);
      expect(screen.getAllByText('Rs 25').length).toBeGreaterThan(0);
    } finally { CATALOG.length = 4; }
  });

  it('0, 0 and then a number gives whole boxes (1, 2, 3...)', async () => {
    addTabs();
    try {
      const user = userEvent.setup();
      await open();
      await start(user);
      await user.keyboard('{Enter}{Enter}');                                   // skip goli, skip patta
      expect(ask()).toHaveTextContent('How many Box?');
      await user.keyboard('2{Enter}');
      expect(lineUnits()).toEqual(['box']);
      expect(screen.getByLabelText('Quantity')).toHaveValue(2);
      expect(screen.getAllByText('Rs 490').length).toBeGreaterThan(0);        // 2 x Rs 245
    } finally { CATALOG.length = 4; }
  });

  it('zero all the way, or Esc, adds nothing and returns to the search', async () => {
    addTabs();
    try {
      const user = userEvent.setup();
      await open();
      await start(user);
      await user.keyboard('{Enter}{Enter}{Enter}');                            // goli 0, patta 0, box 0
      expect(screen.queryByTestId('ask-qty')).toBeNull();
      expect(lineUnits()).toEqual([]);
      expect(searchBox()).toHaveFocus();
      expect(searchBox()).toHaveValue('wizard');                               // the search is still there for another try
      await user.keyboard('{Enter}');
      await screen.findByTestId('ask-qty');
      await user.keyboard('{Escape}');
      expect(screen.queryByTestId('ask-qty')).toBeNull();
      expect(searchBox()).toHaveFocus();
    } finally { CATALOG.length = 4; }
  });

  it('Left / Right go back and forward between goli, patta and box', async () => {
    addTabs();
    try {
      const user = userEvent.setup();
      await open();
      await start(user);
      await user.keyboard('{ArrowRight}{ArrowRight}');
      expect(ask()).toHaveTextContent('How many Box?');
      await user.keyboard('{ArrowLeft}');
      expect(ask()).toHaveTextContent('How many Strip (patta)?');
    } finally { CATALOG.length = 4; }
  });

  it('refuses more than the shop has, and says how much is available', async () => {
    addTabs();
    try {
      const user = userEvent.setup();
      await open();
      await start(user);
      await user.keyboard('9999{Enter}');                                      // only 1,000 goli exist
      expect(await screen.findByRole('alert')).toHaveTextContent(/Only .* available/);
      expect(lineUnits()).toEqual([]);
      expect(ask()).toBeInTheDocument();                                       // still asking, so it can be corrected
    } finally { CATALOG.length = 4; }
  });

  it('counts what is already on the bill: two lines cannot add up to more than the stock', async () => {
    addTabs();
    try {
      const user = userEvent.setup();
      await open();
      await user.type(searchBox(), '9b*wizard{Enter}');                        // 9 boxes = 900 of the 1,000 goli in stock
      await user.type(searchBox(), 'wizard');
      await user.keyboard('{Enter}');
      await user.keyboard('101{Enter}');                                       // 101 more goli: only 100 are left
      expect(await screen.findByRole('alert')).toHaveTextContent(/Only .* available/);
      expect(ask()).toBeInTheDocument();
      await user.keyboard('{Backspace}0{Enter}');                              // 100 goli is exactly what is left
      expect(lineUnits().sort()).toEqual(['box', 'unit']);
    } finally { CATALOG.length = 4; }
  });

  it('Shift+Enter skips the questions and adds one usual strip', async () => {
    addTabs();
    try {
      const user = userEvent.setup();
      await open();
      await user.type(searchBox(), 'wizard');
      await user.keyboard('{Shift>}{Enter}{/Shift}');
      expect(screen.queryByTestId('ask-qty')).toBeNull();
      expect(lineUnits()).toEqual(['strip']);
    } finally { CATALOG.length = 4; }
  });

  it('a medicine with no strips (a single bottle) asks one question only', async () => {
    CATALOG.push(med('w2', 'Wizard Syrup', { stripsPerBox: 1, unitsPerStrip: 1, dosageForm: 'Syrup', salePrice: { box: 0, strip: 0, unit: 120 } }));
    try {
      const user = userEvent.setup();
      await open();
      await user.type(searchBox(), 'wizard syrup');
      await user.keyboard('{Enter}');
      expect(ask()).toHaveTextContent('How many Unit?');
      await user.keyboard('{Enter}');                                          // 0 and nothing else to ask: nothing added
      expect(screen.queryByTestId('ask-qty')).toBeNull();
      expect(lineUnits()).toEqual([]);
    } finally { CATALOG.length = 4; }
  });

  it('the mouse still works: pressing a unit button adds it at once, without any question', async () => {
    addTabs();
    try {
      const user = userEvent.setup();
      await open();
      await user.type(searchBox(), 'wizard');
      await user.click(within(resultRows()[0]).getByRole('button', { name: /Strip \(patta\)/ }));
      expect(screen.queryByTestId('ask-qty')).toBeNull();
      expect(lineUnits()).toEqual(['strip']);
    } finally { CATALOG.length = 4; }
  });
});

