# Wellness Pharmacy: Blueprint v2 (status against the original plan)

Legend: **Done** = built and covered by tests, **New** = added beyond the first blueprint, **Next** = recommended roadmap.

| # | Blueprint area | Status | Notes |
|---|---|---|---|
| 1 | Setup, roles, web-based | Done | Admin, Pharmacist, Cashier, Inventory; permissions in `backend/src/config/permissions.js` |
| 2 | Dashboard | Done | Sales, purchases, profit, stock value, low/near-expiry/expired, udhaar, payables, recent transactions, 30-day chart, best sellers |
| 3 | Medicine inventory | Done | Name, generic, category, maker, barcode, prices, min stock, supplier, pack info, Rx flag |
| 4 | Units (box / strip / unit) | Done | Stored in base units, converted both ways |
| 5 | Batch and expiry | Done | 30/60/90-day alerts, expired blocked at sale, FEFO |
| 6 | POS / billing | Done + New | Retail/wholesale, barcode, split payments, hold bills, receipts (80mm/A4), returns. **New:** in-memory catalog, instant search, browse list, shortcuts, exact-cash F9, `3*name`, `10%` discount, double-bill protection, sounds |
| 7 | Purchases | Done | Batch/expiry on receipt, partial payment, ledger update |
| 8 | Supplier ledger | Done | Statements, payments, purchase returns |
| 9 | Customer credit (udhaar) | Done | Ledger, payments, credit limit, printable statement |
| 10 | Prescriptions | Done | Linked to customer and invoice, photo/PDF upload |
| 11 | Returns | Done | Sales and purchase returns adjust stock and money |
| 12 | Expenses | Done | Void instead of delete |
| 13 | Reports | Done | Sales (retail vs wholesale, staff-wise), inventory, movements, suppliers, customers, profit, products, CSV export |
| 14 | Staff and security | Done | RBAC, audit log, rate limits, bcrypt, short-lived tokens |
| 15 | Business rules | Done | All rules in the blueprint are enforced on the server |
| 16 | Phases 1-6 | Done | |
| 18 | **Cash closing (shifts)** | New | Open drawer with counted cash, cash in/out with reason, system-expected cash, counted vs expected, mandatory note on any difference, owner sees all shifts |
| 19 | **Purchase orders** | New | One-click draft from low stock per supplier, edit, send, print, receive stock against the order (partial deliveries tracked), cancel with reason |
| 20 | **Substitute suggestion** | New | Out-of-stock medicine shows in-stock brands with the same generic, same strength first |
| 21 | **Finance and profit** | New | One screen: net sales, gross profit and margin %, expenses (% of sales, by category incl. salaries), net profit and net margin %, comparison with the previous period, 6-month trend, stock/udhaar/payables snapshot |
| 22 | **Staff salaries (payroll)** | New | Staff list, monthly salary sheet, salary / advance / bonus payments, void with reason; every payment is also an expense so profit is right |
| 23 | **Price check** | New | Flags medicines sold below cost, with very low margin, above MRP, or with no price; live margin preview in the medicine form |
| 24 | **Medicine details** | New | Rack / row / side location (shown and searchable at the counter), dosage form, storage (fridge warning), MRP with sale-price limit |
| 17 | Operations | Done + New | Backup/restore, demo data, go-live reset, import. **New:** automated tests for catalog, idempotent checkout and POS screen |

## Recommended next steps (not built yet, in priority order)
1. **Barcode label printing** for medicines that arrive without a barcode.
2. **Udhaar reminders** by SMS/WhatsApp for overdue balances; receipt on WhatsApp.
3. **Near-expiry actions:** return-to-supplier list and discount suggestions before expiry.
4. **Automatic daily backup** and a daily owner summary (sales, cash difference, low stock, expiries).
5. **Tax / FBR integration** if the client needs it (confirm requirement first).
6. **Customer price lists / loyalty** and **refill reminders** for chronic patients.
7. **Offline selling** (queue bills while the internet is down). Only if the shop's internet is unreliable.
8. **Multi-branch** (branch on stock and sales, transfers). The current design is single branch by request.
9. **Regulatory extras** if required locally: controlled-drug register, drug-license expiry reminders.
