/**
 * RESTORE: puts a backup (made by `npm run backup`) back into the database.
 * It REPLACES the content of every collection that is in the backup folder.
 *
 * Safety: it only runs if BOTH are given
 *   1) the flag  --yes
 *   2) the environment variable CONFIRM_DB_NAME equal to the exact name of the database it is connected to
 *
 *   $env:CONFIRM_DB_NAME = "wellness_pharmacy_prod"
 *   npm run restore -- backups\wellness_pharmacy_prod-2026-10-10-21-00-00 --yes
 */
const fs = require('fs');
const path = require('path');
const env = require('../config/env');
env.validateEnv();
const mongoose = require('mongoose');
const connectDB = require('../config/db');

const { EJSON } = mongoose.mongo.BSON;

(async () => {
  const folder = process.argv.slice(2).find((a) => !a.startsWith('--'));
  if (!folder || !fs.existsSync(path.join(folder, 'manifest.json'))) {
    console.error('Give the backup folder (it must contain manifest.json). Example:\n  npm run restore -- backups\\wellness_pharmacy_prod-2026-10-10-21-00-00 --yes');
    process.exit(1);
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(folder, 'manifest.json'), 'utf8'));
  await connectDB();
  const dbName = mongoose.connection.name;
  console.log(`Backup of "${manifest.database}" taken ${manifest.createdAt}`);
  console.log(`Target database: ${dbName}`);
  for (const [name, n] of Object.entries(manifest.collections)) console.log(`  ${name.padEnd(22)} ${n} records in backup`);

  if (!(process.argv.includes('--yes') && process.env.CONFIRM_DB_NAME === dbName)) {
    console.log('\nNothing was changed. To really restore (this REPLACES the current data) run again with BOTH:');
    console.log(`  environment variable  CONFIRM_DB_NAME = ${dbName}`);
    console.log('  and the flag          --yes');
    await mongoose.disconnect();
    process.exit(1);
  }

  const db = mongoose.connection.db;
  for (const name of Object.keys(manifest.collections)) {
    const docs = EJSON.parse(fs.readFileSync(path.join(folder, `${name}.json`), 'utf8'), { relaxed: false });
    await db.collection(name).deleteMany({});
    if (docs.length) await db.collection(name).insertMany(docs);
    console.log(`  restored ${name}: ${docs.length}`);
  }
  console.log('\nRestore finished. Restart the backend so the database indexes are checked.');
  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
