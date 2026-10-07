const { z } = require('zod');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const audit = require('../utils/audit');
const env = require('../config/env');
const { signAccess, signRefresh, verifyRefresh } = require('../utils/tokens');

const REFRESH_COOKIE = 'wp_refresh';

const cookieOptions = () => ({
  httpOnly: true,
  secure: env.isProd,
  sameSite: env.isProd ? 'none' : 'lax',
  path: '/api/auth',
  maxAge: 7 * 24 * 60 * 60 * 1000,
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, 'Password must be at least 8 characters').max(72),
});

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email }).select('+password');
  // Same message for unknown email / wrong password: prevents account enumeration.
  if (!user || !(await user.comparePassword(password))) throw ApiError.unauthorized('Invalid email or password');
  if (!user.isActive) throw ApiError.forbidden('Your account has been disabled. Contact the owner.');

  user.lastLoginAt = new Date();
  await user.save({ validateBeforeSave: false });

  res.cookie(REFRESH_COOKIE, signRefresh(user), cookieOptions());
  res.json({ success: true, accessToken: signAccess(user), user: user.toSafeJSON() });
});

const refresh = asyncHandler(async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (!token) throw ApiError.unauthorized('No refresh token');
  let payload;
  try {
    payload = verifyRefresh(token);
  } catch (e) {
    throw ApiError.unauthorized('Session expired, please login again');
  }
  const user = await User.findById(payload.sub);
  if (!user || !user.isActive || user.tokenVersion !== payload.tv) {
    throw ApiError.unauthorized('Session expired, please login again');
  }
  res.json({ success: true, accessToken: signAccess(user), user: user.toSafeJSON() });
});

const logout = asyncHandler(async (req, res) => {
  res.clearCookie(REFRESH_COOKIE, { ...cookieOptions(), maxAge: undefined });
  res.json({ success: true, message: 'Logged out' });
});

const me = asyncHandler(async (req, res) => {
  res.json({ success: true, user: req.user.toSafeJSON() });
});

const changePassword = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select('+password');
  if (!(await user.comparePassword(req.body.currentPassword))) {
    throw ApiError.badRequest('Current password is incorrect');
  }
  user.password = req.body.newPassword;
  user.tokenVersion += 1; // logs out all other sessions
  await user.save();
  await audit(req, 'auth.password_change', 'User', user._id);
  res.cookie(REFRESH_COOKIE, signRefresh(user), cookieOptions());
  res.json({ success: true, accessToken: signAccess(user), message: 'Password updated' });
});

module.exports = { login, refresh, logout, me, changePassword, loginSchema, changePasswordSchema };
