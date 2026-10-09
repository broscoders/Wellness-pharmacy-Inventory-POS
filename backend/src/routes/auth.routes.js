const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const c = require('../controllers/auth.controller');
const validate = require('../middleware/validate');
const { protect } = require('../middleware/auth');

// Brute-force protection. On Vercel the backend sees every staff member as coming from the same
// proxy IP, so limiting only by IP would lock the whole pharmacy out together. Therefore:
//  - per ACCOUNT (email): 10 failed/any attempts per 15 minutes
//  - per IP: a much higher ceiling, just to stop one machine from trying thousands of different emails
const msg = { success: false, message: 'Too many login attempts. Try again in 15 minutes.' };
const perAccount = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: msg,
  keyGenerator: (req) => `acct:${String(req.body?.email || '').trim().toLowerCase() || ipKeyGenerator(req.ip)}`,
});
const perIp = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: msg,
  keyGenerator: (req) => ipKeyGenerator(req.ip),
});
const loginLimiter = [perIp, perAccount];

router.post('/login', loginLimiter, validate(c.loginSchema), c.login);
router.post('/refresh', c.refresh);
router.post('/logout', c.logout);
router.get('/me', protect, c.me);
router.post('/change-password', protect, validate(c.changePasswordSchema), c.changePassword);

module.exports = router;
