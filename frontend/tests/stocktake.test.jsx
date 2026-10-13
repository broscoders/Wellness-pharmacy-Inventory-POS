import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider } from '@/context/AuthContext';
import { CatalogProvider } from '@/context/CatalogContext';
import { clearCache } from '@/lib/catalogDb';
import StockTakePage from '@/app/(app)/stock-take/page';

const day = 86400000;
const med = { _id: 'm1', name: 'Count Alpha', stripsPerBox: 10, unitsPerStrip: 10, rack: 'A', row: '1', side: 'Left' };
let posts; let applyStatus;
beforeEach(async () => {
  await clearCache(); posts = []; applyStatus = 200;
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url); const ok = (b, s = 200) => ({ ok: s < 400, status: s, json: async () => b });
    if (u.startsWith('/api/auth/refresh')) return ok({ accessToken: 't', user: { id: 'u', name: 'Stock', role: 'inventory', permissions: ['inventory:adjust', 'inventory:view', 'medicines:view', 'costs:view'] } });
    if (u.startsWith('/api/settings')) return ok({ data: {} });
    if (u.startsWith('/api/medicines/catalog')) return ok({ mode: 'full', serverTime: new Date().toISOString(), categories: [], removed: [], data: [{ ...med, genericName: '', manufacturer: '', category: null, barcode: '', salePrice: {}, wholesalePrice: {}, minStockLevel: 0, requiresPrescription: false, pop: 0, batches: [[100, Date.now() + 100 * day]] }] });
    if (u.startsWith('/api/inventory/stock-take') && (opts.method || 'GET') === 'GET') return ok({ truncated: false, data: [{ batch: 'b1', batchNumber: 'A1', expiryDate: new Date(Date.now() + 100 * day).toISOString(), medicine: med }] });
    if (u.startsWith('/api/inventory/stock-take')) {
      const b = JSON.parse(opts.body); posts.push(b);
      const line = b.lines[0]; const row = { batch: 'b1', name: 'Count Alpha', batchNumber: 'A1', system: 100, counted: line.counted, difference: line.counted - 100, costValue: (line.counted - 100) * 4 };
      const totals = { counted: 1, matched: row.difference === 0 ? 1 : 0, short: row.difference < 0 ? 1 : 0, over: row.difference > 0 ? 1 : 0, costValue: row.costValue };
      if (b.apply && applyStatus === 409) return ok({ message: 'Stock changed while you were counting (Count Alpha). Review the differences again before applying.' }, 409);
      return ok({ applied: !!b.apply, adjusted: b.apply ? 1 : 0, data: [row], totals });
    }
    return ok({ data: [] });
  };
});
const open = () => render(<AuthProvider><CatalogProvider><StockTakePage /></CatalogProvider></AuthProvider>);

describe('Stock take screen', () => {
  it('counts blind, reviews the difference in boxes/strips, and applies it with the note', async () => {
    const user = userEvent.setup();
    open();
    await screen.findByRole('option', { name: 'Rack A' }); // the rack list comes from the medicine list, which loads first
    await user.selectOptions(screen.getByLabelText('Rack'), 'A');
    await user.click(screen.getByRole('button', { name: /Start counting/ }));
    await screen.findByText('Count Alpha');
    expect(document.body.textContent).not.toMatch(/System says|100/); // nothing reveals the system quantity while counting
    await user.type(screen.getByLabelText('Count Alpha A1 strip'), '9');       // 9 strips = 90 units; the system has 100
    await user.type(screen.getByLabelText('Count Alpha A1 unit'), '5');        // + 5 loose = 95
    await user.click(screen.getByRole('button', { name: /Review differences/ }));
    await screen.findByText('System says');
    expect(posts[0].lines).toEqual([{ batch: 'b1', counted: 95 }]);
    expect(screen.getByText(/-5 unit|-5 units/i)).toBeInTheDocument();       // short by 5 loose units
    expect(screen.getAllByText('Rs -20').length).toBeGreaterThan(0);          // the owner sees the value
    await user.click(screen.getByRole('button', { name: /Apply 1 adjustment/ }));
    await screen.findByText('Count saved');
    expect(posts[1]).toMatchObject({ apply: true, note: 'Rack A count', lines: [{ batch: 'b1', counted: 95, expected: 100 }] });
  });

  it('an exact count has nothing to apply', async () => {
    const user = userEvent.setup();
    open();
    await screen.findByRole('option', { name: 'Rack A' }); // the rack list comes from the medicine list, which loads first
    await user.selectOptions(screen.getByLabelText('Rack'), 'A');
    await user.click(screen.getByRole('button', { name: /Start counting/ }));
    await user.type(await screen.findByLabelText('Count Alpha A1 strip'), '10');
    await user.click(screen.getByRole('button', { name: /Review differences/ }));
    expect(await screen.findByText(/Everything you counted matches/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Apply 0 adjustment/ })).toBeDisabled();
  });

  it('if stock moved meanwhile the message asks for a fresh review', async () => {
    const user = userEvent.setup();
    open();
    await screen.findByRole('option', { name: 'Rack A' }); // the rack list comes from the medicine list, which loads first
    await user.selectOptions(screen.getByLabelText('Rack'), 'A');
    await user.click(screen.getByRole('button', { name: /Start counting/ }));
    await user.type(await screen.findByLabelText('Count Alpha A1 unit'), '3');
    await user.click(screen.getByRole('button', { name: /Review differences/ }));
    await screen.findByText('System says');
    applyStatus = 409;
    await user.click(screen.getByRole('button', { name: /Apply 1 adjustment/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Stock changed while you were counting/);
    expect(screen.getByRole('button', { name: /Review again/ })).toBeInTheDocument();
  });
});
