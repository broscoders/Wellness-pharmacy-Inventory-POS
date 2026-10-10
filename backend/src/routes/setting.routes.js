const router = require('express').Router();
const { z } = require('zod');
const Setting = require('../models/Setting');
const asyncHandler = require('../utils/asyncHandler');
const audit = require('../utils/audit');
const validate = require('../middleware/validate');
const { protect, requirePermission } = require('../middleware/auth');

const schema = z.object({
  shopName: z.string().trim().min(2, 'Shop name is required').max(80),
  tagline: z.string().trim().max(100).optional(),
  address: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(60).optional(),
  email: z.string().trim().max(80).optional(),
  licenseNo: z.string().trim().max(60).optional(),
  ntn: z.string().trim().max(40).optional(),
  receiptFooter: z.string().trim().max(200).optional(),
});

const load = async () => (await Setting.findOne({ key: 'main' })) || new Setting({ key: 'main' });

// Everyone signed in can read it (needed to print receipts); only the owner can change it.
router.get('/', protect, asyncHandler(async (req, res) => {
  res.json({ success: true, data: await load() });
}));

router.put('/', protect, requirePermission('settings:manage'), validate(schema), asyncHandler(async (req, res) => {
  const doc = await Setting.findOneAndUpdate({ key: 'main' }, { $set: req.body, $setOnInsert: { key: 'main' } }, { upsert: true, returnDocument: 'after', runValidators: true });
  await audit(req, 'settings.update', 'Setting', doc._id, req.body);
  res.json({ success: true, data: doc });
}));

module.exports = router;
