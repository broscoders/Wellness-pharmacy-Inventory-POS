import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('next/navigation', () => ({ usePathname: () => '/medicines', useRouter: () => ({ replace: () => {}, push: () => {} }) }));
vi.mock('next/link', () => ({ default: ({ href, children, ...p }) => <a href={href} {...p}>{children}</a> }));

import { AuthProvider } from '@/context/AuthContext';
import MedicinesPage from '@/app/(app)/medicines/page';

const OWNER = ['medicines:view', 'medicines:manage', 'costs:view', 'inventory:view', 'inventory:manage'];
const PHARMACIST = ['medicines:view', 'medicines:manage', 'inventory:view', 'inventory:manage'];
const existing = { _id: 'm1', name: 'Existing Tabs', genericName: 'Existamol', stripsPerBox: 10, unitsPerStrip: 10, purchasePrice: 200, salePrice: { box: 245, strip: 25, unit: 0 }, wholesalePrice: {}, minStockLevel: 40, maxStockLevel: 0, mrp: 260, isActive: true, stock: { total: 0, sellable: 0, display: { box: 0, strip: 0, unit: 0 } } };
let perms; let posts; let advice; let levelsRows;

beforeEach(() => {
  perms = OWNER; posts = []; advice = { windowDays: 60, leadDays: 7, coverDays: 30, sold: 120, suggestion: { perDay: 2, min: 20, max: 60 } };
  levelsRows = [
    { _id: 'a', name: 'Fast Mover', sold: 240, perDay: 4, current: { min: 10, max: 0, minDisplay: { box: 0, strip: 1, unit: 0 }, maxDisplay: { box: 0, strip: 0, unit: 0 } }, suggested: { min: 30, max: 120, minDisplay: { box: 0, strip: 3, unit: 0 }, maxDisplay: { box: 1, strip: 2, unit: 0 } }, changed: true },
    { _id: 'b', name: 'Already Right', sold: 60, perDay: 1, current: { min: 10, max: 40, minDisplay: { box: 0, strip: 1, unit: 0 }, maxDisplay: { box: 0, strip: 4, unit: 0 } }, suggested: { min: 10, max: 40, minDisplay: { box: 0, strip: 1, unit: 0 }, maxDisplay: { box: 0, strip: 4, unit: 0 } }, changed: false },
  ];
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url); const ok = (b, s = 200) => ({ ok: s < 400, status: s, json: async () => b });
    if (u.startsWith('/api/auth/refresh')) return ok({ accessToken: 't', user: { id: 'u', name: 'Owner', role: 'admin', permissions: perms } });
    if (u.startsWith('/api/settings')) return ok({ data: {} });
    if (u.startsWith('/api/medicines/filters')) return ok({ categories: [], manufacturers: [] });
    if (u === '/api/medicines/levels' && opts.method === 'POST') { posts.push(['levels', JSON.parse(opts.body)]); return ok({ applied: 1 }); }
    if (u === '/api/medicines/levels') return ok({ windowDays: 60, leadDays: 7, coverDays: 30, data: levelsRows });
    if (u.startsWith('/api/medicines/m1/stock-advice')) return ok(advice);
    if (u === '/api/medicines' && opts.method === 'POST') { posts.push(['create', JSON.parse(opts.body)]); return ok({ data: {} }, 201); }
    if (u.startsWith('/api/medicines/m1') && opts.method === 'PATCH') { posts.push(['update', JSON.parse(opts.body)]); return ok({ data: {} }); }
    if (u.startsWith('/api/medicines')) return ok({ data: [existing], meta: { total: 1, page: 1, pages: 1 } });
    return ok({ data: [] });
  };
});

const openNew = async (user) => {
  render(<AuthProvider><MedicinesPage /></AuthProvider>);
  await user.click(await screen.findByRole('button', { name: /Add medicine/ }));
  return screen.findByRole('dialog');
};
const openEdit = async (user) => {
  render(<AuthProvider><MedicinesPage /></AuthProvider>);
  await user.click(await screen.findByRole('button', { name: /Edit/ }));
  return screen.findByRole('dialog');
};
const field = (d, label) => within(d).getByLabelText(label);

