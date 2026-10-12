import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider } from '@/context/AuthContext';
import ShiftsPage from '@/app/(app)/shifts/page';

const live = { openingCash: 1000, salesCount: 2, salesTotal: 660, cashSales: 550, cardSales: 110, bankSales: 0, creditSales: 0, customerPayments: 0, cashIn: 0, cashRefunds: 0, cancelledRefunds: 0, supplierPayments: 0, expenses: 0, cashOut: 100, expectedCash: 1450 };
let state; let posts;
beforeEach(() => {
  state = { current: null }; posts = [];
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url); const ok = (body, status = 200) => ({ ok: true, status, json: async () => body });
    if (u.startsWith('/api/auth/refresh')) return ok({ accessToken: 't', user: { id: 'u', name: 'C', role: 'cashier', permissions: ['shifts:use'] } });
    if (u.startsWith('/api/shifts/current')) return ok({ data: state.current });
    if (u.startsWith('/api/shifts?')) return ok({ data: [] });
    if (opts.method === 'POST') { posts.push([u, JSON.parse(opts.body)]); if (u === '/api/shifts') state.current = { _id: 's1', shiftNo: 'SH-000001', userName: 'C', openedAt: new Date().toISOString(), movements: [], live }; return ok({ data: {} }, 201); }
    return ok({ data: [] });
  };
});
const open = () => render(<AuthProvider><ShiftsPage /></AuthProvider>);

describe('Cash closing screen', () => {
  it('opens a shift with the counted opening cash', async () => {
    const user = userEvent.setup(); open();
    await user.type(await screen.findByPlaceholderText('0'), '1000');
    await user.click(screen.getByRole('button', { name: /Open shift/ }));
    await screen.findByText(/Should be in the drawer/);
    expect(posts[0]).toEqual(['/api/shifts', { openingCash: 1000 }]);
    expect(screen.getAllByText('Rs 1,450').length).toBeGreaterThan(0);
  });

  it('closing: matching cash needs no note, a difference needs one', async () => {
    state.current = { _id: 's1', shiftNo: 'SH-000001', userName: 'C', openedAt: new Date().toISOString(), movements: [], live };
    const user = userEvent.setup(); open();
    await user.click(await screen.findByRole('button', { name: /Close shift/ }));
    const counted = screen.getByLabelText('Cash counted in the drawer');
    const submit = () => screen.getAllByRole('button', { name: /Close shift/ }).at(-1);
    await user.type(counted, '1400');
    expect(screen.getByText(/Cash is short by/)).toBeInTheDocument();
    expect(submit()).toBeDisabled(); // short, and no explanation yet
    await user.type(screen.getByPlaceholderText(/Short explanation/), 'Gave extra change');
    expect(submit()).toBeEnabled();
    await user.clear(counted); await user.type(counted, '1450');
    expect(screen.getByText('Cash matches')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/Short explanation/)).toBeNull();
    expect(submit()).toBeEnabled();
    await user.click(submit());
    await waitFor(() => expect(posts.at(-1)).toEqual(['/api/shifts/s1/close', { countedCash: 1450 }]));
  });
});
