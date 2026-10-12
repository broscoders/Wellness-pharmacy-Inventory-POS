import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider } from '@/context/AuthContext';
import FinancePage from '@/app/(app)/finance/page';
import PayrollPage from '@/app/(app)/payroll/page';

const cur = { sales: 1000, salesReturns: 100, netSales: 900, purchaseCostOfGoodsSold: 600, grossProfit: 300, grossMarginPercent: 33.3, expenses: 400, expensesByCategory: { rent: 100, salaries: 300 }, expenseRatioPercent: 44.4, estimatedNetProfit: -100, netMarginPercent: -11.1, invoices: 12, purchasesMade: 500 };
let posts;
beforeEach(() => {
  posts = [];
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url); const ok = (b, s = 200) => ({ ok: true, status: s, json: async () => b });
    if (u.startsWith('/api/auth/refresh')) return ok({ accessToken: 't', user: { id: 'u', name: 'Owner', role: 'admin', permissions: ['reports:view', 'payroll:manage'] } });
    if (u.startsWith('/api/finance/summary')) return ok({ range: { from: '2026-10-01', to: '2026-10-12' }, previousRange: {}, data: { current: cur, previous: { ...cur, netSales: 450, grossProfit: 300, expenses: 400, estimatedNetProfit: 50 }, trend: [{ month: '2026-10', netSales: 900, grossProfit: 300, expenses: 400, netProfit: -100, netMarginPercent: -11.1 }], balance: { stockValueAtCost: 5000, customerReceivables: 700, supplierPayables: 1200, netPosition: 4500 } } });
    if (u.startsWith('/api/finance/pricing-issues')) return ok({ data: [{ _id: 'm1', name: 'Loss Maker', issue: 'below_cost', detail: 'Sold below cost per box', purchasePrice: 400, salePriceBox: 350, mrp: 0 }] });
    if (u.startsWith('/api/payroll/sheet')) return ok({ month: '2026-10', totals: { base: 3000, paid: 1000, remaining: 2000 }, data: [{ employee: { _id: 'e1', name: 'Ali Helper', designation: 'Helper' }, base: 3000, salaryPaid: 1000, advances: 0, bonus: 0, totalPaid: 1000, remaining: 2000, payments: [{ _id: 'p1', kind: 'salary', amount: 1000, method: 'cash', at: new Date().toISOString() }] }] });
    if (u.startsWith('/api/payroll/employees')) return ok({ data: [] });
    if (opts.method === 'POST') { posts.push([u, JSON.parse(opts.body)]); return ok({ data: {} }, 201); }
    return ok({ data: [] });
  };
});

describe('Finance screen', () => {
  it('shows margins, expense share, the loss in red, and price problems', async () => {
    render(<AuthProvider><FinancePage /></AuthProvider>);
    await screen.findByText('33.3% margin');
    expect(screen.getByText('33.3% margin')).toBeInTheDocument();
    expect(screen.getByText('44.4% of net sales')).toBeInTheDocument();
    expect(screen.getByText('-11.1% of net sales')).toBeInTheDocument();
    expect(screen.getAllByText(/Salaries|salaries/).length).toBeGreaterThan(0); // salaries appear inside expenses
    expect(await screen.findByText('Loss Maker')).toBeInTheDocument();
    expect(screen.getByText('Sold below cost')).toBeInTheDocument();
    expect(screen.getByText('Rs 5,000')).toBeInTheDocument(); // stock at cost
  });
});

describe('Payroll screen', () => {
  it('pays the remaining salary by default and can record an advance', async () => {
    const user = userEvent.setup();
    render(<AuthProvider><PayrollPage /></AuthProvider>);
    await screen.findByText('Ali Helper');
    await user.click(screen.getByRole('button', { name: /^Pay$/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('spinbutton')).toHaveValue(2000); // what is left of the salary
    await user.click(within(dialog).getByRole('button', { name: 'Advance' }));
    expect(within(dialog).getByRole('spinbutton')).toHaveValue(null);
    await user.type(within(dialog).getByRole('spinbutton'), '500');
    await user.click(within(dialog).getByRole('button', { name: 'Save payment' }));
    await waitFor(() => expect(posts[0][0]).toBe('/api/payroll/payments'));
    expect(posts[0][1]).toMatchObject({ employee: 'e1', kind: 'advance', amount: 500, method: 'cash' });
    expect(posts[0][1].month).toMatch(/^\d{4}-\d{2}$/);
  });

  it('voiding a payment needs a reason', async () => {
    const user = userEvent.setup();
    render(<AuthProvider><PayrollPage /></AuthProvider>);
    await user.click(await screen.findByRole('button', { name: /Void/ }));
    const dialog = await screen.findByRole('dialog');
    const go = within(dialog).getByRole('button', { name: 'Void payment' });
    expect(go).toBeDisabled();
    await user.type(within(dialog).getByRole('textbox'), 'Entered twice');
    expect(go).toBeEnabled();
    await user.click(go);
    await waitFor(() => expect(posts[0]).toEqual(['/api/payroll/payments/p1/void', { reason: 'Entered twice' }]));
  });
});
