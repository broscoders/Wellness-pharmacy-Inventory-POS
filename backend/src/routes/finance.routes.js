const router = require('express').Router();
const c = require('../controllers/finance.controller');
const { protect, requirePermission } = require('../middleware/auth');

router.use(protect, requirePermission('reports:view'));
router.get('/summary', c.summary);
router.get('/pricing-issues', c.pricing);

module.exports = router;
