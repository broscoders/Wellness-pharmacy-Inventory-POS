const router = require('express').Router();
const c = require('../controllers/ops.controller');
const { protect, requirePermission } = require('../middleware/auth');

router.use(protect);
router.get('/expiry-plan', requirePermission('inventory:view'), c.expiry);
router.get('/udhaar-reminders', requirePermission('customers:credit'), c.udhaar);
router.post('/udhaar-reminders/:id/sent', requirePermission('customers:credit'), c.markReminded);
router.get('/daily-summary', requirePermission('reports:view'), c.daily);
router.get('/backup/manifest', requirePermission('settings:manage'), c.backupManifest);
router.post('/backup/done', requirePermission('settings:manage'), c.backupDone);
router.get('/backup/:collection', requirePermission('settings:manage'), c.backupPage);

module.exports = router;