describe('automatic prices in the medicine form', () => {
  it('strip and tablet prices follow the box price until you type your own', async () => {
    const user = userEvent.setup();
    const d = await openNew(user);
    await user.type(field(d, /Sale price per box/), '245');
    expect(field(d, /Sale price per strip/)).toHaveValue(24.5);          // 245 / 10 strips
    expect(field(d, /Sale price per tablet/)).toHaveValue(2.45);         // 245 / 100 tablets
    expect(within(d).getAllByText(/Automatic: box price divided/).length).toBe(2);

    await user.clear(field(d, /Sale price per strip/));
    await user.type(field(d, /Sale price per strip/), '25');             // the shop sells a strip at a round Rs 25
    await user.clear(field(d, /Sale price per box/));
    await user.type(field(d, /Sale price per box/), '250');
    expect(field(d, /Sale price per strip/)).toHaveValue(25);            // stays: it is no longer automatic
    expect(field(d, /Sale price per tablet/)).toHaveValue(2.5);          // still follows the box
    await user.clear(field(d, /Sale price per strip/));                  // emptying it to type something else must not be fought by the formula
    expect(field(d, /Sale price per strip/)).toHaveValue(null);
    await user.tab();                                                    // leaving it empty hands control back to the formula
    expect(field(d, /Sale price per strip/)).toHaveValue(25);            // 250 / 10
  });

  it('changing the pack changes the automatic prices and the pack sentence', async () => {
    const user = userEvent.setup();
    const d = await openNew(user);
    expect(within(d).getByTestId('pack-text')).toHaveTextContent('1 box = 10 strips = 100 tablets');   // the usual pack is pre-filled
    await user.type(field(d, /Sale price per box/), '200');
    expect(field(d, /Sale price per strip/)).toHaveValue(20);
    await user.clear(field(d, /Strips in 1 box/)); await user.type(field(d, /Strips in 1 box/), '5');
    expect(field(d, /Sale price per strip/)).toHaveValue(40);            // 200 / 5
    expect(field(d, /Sale price per tablet/)).toHaveValue(4);            // 200 / 50
  });

  it('set the price from a profit margin: 20% on a Rs 400 box is Rs 500', async () => {
    const user = userEvent.setup();
    const d = await openNew(user);
    await user.type(field(d, /Purchase price/), '400');
    expect(within(d).getByRole('button', { name: 'Set box price' })).toBeDisabled();
    await user.type(field(d, /Set price from profit margin/), '20');
    await user.click(within(d).getByRole('button', { name: 'Set box price' }));
    expect(field(d, /Sale price per box/)).toHaveValue(500);
    expect(within(d).getByText(/Box price set to 500 \(margin 20%\)/)).toBeInTheDocument();
  });

  it('the margin price is never above the MRP', async () => {
    const user = userEvent.setup();
    const d = await openNew(user);
    await user.type(field(d, /Purchase price/), '400');
    await user.type(field(d, /MRP/), '480');
    await user.type(field(d, /Set price from profit margin/), '20');
    await user.click(within(d).getByRole('button', { name: 'Set box price' }));
    expect(field(d, /Sale price per box/)).toHaveValue(480);
    expect(within(d).getByText(/Limited to the MRP \(480\)/)).toBeInTheDocument();
  });

  it('Sell at MRP fills the box price (and the strip price follows)', async () => {
    const user = userEvent.setup();
    const d = await openNew(user);
    await user.type(field(d, /MRP/), '600');
    await user.click(within(d).getByRole('button', { name: /Sell at MRP \(600\)/ }));
    expect(field(d, /Sale price per box/)).toHaveValue(600);
    expect(field(d, /Sale price per strip/)).toHaveValue(60);
  });

  it('staff who cannot see costs get no margin tool, but can still sell at MRP', async () => {
    perms = PHARMACIST;
    const user = userEvent.setup();
    const d = await openNew(user);
    expect(within(d).queryByLabelText(/Set price from profit margin/)).toBeNull();
    expect(within(d).queryByLabelText(/Purchase price/)).toBeNull();
    await user.type(field(d, /MRP/), '300');
    expect(within(d).getByRole('button', { name: /Sell at MRP \(300\)/ })).toBeInTheDocument();
  });
});

