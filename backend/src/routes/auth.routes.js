const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const c = require('../controllers/auth.controller');
const validate = require('../middleware/validate');
const { protect } = require('../middleware/auth');

// Brute-force protection on login: 10 attempts / 15 min / IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many login attempts. Try again in 15 minutes.' },
});

router.post('/login', loginLimiter, validate(c.loginSchema), c.login);
router.post('/refresh', c.refresh);
router.post('/logout', c.logout);
router.get('/me', protect, c.me);
router.post('/change-password', protect, validate(c.changePasswordSchema), c.changePassword);

module.exports = router;
