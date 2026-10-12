import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider } from '@/context/AuthContext';
import { CatalogProvider } from '@/context/CatalogContext';
import { clearCache } from '@/lib/catalogDb';
import LabelsPage from '@/app/(app)/labels/page';
import UdhaarPage from '@/app/(app)/udhaar/page';
import ExpiryPage from '@/app/(app)/expiry-returns/page';
import DailyPage from '@/app/(app)/daily/page';
import { buildBackup } from '@/lib/backup';
import { api, setAccessToken } from '@/lib/api';

const day = 86400000;
const med = (id, name, extra = {}) => ({ _id: id, name, genericName: '', manufacturer: '', category: null, barcode: '', stripsPerBox: 10, unitsPerStrip: 10, salePrice: { box: 245, strip: 25, unit: 0 }, wholesalePrice: {}, minStockLevel: 0, requiresPrescription: false, pop: 0, batches: [[100, Date.now() + 200 * day]], ...extra });
let calls; let posts;
const PERMS = ['pos:use', 'medicines:view', 'medicines:manage', 'customers:view', 'inventory:view', 'reports:view', 'settings:manage'];

beforeEach(async () => {
  await clearCache(); calls = []; posts = [];
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url); calls.push(`${opts.method || 'GET'} ${u}`);
    const ok = (b, s = 200) => ({ ok: true, status: s, json: async () => b });
    if (u.startsWith('/api/auth/refresh')) return ok({ accessToken: 't', user: { id: 'u', name: 'Owner', role: 'admin', permissions: PERMS } });
    if (u.startsWith('/api/settings')) return ok({ data: { shopName: 'Wellness Test' } });
    if (u.startsWith('/api/medicines/catalog')) return ok({ mode: 'full', serverTime: new Date().toISOString(), categories: [], removed: [], data: [med('m1', 'Panadol 500mg', { barcode: '8961000000001' }), med('m2', 'Calpol Syrup'), med('m3', 'Shop Coded', { barcode: '2000000000014' })] });
    if (u.startsWith('/api/medicines/assign-barcodes')) { posts.push(u); return ok({ assigned: 1, remaining: 0 }); }
    if (u.startsWith('/api/ops/udhaar-reminders') && opts.method === 'POST') { posts.push(u); return ok({ data: {} }); }
    if (u.startsWith('/api/ops/udhaar-reminders')) return ok({ minDays: 15, totals: { customers: 2, amount: 7000, withoutPhone: 1 }, data: [
      { _id: 'c1', name: 'Late Payer', phone: '0300-1234567', balance: 5000, daysSince: 45, lastPaymentAt: null, lastReminderAt: null },
      { _id: 'c2', name: 'No Phone', phone: '', balance: 2000, daysSince: 20, lastPaymentAt: null, lastReminderAt: null }] });
    if (u.startsWith('/api/ops/expiry-plan')) return ok({ days: 90, totals: { expiredValue: 200, atRiskValue: 4000, expiringValue: 4400, batches: 2 }, groups: [{ supplier: { _id: 's1', name: 'Return Supplier', phone: '03001112222' }, expiredValue: 200, atRiskValue: 4000, expiringValue: 4400, lines: [
      { medicine: 'a', name: 'Slow Seller', batchNumber: 'SL-1', expiryDate: new Date(Date.now() + 30 * day).toISOString(), daysLeft: 30, status: 'expiring', quantity: 970, display: { box: 9, strip: 7, unit: 0 }, costValue: 4000, daysToSellOut: 970, unlikelyToSell: true },
      { medicine: 'b', name: 'Old Batch', batchNumber: 'OLD', expiryDate: new Date(Date.now() - 9 * day).toISOString(), daysLeft: -9, status: 'expired', quantity: 50, display: { box: 0, strip: 5, unit: 0 }, costValue: 200, daysToSellOut: null, unlikelyToSell: false }] }] });
    if (u.startsWith('/api/ops/daily-summary')) return ok({ data: { shopName: 'Wellness Test', date: '2026-10-12', sales: { bills: 4, total: 1000, cash: 600, card: 100, bank: 0, credit: 300, returns: 0 }, profit: { netSales: 1000, grossProfit: 200, grossMarginPercent: 20, expenses: 50, netProfit: 150 }, udhaar: { given: 300, received: 100, totalOwed: 900 }, topSellers: [{ name: 'Panadol', boxes: 2, revenue: 500 }], staff: [{ name: 'Ali', bills: 4, total: 1000 }], cash: { shiftsClosed: 1, difference: -50, shortOrExtra: [{ shiftNo: 'SH-000001', user: 'Ali', difference: -50 }] }, stockAlerts: { outOfStock: 1, lowStock: 2, expired: 0, nearExpiry30: 3 }, payables: 400, lastBackupAt: null } });
    if (u.startsWith('/api/ops/backup/manifest')) return ok({ database: 'wp', collections: { medicines: 3, sales: 1 }, lastBackupAt: null });
    if (u.startsWith('/api/ops/backup/')) { const name = decodeURIComponent(u.split('/api/ops/backup/')[1].split('?')[0]); const skip = Number(new URL(u, 'http://x').searchParams.get('skip')); const all = name === 'medicines' ? Array.from({ length: 1100 }, (_, i) => ({ _id: { $oid: String(i) } })) : [{ _id: { $oid: 's' } }]; const docs = all.slice(skip, skip + 500); return ok({ docs, count: docs.length }); }
    return ok({ data: [] });
  };
});
const wrap = (el) => render(<AuthProvider><CatalogProvider>{el}</CatalogProvider></AuthProvider>);

