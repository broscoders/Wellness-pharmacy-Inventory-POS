const router = require('express').Router();
const c = require('../controllers/dashboard.controller');
const { protect, requirePermission } = require('../middleware/auth');

router.get('/', protect, requirePermission('dashboard:view'), c.summary);

module.exports = router;
