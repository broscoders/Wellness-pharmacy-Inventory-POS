const router = require('express').Router();
const c = require('../controllers/purchaseOrder.controller');
const validate = require('../middleware/validate');
const { protect, requirePermission } = require('../middleware/auth');

router.use(protect);
router.get('/', requirePermission('purchases:view'), c.list);
router.post('/', requirePermission('purchases:manage'), validate(c.createSchema), c.create);
router.post('/from-reorder', requirePermission('purchases:manage'), validate(c.reorderSchema), c.fromReorder);
router.get('/:id', requirePermission('purchases:view'), c.getOne);
router.patch('/:id', requirePermission('purchases:manage'), validate(c.updateSchema), c.update);
router.post('/:id/status', requirePermission('purchases:manage'), validate(c.statusSchema), c.setStatus);

module.exports = router;
