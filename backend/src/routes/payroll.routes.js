const router = require('express').Router();
const c = require('../controllers/payroll.controller');
const validate = require('../middleware/validate');
const { protect, requirePermission } = require('../middleware/auth');

router.use(protect, requirePermission('payroll:manage'));
router.get('/employees', c.listEmployees);
router.post('/employees', validate(c.employeeSchema), c.createEmployee);
router.patch('/employees/:id', validate(c.employeeUpdateSchema), c.updateEmployee);
router.get('/sheet', c.sheet);
router.post('/payments', validate(c.paymentSchema), c.pay);
router.post('/payments/:id/void', validate(c.voidSchema), c.voidPayment);

module.exports = router;
