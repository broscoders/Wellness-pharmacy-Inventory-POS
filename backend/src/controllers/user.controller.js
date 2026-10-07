const { z } = require('zod');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const audit = require('../utils/audit');
const { ROLES } = require('../config/permissions');

const createSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email(),
  phone: z.string().trim().max(20).optional(),
  password: z.string().min(8).max(72),
  role: z.enum(ROLES),
});

const updateSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  phone: z.string().trim().max(20).optional(),
  role: z.enum(ROLES).optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(8).max(72).optional(), // admin reset
});

const list = asyncHandler(async (req, res) => {
  const users = await User.find().sort({ createdAt: -1 });
  res.json({ success: true, data: users.map((u) => u.toSafeJSON()) });
});

const create = asyncHandler(async (req, res) => {
  const user = await User.create(req.body);
  await audit(req, 'user.create', 'User', user._id, { email: user.email, role: user.role });
  res.status(201).json({ success: true, data: user.toSafeJSON() });
});

const update = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw ApiError.notFound('User not found');

  const isSelf = String(user._id) === String(req.user._id);
  if (isSelf && (req.body.isActive === false || (req.body.role && req.body.role !== 'admin'))) {
    throw ApiError.badRequest('You cannot disable or demote your own account');
  }

  const { password, ...rest } = req.body;
  Object.assign(user, rest);
  if (password) {
    user.password = password;
    user.tokenVersion += 1;
  }
  if (rest.isActive === false || rest.role) user.tokenVersion += 1;
  await user.save();
  await audit(req, 'user.update', 'User', user._id, { ...rest, passwordReset: !!password });
  res.json({ success: true, data: user.toSafeJSON() });
});

module.exports = { list, create, update, createSchema, updateSchema };
