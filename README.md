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

Optional demo data (110 medicines in 10 categories, batches with near-expiry / expired / low-stock cases, 5 suppliers, 8 customers):

```powershell
cd backend
npm run seed:demo              # add
npm run seed:demo -- --remove  # remove again (refused for items already used in real bills)
```
Demo medicines have barcodes starting with `8961000` (e.g. `8961000000001` = Panadol 500mg) so you can test the barcode box on the POS screen. Prices are approximate.

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
| `MongoDB connection FAILED` | Check Atlas Network Access, DB user password (URL-encode special characters), and that the URI has a database name. |
| `npm install` errors on Windows (`TAR_ENTRY_ERROR`, `ENOTEMPTY`) | Keep the project outside OneDrive/Desktop (e.g. `C:\Projects`) and run `npm cache clean --force`. |
