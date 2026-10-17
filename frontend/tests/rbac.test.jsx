import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

let mockPath = '/dashboard';
vi.mock('next/navigation', () => ({ usePathname: () => mockPath, useRouter: () => ({ replace: () => {}, push: () => {} }) }));
vi.mock('next/link', () => ({ default: ({ href, children, ...p }) => <a href={href} {...p}>{children}</a> }));

import { AuthProvider } from '@/context/AuthContext';
import AppShell from '@/components/AppShell';
import DashboardPage from '@/app/(app)/dashboard/page';
import ShiftsPage from '@/app/(app)/shifts/page';
import MedicinesPage from '@/app/(app)/medicines/page';

const ROLES = {
  owner: ['reports:view', 'dashboard:view', 'costs:view', 'medicines:view', 'medicines:manage', 'inventory:view', 'inventory:manage', 'pos:use', 'shifts:use', 'shifts:manage', 'payroll:manage', 'settings:manage', 'customers:view', 'customers:credit'],
  cashier: ['dashboard:view', 'medicines:view', 'customers:view', 'customers:manage', 'pos:use', 'sales:view', 'sales:discount', 'shifts:use'],
  pharmacist: ['dashboard:view', 'medicines:view', 'medicines:manage', 'inventory:view', 'inventory:manage', 'pos:use', 'sales:view', 'sales:view_all', 'shifts:use'],
};
let role; let posts; let shiftLive;
beforeEach(() => {
  role = 'cashier'; mockPath = '/dashboard'; posts = [];
  shiftLive = { openingCash: 1000, salesCount: 3, salesTotal: 900 };
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url); const ok = (b, s = 200) => ({ ok: s < 400, status: s, json: async () => b });
    if (u.startsWith('/api/auth/refresh')) return ok({ accessToken: 't', user: { id: 'u', name: 'Sara Khan', role, permissions: ROLES[role] } });
    if (u.startsWith('/api/settings')) return ok({ data: { shopName: 'Wellness' } });
    if (u.startsWith('/api/dashboard/trends')) return ok({ data: [] });
    if (u.startsWith('/api/dashboard')) return ok({ mode: 'counter', data: { today: { bills: 5, total: 2500, cash: 1500, card: 500, bank: 0, credit: 500 }, recentSales: [{ _id: 's1', invoiceNo: 'INV-000009', createdAt: new Date().toISOString(), customerName: 'Ali', total: 480 }], shift: null, alerts: role === 'pharmacist' ? { lowStock: 2, outOfStock: 1, nearExpiry30: 3, expired: 0 } : null } });
    if (u.startsWith('/api/shifts/current')) return ok({ data: { _id: 's1', shiftNo: 'SH-000001', userName: 'Sara', openedAt: new Date().toISOString(), movements: [], live: shiftLive } });
    if (u.startsWith('/api/shifts?')) return ok({ data: [] });
    if (u.includes('/api/shifts/s1/close')) { const b = JSON.parse(opts.body); posts.push(b); return b.notes ? ok({ data: {} }) : ok({ message: 'The counted cash does not match. Write a short note explaining the difference.' }, 400); }
    if (u.startsWith('/api/medicines/filters')) return ok({ categories: [], manufacturers: [], suppliers: [] });
    if (u === '/api/medicines' && opts.method === 'POST') { posts.push(JSON.parse(opts.body)); return ok({ data: {} }, 201); }
    if (u.startsWith('/api/medicines?') || u === '/api/medicines') return ok({ data: [], meta: { total: 0, page: 1, pages: 1 } });
    return ok({ data: [] });
  };
});
const shell = (el) => render(<AuthProvider><AppShell>{el}</AppShell></AuthProvider>);

describe('menu and route guard', () => {
  it('a cashier sees no finance, payroll or purchasing in the menu, and typing the address shows a clear message', async () => {
    mockPath = '/finance';
    shell(<p>SECRET FINANCE PAGE</p>);
    await screen.findByText(/not available to your role/);
    expect(screen.queryByText('SECRET FINANCE PAGE')).toBeNull();
    const nav = screen.getAllByRole('navigation')[0];
    expect(within(nav).getByText('POS / Billing')).toBeInTheDocument();
    expect(within(nav).getByText('Udhaar reminders')).toBeInTheDocument(); // cashiers collect udhaar, so they can remind too
    for (const hidden of ['Finance & profit', 'Staff salaries', 'Purchases', 'Purchase orders', 'Reports', 'Daily summary', 'Expiry returns', 'Barcode labels', 'Cash closing'].filter((x) => x !== 'Cash closing')) expect(within(nav).queryByText(hidden)).toBeNull();
    expect(screen.getByRole('link', { name: /Go to my home screen/ }).getAttribute('href')).toBe('/pos');
  });
  it('the owner gets the same address normally', async () => {
    role = 'owner'; mockPath = '/finance';
    shell(<p>FINANCE PAGE</p>);
    expect(await screen.findByText('FINANCE PAGE')).toBeInTheDocument();
    expect(within(screen.getAllByRole('navigation')[0]).getByText('Finance & profit')).toBeInTheDocument();
  });
});