describe('minimum and maximum stock', () => {
  it('a maximum below the minimum is refused with a clear message', async () => {
    const user = userEvent.setup();
    const d = await openNew(user);
    await user.type(field(d, /Medicine name/), 'Level Test');
    await user.clear(field(d, /Minimum stock/)); await user.type(field(d, /Minimum stock/), '100');
    await user.type(field(d, /Maximum stock/), '50');
    expect(within(d).getByRole('alert')).toHaveTextContent('The maximum cannot be lower than the minimum');
    expect(within(d).getByRole('button', { name: 'Save' })).toBeDisabled();
    await user.clear(field(d, /Maximum stock/)); await user.type(field(d, /Maximum stock/), '400');
    expect(within(d).queryByRole('alert')).toBeNull();
    expect(within(d).getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('shows the levels as boxes and strips, and saves both', async () => {
    const user = userEvent.setup();
    const d = await openNew(user);
    await user.type(field(d, /Medicine name/), 'Level Test');
    await user.clear(field(d, /Minimum stock/)); await user.type(field(d, /Minimum stock/), '120');
    await user.type(field(d, /Maximum stock/), '400');
    expect(within(d).getByText(/Minimum = 1 box, 2 strip/)).toBeInTheDocument();     // 120 tablets
    expect(within(d).getByText(/Maximum = 4 box/)).toBeInTheDocument();              // 400 tablets
    await user.click(within(d).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(posts.length).toBe(1));
    expect(posts[0][1]).toMatchObject({ name: 'Level Test', minStockLevel: 120, maxStockLevel: 400 });
  });

  it('"Suggest from my sales" shows real numbers and "Use these" fills the boxes', async () => {
    const user = userEvent.setup();
    const d = await openEdit(user);
    await user.click(within(d).getByRole('button', { name: 'Suggest from my sales' }));
    expect(await within(d).findByText(/It sells about/)).toHaveTextContent('2 a day');
    await user.click(within(d).getByRole('button', { name: 'Use these' }));
    expect(field(d, /Minimum stock/)).toHaveValue(20);
    expect(field(d, /Maximum stock/)).toHaveValue(60);
    await user.click(within(d).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(posts.length).toBe(1));
    expect(posts[0]).toEqual(['update', expect.objectContaining({ minStockLevel: 20, maxStockLevel: 60 })]);
  });

  it('says so honestly when there are no sales to base advice on', async () => {
    advice = { windowDays: 60, leadDays: 7, coverDays: 30, sold: 0, suggestion: null };
    const user = userEvent.setup();
    const d = await openEdit(user);
    await user.click(within(d).getByRole('button', { name: 'Suggest from my sales' }));
    expect(await within(d).findByText(/No sales in the last 60 days/)).toBeInTheDocument();
    expect(within(d).queryByRole('button', { name: 'Use these' })).toBeNull();
  });

  it('an existing medicine keeps its own strip price and shows it as typed', async () => {
    const user = userEvent.setup();
    const d = await openEdit(user);
    expect(field(d, /Sale price per strip/)).toHaveValue(25);          // the shop's own Rs 25, not the formula's 24.5
    await user.clear(field(d, /Sale price per box/)); await user.type(field(d, /Sale price per box/), '300');
    expect(field(d, /Sale price per strip/)).toHaveValue(25);          // stays, because it was set by hand
    expect(field(d, /Sale price per tablet/)).toHaveValue(3);          // the empty tablet price follows the box
  });
});

describe('Auto reorder levels (all medicines at once)', () => {
  it('lists current and suggested levels, pre-ticks only what would change, and applies the ticked ones', async () => {
    const user = userEvent.setup();
    render(<AuthProvider><MedicinesPage /></AuthProvider>);
    await user.click(await screen.findByRole('button', { name: /Auto reorder levels/ }));
    const d = await screen.findByRole('dialog');
    await within(d).findByText('Fast Mover');
    expect(within(d).getByText(/last 60 days/)).toBeInTheDocument();
    expect(within(d).getByLabelText('Apply to Fast Mover')).toBeChecked();
    expect(within(d).getByLabelText('Apply to Already Right')).not.toBeChecked();   // nothing to change there
    await user.click(within(d).getByRole('button', { name: /Apply to 1 medicine$/ }));
    await waitFor(() => expect(posts).toEqual([['levels', { ids: ['a'] }]]));
  });

  it('is only offered to people who may manage medicines', async () => {
    perms = ['medicines:view'];
    render(<AuthProvider><MedicinesPage /></AuthProvider>);
    await screen.findByText('Existing Tabs');
    expect(screen.queryByRole('button', { name: /Auto reorder levels/ })).toBeNull();
  });
});
