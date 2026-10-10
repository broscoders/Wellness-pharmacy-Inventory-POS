const router = require('express').Router();
const c = require('../controllers/report.controller');
const { protect, requirePermission } = require('../middleware/auth');

router.use(protect, requirePermission('reports:view'));
router.get('/sales', c.sales);
router.get('/inventory', c.inventory);
router.get('/movements', c.movements);
router.get('/suppliers', c.suppliers);
router.get('/customers', c.customers);
router.get('/profit', c.profit);
router.get('/products', c.products);

module.exports = router;
