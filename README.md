# Wellness Pharmacy - Inventory + POS

Pharmacy Management & POS system built by **Bro's Code**.
Batch and expiry tracking, retail/wholesale billing, purchases, supplier ledger, customer udhaar, returns, role-based access.

```
backend/    Node.js + Express + MongoDB (Mongoose) REST API
frontend/   Next.js (App Router) + Tailwind web app
```

## Status

| Phase | Scope | State |
|---|---|---|
| 1 | Login, roles, users, categories, suppliers, customers | Done (API + screens) |
| 2 | Medicines, batches, expiry alerts, box/strip/unit stock, FEFO | Done (API + screens) |
| 3 | POS billing, receipts, returns, invoice cancel, udhaar | Done (API + screens) |
| 4 | Purchases, supplier ledger/payments, purchase returns, dashboard | Done (API + screens) |
| 5 | Prescriptions (with photo/PDF upload), expenses | Done (API + screens) |
| 6 | Reports (sales, profit, inventory, suppliers, customers, CSV export), audit log, full testing | Done |

Remaining before go-live: deploy to Vercel, create the owner account on the production database, enter the real medicine list / opening stock, and train staff.

## What the system can do

- **Counter:** POS with barcode scanning, retail/wholesale prices, box/strip/unit selling, discounts, cash/card/bank/udhaar, change, receipt printing (80mm thermal or A4), hold/resume bills (F8), keyboard shortcuts (F2 search, F9 complete), returns, invoice cancellation.
- **Stock:** batches with expiry, FEFO (earliest expiry sold first, expired never sold), 30/60/90-day alerts, low/out-of-stock, **reorder list grouped by supplier (print/CSV)**, stock adjustments with reason, full stock history, medicine detail view with margin.
- **Money:** purchases with partial payment, supplier ledger and payments, customer udhaar ledger and payments, printable account statements, expenses (void, never delete), profit and loss.
- **Owner insight:** dashboard with sales/profit chart and best sellers, reports (sales, profit, **products: best sellers, category-wise, slow moving stock**, inventory, suppliers, customers) with CSV export, audit log.
- **Setup:** shop name/address/phone/license printed on receipts (Shop settings), **bulk import of medicines + opening stock from CSV/Excel-saved file**, staff roles, change password.
- **Safety:** go-live clean-up (`reset:data`), **backup and restore** scripts.

## Roles

| Role | Can do |
|---|---|
| Admin (owner) | Everything, including users, cancellations, audit log |
| Pharmacist | Medicines, inventory, prescriptions, POS, returns, discounts |
| Cashier | POS, discounts, customers, customer payments |
| Inventory | Medicines, stock, purchases, suppliers, supplier payments |

Permissions live in one file: `backend/src/config/permissions.js`.

## Run locally (Windows PowerShell)

```powershell
# 1) Backend
cd backend
Copy-Item .env.example .env        # then edit .env (see table below)
npm install
npm run seed                       # creates the first Admin + default categories (once)
npm run dev                        # API on http://localhost:5000

# 2) Frontend (new terminal)
cd frontend
Copy-Item .env.example .env.local  # BACKEND_URL=http://localhost:5000
npm install
npm run dev                        # Web app on http://localhost:3000
```

Optional demo data: 110 medicines in 10 categories (with manufacturers, barcodes, batches, near-expiry / expired / low-stock cases), 5 suppliers, 8 customers **plus 30 days of activity** - purchases, retail and wholesale sales (cash / card / bank / udhaar), returns, cancellations, customer and supplier payments, prescriptions, expenses and 3 demo staff accounts - so every screen and report has something to show.

```powershell
cd backend
npm run seed:demo                    # everything above (the owner account must exist: npm run seed)
npm run seed:demo -- --no-activity   # only medicines, suppliers, customers
npm run seed:demo -- --remove        # remove all demo data again
```
The passwords of the demo staff accounts are printed once in the terminal when they are created (they use the e-mail domain `@demo.wellness.local`). Prices are approximate. Demo medicines have barcodes starting with `8961000` (e.g. `8961000000001` = Panadol 500mg) so you can test the barcode box on the POS screen.

