/**
 * GO-LIVE CLEAN-UP: deletes ALL business data (medicines, batches, stock history, sales, returns, purchases,
 * customers, suppliers, ledgers, prescriptions, expenses, audit log, invoice counters) and the demo staff accounts.
 * KEEPS: your real user accounts (owner/staff) and the categories.
 *
 * Safety: it only runs if BOTH are given
 *   1) the flag  --yes
 *   2) the environment variable CONFIRM_DB_NAME equal to the exact name of the database it is connected to
 *
 * PowerShell example (production):
 *   $env:MONGODB_URI = "mongodb+srv://...../wellness_pharmacy_prod?retryWrites=true&w=majority"
 *   $env:CONFIRM_DB_NAME = "wellness_pharmacy_prod"
 *   npm run reset:data -- --yes
 */
const env = require('../config/env');
env.validateEnv();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const User = require('../models/User');

const MODELS = ['Medicine', 'Batch', 'StockMovement', 'Sale', 'SaleReturn', 'Purchase', 'PurchaseReturn', 'Customer', 'CustomerLedger',
  'Supplier', 'SupplierLedger', 'Prescription', 'PrescriptionFile', 'Expense', 'AuditLog', 'Counter'];

(async () => {
  await connectDB();
  const dbName = mongoose.connection.name;
  const confirmed = process.argv.includes('--yes') && process.env.CONFIRM_DB_NAME === dbName;
  const models = MODELS.map((n) => require(`../models/${n}`));
  console.log(`Connected database: ${dbName}`);
  for (const M of models) console.log(`  ${M.modelName.padEnd(18)} ${await M.countDocuments()} records`);
  if (!confirmed) {
    console.log('\nNothing was deleted. To really delete all of the above, run again with BOTH:');
    console.log(`  environment variable  CONFIRM_DB_NAME = ${dbName}`);
    console.log('  and the flag          --yes');
    await mongoose.disconnect();
    process.exit(1);
  }
  for (const M of models) await M.deleteMany({});
  const demoStaff = await User.deleteMany({ email: /@demo\.wellness\.local$/ });
  console.log(`\nDone. All business data deleted (and ${demoStaff.deletedCount} demo staff accounts). Real users and categories were kept.`);
  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
