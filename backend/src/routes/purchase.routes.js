const router = require('express').Router();
const c = require('../controllers/purchase.controller');
const validate = require('../middleware/validate');
const { protect, requirePermission } = require('../middleware/auth');

router.use(protect);
router.get('/', requirePermission('purchases:view'), c.list);
router.get('/returns', requirePermission('purchases:view'), c.listReturns);
router.get('/:id', requirePermission('purchases:view'), c.getOne);
router.post('/', requirePermission('purchases:manage'), validate(c.createSchema), c.create);
router.post('/:id/return', requirePermission('purchases:return'), validate(c.returnSchema), c.doReturn);

module.exports = router;