### Moving your old register / software data in
Open **Medicines, Import from file**. Download the template, fill it in Excel (or paste your list), save as CSV and upload it. The screen first checks the file and lists every problem row (nothing is saved), then imports. Importing the same file again never doubles the stock. Dates can be written like `2028-06-30`, `30/06/2028`, `06/2028` or `Jun 2028`.

### Backup and restore
Atlas' free plan has no automatic backups. From your computer:

```powershell
cd backend
npm run backup           # saves everything into backups\<database>-<date>\  (keep it private: it has staff password hashes)
```
To restore (this REPLACES the current data, so it needs the same two safety confirmations as `reset:data`):
```powershell
$env:CONFIRM_DB_NAME = "wellness_pharmacy_prod"
npm run restore -- backups\wellness_pharmacy_prod-2026-10-10-21-00-00 --yes
```
A full backup -> wipe -> restore round trip was tested: every collection came back identical.

### Clean the database before real use (go-live)
`reset:data` deletes **all** business data (medicines, stock, sales, purchases, customers, suppliers, ledgers, prescriptions, expenses, audit log, invoice counters) and the demo staff. Real user accounts and categories are kept. It refuses to run unless you pass `--yes` **and** set `CONFIRM_DB_NAME` to the exact database name it is connected to:

```powershell
cd backend
$env:MONGODB_URI = "mongodb+srv://USER:PASS@cluster.mongodb.net/wellness_pharmacy_prod?retryWrites=true&w=majority"
npm run reset:data                                   # only shows what it would delete
$env:CONFIRM_DB_NAME = "wellness_pharmacy_prod"
npm run reset:data -- --yes                          # really deletes
```

Sign in with the `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` you put in `backend/.env`.
When the backend starts it prints `MongoDB connected successfully`, or `MongoDB connection FAILED` with the reason.
`GET /api/health` also reports the database state.

## Environment variables

### backend/.env

| Variable | Required | Example / notes |
|---|---|---|
| `MONGODB_URI` | yes | `mongodb+srv://USER:PASS@cluster.mongodb.net/wellness_pharmacy?retryWrites=true&w=majority` - **include the database name** after `.net/`. Special characters in the password must be URL-encoded. |
| `JWT_ACCESS_SECRET` | yes | Long random string. |
| `JWT_REFRESH_SECRET` | yes | A **different** long random string. |
| `CLIENT_URL` | yes | Allowed frontend origin(s), comma separated. Local: `http://localhost:3000`. Production: your frontend URL, e.g. `https://wellness-pharmacy.vercel.app`. |
| `NODE_ENV` | no | `production` on Vercel. |
| `PORT` | no | Default 5000 (local only). |
| `JWT_ACCESS_EXPIRES` / `JWT_REFRESH_EXPIRES` | no | Defaults `15m` / `7d`. |
| `DNS_SERVERS` | no | Only if the backend prints `querySrv ETIMEOUT`: `8.8.8.8,1.1.1.1` (Google/Cloudflare DNS for the Atlas lookup). |
| `BUSINESS_TZ_OFFSET_MIN` | no | Minutes from UTC used for "today". Default `300` (Pakistan). |
| `SEED_ADMIN_NAME`, `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | seed only | First owner account. |

Generate a secret in PowerShell:
`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`

### frontend/.env.local

| Variable | Required | Notes |
|---|---|---|
| `BACKEND_URL` | yes | Backend base URL without trailing slash. Next.js reads it **at build time** (rewrites are baked into the build), so change it -> redeploy. |

The browser only calls `/api/...` on the frontend's own address; Next.js forwards it to the backend.
That keeps the refresh-token cookie first-party (no third-party cookie / CORS trouble).

## Deploy on Vercel

Create **two** Vercel projects from this one repository.

1. **Backend**: Root Directory `backend`. Add env vars: `MONGODB_URI`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `CLIENT_URL` (the frontend URL from step 2), `NODE_ENV=production`. In MongoDB Atlas -> Network Access allow `0.0.0.0/0` (Vercel IPs change).
2. **Frontend**: Root Directory `frontend`. Add `BACKEND_URL` = backend project URL. Deploy.
3. Put the frontend URL into the backend's `CLIENT_URL`, then redeploy the backend.
4. Create the first admin once, from your computer, with production `MONGODB_URI` in `backend/.env`: `npm run seed`.

Check: `https://<backend>/api/health` shows `"database":"connected"`.