describe('Barcode labels', () => {
  it('counts medicines without a barcode, assigns them, and prints the chosen number of labels', async () => {
    const user = userEvent.setup();
    wrap(<LabelsPage />);
    await screen.findByText(/have no barcode/);
    expect(screen.getByText('1')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Give barcodes to all without one/ }));
    await waitFor(() => expect(posts).toContain('/api/medicines/assign-barcodes'));
    await user.type(screen.getByLabelText('Search medicine for label'), 'pana');
    await user.click(await screen.findByRole('button', { name: /Panadol 500mg/ }));
    const copies = screen.getByLabelText('Labels for Panadol 500mg');
    await user.clear(copies); await user.type(copies, '3');
    expect(await screen.findByText(/Labels to print:/)).toHaveTextContent('3');
    await waitFor(() => expect(screen.getAllByRole('img', { name: 'Barcode 8961000000001' }).length).toBeGreaterThanOrEqual(3));
    expect(screen.getAllByText('Rs 25').length).toBeGreaterThan(0); // price on the label
  });
  it('a medicine without a barcode cannot be added to the print list', async () => {
    const user = userEvent.setup();
    wrap(<LabelsPage />);
    await screen.findByText(/have no barcode/);
    await user.type(screen.getByLabelText('Search medicine for label'), 'calpol');
    expect(await screen.findByText('No barcode yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Calpol Syrup/ })).toBeDisabled();
  });
});

describe('Udhaar reminders', () => {
  it('opens WhatsApp with a ready message and records the reminder; no phone = disabled', async () => {
    const user = userEvent.setup();
    render(<AuthProvider><UdhaarPage /></AuthProvider>);
    await screen.findByText('Late Payer');
    const row = screen.getByText('Late Payer').closest('tr');
    const link = within(row).getByRole('link', { name: /WhatsApp/ });
    expect(link.href).toContain('https://wa.me/923001234567?text=');
    expect(decodeURIComponent(link.href)).toContain('Rs 5,000');
    link.addEventListener('click', (e) => e.preventDefault()); // do not really navigate in the test
    await user.click(link);
    await waitFor(() => expect(posts).toContain('/api/ops/udhaar-reminders/c1/sent'));
    const noPhone = screen.getByText('No Phone').closest('tr');
    expect(within(noPhone).getByRole('button', { name: /WhatsApp/ })).toBeDisabled();
  });
});

describe('Expiry returns', () => {
  it('explains which batches will not sell in time and offers the supplier a WhatsApp list', async () => {
    render(<AuthProvider><ExpiryPage /></AuthProvider>);
    await screen.findByText('Return Supplier');
    expect(screen.getByText(/No sales in 30 days|Needs ~970 days to sell, only 30 left/)).toBeInTheDocument();
    expect(screen.getByText('Return / claim, do not sell')).toBeInTheDocument();
    const wa = screen.getByRole('link', { name: /WhatsApp/ });
    expect(wa.href).toContain('https://wa.me/923001112222');
    const text = decodeURIComponent(wa.href);
    expect(text).toContain('Slow Seller');
    expect(text).toContain('Old Batch');
  });
});

describe('Daily summary', () => {
  it('shows the day and a WhatsApp message that includes the cash difference', async () => {
    render(<AuthProvider><DailyPage /></AuthProvider>);
    await screen.findByText('How customers paid');
    expect(screen.getAllByText('Rs 1,000').length).toBeGreaterThan(0);
    expect(screen.getByText(/No backup has been downloaded yet/)).toBeInTheDocument();
    const href = decodeURIComponent(screen.getByRole('link', { name: /Send on WhatsApp/ }).href);
    expect(href).toContain('CASH DIFFERENCE');
    expect(href).toContain('Net profit today: Rs 150');
  });
});

describe('Backup file', () => {
  it('reads every collection page by page and nothing is lost', async () => {
    setAccessToken('t');
    const seen = [];
    const bundle = await buildBackup((p) => seen.push(`${p.name}:${p.done}`));
    expect(bundle.collections.medicines).toHaveLength(1100); // 500 + 500 + 100
    expect(bundle.collections.sales).toHaveLength(1);
    expect(bundle.manifest.collections).toEqual({ medicines: 1100, sales: 1 });
    expect(bundle.collections.medicines[1099]._id.$oid).toBe('1099');
    expect(calls.filter((c) => c.includes('/backup/medicines')).length).toBe(3);
  });
});
