/**
 * BACKUP: saves every collection of the database into a folder of JSON files on THIS computer.
 *
 *   npm run backup                      -> backups/<database>-<date-time>/  (one JSON file per collection + manifest.json)
 *
 * Atlas' free plan (M0) has no automatic backups, so run this regularly (e.g. every evening) and copy the folder
 * to a USB drive / cloud drive. The backup includes staff accounts with their password HASHES: keep it private.
 */
const fs = require('fs');
const path = require('path');
const env = require('../config/env');
env.validateEnv();
const mongoose = require('mongoose');
const connectDB = require('../config/db');

const { EJSON } = mongoose.mongo.BSON;

(async () => {
  await connectDB();
  const db = mongoose.connection.db;
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
  const dir = path.join(process.cwd(), 'backups', `${mongoose.connection.name}-${stamp}`);
  fs.mkdirSync(dir, { recursive: true });

  const manifest = { database: mongoose.connection.name, createdAt: new Date().toISOString(), collections: {} };
  const cols = (await db.listCollections().toArray()).filter((c) => !c.name.startsWith('system.') && c.type !== 'view');
  for (const c of cols) {
    const docs = await db.collection(c.name).find({}).toArray();
    fs.writeFileSync(path.join(dir, `${c.name}.json`), EJSON.stringify(docs, { relaxed: false }, 1));
    manifest.collections[c.name] = docs.length;
    console.log(`  ${c.name.padEnd(22)} ${docs.length} records`);
  }
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`\nBackup saved in: ${dir}`);
  console.log('Keep this folder private (it contains staff password hashes).');
  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
