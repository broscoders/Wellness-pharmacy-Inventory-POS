const router = require('express').Router();
const c = require('../controllers/sale.controller');
const validate = require('../middleware/validate');
const { protect, requirePermission } = require('../middleware/auth');

router.use(protect);
router.post('/', requirePermission('pos:use'), validate(c.createSchema), c.create);
router.get('/', requirePermission('sales:view'), c.list);
router.get('/returns', requirePermission('sales:view'), c.listReturns);
router.get('/invoice/:invoiceNo', requirePermission('sales:view'), c.byInvoice);
router.get('/:id', requirePermission('sales:view'), c.getOne);
router.post('/:id/return', requirePermission('sales:return'), validate(c.returnSchema), c.doReturn);
router.post('/:id/cancel', requirePermission('sales:cancel'), validate(c.cancelSchema), c.cancel);

module.exports = router;
