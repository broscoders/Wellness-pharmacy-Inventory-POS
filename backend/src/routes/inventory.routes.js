const router = require('express').Router();
const c = require('../controllers/inventory.controller');
const validate = require('../middleware/validate');
const { protect, requirePermission } = require('../middleware/auth');

router.use(protect);
router.get('/alerts', requirePermission('inventory:view'), c.alerts);
router.get('/reorder', requirePermission('inventory:view'), c.reorder);
router.get('/summary', requirePermission('inventory:view'), c.summary);
router.get('/batches', requirePermission('inventory:view'), c.listBatches);
router.get('/movements', requirePermission('inventory:view'), c.movements);
router.post('/batches', requirePermission('inventory:manage'), validate(c.createBatchSchema), c.createBatch);
router.post('/batches/:id/adjust', requirePermission('inventory:adjust'), validate(c.adjustSchema), c.adjust);

module.exports = router;
