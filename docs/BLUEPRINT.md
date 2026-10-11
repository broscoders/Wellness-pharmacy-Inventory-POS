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
| 17 | Operations | Done + New | Backup/restore, demo data, go-live reset, import. **New:** automated tests for catalog, idempotent checkout and POS screen |

## Recommended next steps (not built yet, in priority order)
1. **Daily cash closing:** opening cash, expected vs counted cash per cashier shift, difference report. The biggest remaining control for a shop owner.
2. **Purchase orders:** turn the reorder list into a PO per supplier (print/WhatsApp), then receive against it.
3. **Barcode label printing** for medicines that arrive without a barcode.
4. **Udhaar reminders** by SMS/WhatsApp for overdue balances.
5. **Customer-wise price lists / loyalty** if the client asks.
6. **Offline selling** (queue bills while the internet is down). Only worth it if the shop's internet is unreliable, because it adds complexity around stock conflicts.
7. **Multi-branch** (branch field on stock and sales, transfers). The current design is single branch by request.
8. **Regulatory extras** if required locally: controlled-drug register, drug-license expiry reminders.
