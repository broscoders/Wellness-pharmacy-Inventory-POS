// Creates the first Owner/Admin account and a few default categories. Safe to run multiple times.
const env = require('../config/env');
env.validateEnv();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const User = require('../models/User');
const Category = require('../models/Category');

(async () => {
  await connectDB();
  const email = (process.env.SEED_ADMIN_EMAIL || 'owner@wellnesspharmacy.com').toLowerCase();
  const exists = await User.findOne({ email });
  if (!exists) {
    await User.create({
      name: process.env.SEED_ADMIN_NAME || 'Owner',
      email,
      password: process.env.SEED_ADMIN_PASSWORD || 'ChangeMe@12345',
      role: 'admin',
    });
    console.log(`Admin created: ${email}`);
  } else {
    console.log(`Admin already exists: ${email}`);
  }

  const defaults = ['Tablet', 'Capsule', 'Syrup', 'Injection', 'Ointment/Cream', 'Drops', 'Surgical', 'Supplements', 'Baby Care', 'General'];
  for (const name of defaults) {
    await Category.updateOne({ name }, { $setOnInsert: { name } }, { upsert: true });
  }
  console.log('Default categories ready');
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