describe('sidebar', () => {
  beforeEach(() => { localStorage.clear(); });
  it('the 3-bar button folds the menu to an icon strip; the strip\'s 3-bar button opens the full menu over the page; the choice is remembered', async () => {
    role = 'owner'; mockPath = '/pos';
    const user = userEvent.setup();
    shell(<p>PAGE</p>);
    await screen.findByText('PAGE');
    expect(screen.getByText('Finance & profit')).toBeInTheDocument();           // full menu with names
    await user.click(screen.getByRole('button', { name: /Fold menu/ }));
    expect(screen.queryByText('Finance & profit')).toBeNull();                  // names are gone, only icons remain
    expect(screen.getByRole('link', { name: 'Finance & profit' })).toBeInTheDocument(); // icons keep their name for hover and screen readers
    expect(localStorage.getItem('wp_sidebar_collapsed')).toBe('1');
    const railButton = screen.getAllByRole('button', { name: 'Open menu' }).find((b) => b.closest('aside'));
    await user.click(railButton);
    expect(await screen.findByText('Finance & profit')).toBeInTheDocument();    // the full menu slides over the page
    expect(screen.getByText('PAGE')).toBeInTheDocument();
  });
  it('a folded menu stays folded on the next visit', async () => {
    localStorage.setItem('wp_sidebar_collapsed', '1');
    role = 'owner';
    shell(<p>PAGE</p>);
    await screen.findByText('PAGE'); // signed in and the page is showing
    await waitFor(() => expect(screen.queryByRole('button', { name: /Fold menu/ })).toBeNull()); // the saved choice is read right after the first paint
    expect(screen.getAllByRole('button', { name: 'Open menu' }).some((b) => b.closest('aside'))).toBe(true);
  });
});

describe('counter home (what a cashier sees instead of the owner dashboard)', () => {
  it('shows their own day and no profit, purchases or stock value', async () => {
    render(<AuthProvider><DashboardPage /></AuthProvider>);
    await screen.findByText(/Hello, Sara/);
    expect(screen.getByText('Your sales today')).toBeInTheDocument();
    expect(screen.getByText('Rs 2,500')).toBeInTheDocument();
    expect(screen.getByText(/You have not opened your cash drawer/)).toBeInTheDocument();
    expect(screen.getByText('INV-000009')).toBeInTheDocument();
    const page = document.body.textContent.toLowerCase();
    for (const word of ['profit', 'purchases', 'payable', 'stock value']) expect(page).not.toContain(word);
    expect(screen.queryByText('Low stock')).toBeNull(); // the cashier has no stock-alert rights
  });
  it('the pharmacist also gets stock alerts', async () => {
    role = 'pharmacist';
    render(<AuthProvider><DashboardPage /></AuthProvider>);
    expect(await screen.findByText('Low stock')).toBeInTheDocument();
    expect(screen.getByText('Expiring in 30 days')).toBeInTheDocument();
  });
});

describe('blind cash closing', () => {
  it('the cashier never sees the expected cash, and the note box only appears after a mismatch', async () => {
    const user = userEvent.setup();
    render(<AuthProvider><ShiftsPage /></AuthProvider>);
    await screen.findByText(/count the cash in the drawer/i);
    expect(screen.queryByText(/Should be in the drawer/)).toBeNull();
    expect(screen.queryByText(/Cash sales/)).toBeNull();
    await user.click(screen.getByRole('button', { name: /Close shift/ }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Cash counted in the drawer'), '1500');
    expect(within(dialog).queryByText(/System expects/)).toBeNull();
    expect(within(dialog).queryByPlaceholderText(/Short explanation/)).toBeNull();
    await user.click(within(dialog).getByRole('button', { name: /Close shift/ }));
    await within(dialog).findByText(/does not match what the system expects/);
    const note = within(dialog).getByPlaceholderText(/Short explanation/);
    const submit = within(dialog).getByRole('button', { name: /Close shift/ });
    expect(submit).toBeDisabled();
    await user.type(note, 'Counted twice');
    await user.click(submit);
    await waitFor(() => expect(posts.at(-1)).toEqual({ countedCash: 1500, notes: 'Counted twice' }));
  });
});

describe('medicine form for staff who cannot see costs', () => {
  it('has no purchase price and never sends one', async () => {
    role = 'pharmacist';
    const user = userEvent.setup();
    render(<AuthProvider><MedicinesPage /></AuthProvider>);
    await user.click(await screen.findByRole('button', { name: /Add medicine/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByText(/Purchase price/)).toBeNull();
    expect(within(dialog).queryByText(/Profit margin on your sale prices/)).toBeNull();
    expect(within(dialog).getByText(/Where to find it/)).toBeInTheDocument(); // the rest of the form is intact
    await user.type(within(dialog).getAllByRole('textbox')[0], 'New Medicine');
    await user.click(within(dialog).getByRole('button', { name: /Save|Add/ }));
    await waitFor(() => expect(posts.length).toBe(1));
    expect('purchasePrice' in posts[0]).toBe(false);
    expect(posts[0].name).toBe('New Medicine');
  });
  it('the owner does get the purchase price field', async () => {
    role = 'owner';
    const user = userEvent.setup();
    render(<AuthProvider><MedicinesPage /></AuthProvider>);
    await user.click(await screen.findByRole('button', { name: /Add medicine/ }));
    expect(within(await screen.findByRole('dialog')).getByText(/Purchase price/)).toBeInTheDocument();
  });
});
