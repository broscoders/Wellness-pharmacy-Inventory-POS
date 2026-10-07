const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { verifyAccess } = require('../utils/tokens');

// Verifies the Bearer access token and attaches req.user.
const protect = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw ApiError.unauthorized('Authentication required');

  let payload;
  try {
    payload = verifyAccess(token);
  } catch (e) {
    throw ApiError.unauthorized('Session expired, please login again');
  }

  const user = await User.findById(payload.sub);
  if (!user || !user.isActive) throw ApiError.unauthorized('Account not found or disabled');
  req.user = user;
  next();
});

// Usage: requirePermission('medicines:manage') - passes if user has ANY of the listed permissions.
const requirePermission = (...perms) => (req, res, next) => {
  const userPerms = req.user ? req.user.permissions() : [];
  if (perms.some((p) => userPerms.includes(p))) return next();
  return next(ApiError.forbidden());
};

module.exports = { protect, requirePermission };