## Security notes

- Passwords hashed with bcrypt (cost 12). Access token 15 min, refresh token 7 days in an httpOnly cookie, rotated sessions on password change.
- Login rate limit (10 / 15 min / IP), global API rate limit, helmet headers, strict CORS, input validation (zod) on every write.
- Master data is deactivated, never hard-deleted. Stock history, ledgers and the audit log are append-only.
- Sensitive actions are audit logged: stock adjustments, discounts, returns, cancellations, price changes, user changes.

## Business rules enforced by the API

- Expired batches are never sold (FEFO picks earliest non-expired batch first, split across batches when needed).
- Stock is stored in base units (tablet). 1 box = N strips = N x M units; conversion happens in one place (`backend/src/utils/units.js`).
- Stock can never go negative; a failed multi-line sale or purchase rolls back what it already changed.
- Credit sale -> customer ledger; credit purchase -> supplier ledger; payments and returns adjust the same ledgers.

## Tests

```powershell
cd backend
npm test
```
- `tests/units.test.js` - box/strip/unit conversion and expiry parsing.
- `tests/fefo.test.js` - FEFO allocation (uses throwaway database `wellness_fefo_test`).
- `tests/api.flow.test.js` - whole business flow through the real API: login and permissions, FEFO sale with change, rollback of a failed bill, returns, udhaar and customer payments, invoice cancel, purchase with supplier ledger and purchase return, prescription-only medicine, reports vs dashboard (uses throwaway database `wellness_api_test`).

Both database tests drop their own throwaway database at the end and **refuse to run** if they are connected to any other database.
On real MongoDB/Atlas `fefo.test.js` also checks that two simultaneous sales cannot oversell the last stock.

## Troubleshooting

| Problem | Fix |
|---|---|
| `Origin ... is not allowed` on login | Add the frontend URL to `CLIENT_URL` in the backend env and restart/redeploy. |
| Frontend shows network errors for `/api` | `BACKEND_URL` wrong or missing at build time. Fix and rebuild. |
| `querySrv ETIMEOUT` | DNS problem on your network. Add `DNS_SERVERS=8.8.8.8,1.1.1.1` to `backend/.env`, or change your PC's DNS to 8.8.8.8, or use Atlas' non-SRV (`mongodb://...`) connection string, or try a mobile hotspot. |
| Receipt prints blank / extra pages | Use the Print button in the app (not Ctrl+P on another page). For thermal printers choose the printer's 80mm roll paper in the print dialog and set margins to None. |
| `MONGODB_URI has no database name` | The connection string must name the database after the host: `...mongodb.net/wellness_pharmacy?retryWrites=true&w=majority`. Without a name MongoDB silently uses a database called `test` (that is how a second, unwanted database appears in Atlas), so the backend now refuses to start. |
| `MongoDB connection FAILED` | Check Atlas Network Access, DB user password (URL-encode special characters), and that the URI has a database name. |
| `npm install` errors on Windows (`TAR_ENTRY_ERROR`, `ENOTEMPTY`) | Keep the project outside OneDrive/Desktop (e.g. `C:\Projects`) and run `npm cache clean --force`. |
