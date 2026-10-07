const jwt = require('jsonwebtoken');
const env = require('../config/env');

const signAccess = (user) =>
  jwt.sign({ sub: String(user._id), role: user.role }, env.jwtAccessSecret, { expiresIn: env.jwtAccessExpires });

const signRefresh = (user) =>
  jwt.sign({ sub: String(user._id), tv: user.tokenVersion }, env.jwtRefreshSecret, { expiresIn: env.jwtRefreshExpires });

const verifyAccess = (t) => jwt.verify(t, env.jwtAccessSecret);
const verifyRefresh = (t) => jwt.verify(t, env.jwtRefreshSecret);

module.exports = { signAccess, signRefresh, verifyAccess, verifyRefresh };
