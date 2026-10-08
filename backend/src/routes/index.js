const router = require('express').Router();

const connectDB = require('../config/db');

router.get('/health', (req, res) =>
  res.json({ success: true, status: 'ok', database: connectDB.status(), time: new Date().toISOString() })
);
router.use('/auth', require('./auth.routes'));
router.use('/users', require('./user.routes'));
router.use('/categories', require('./category.routes'));
router.use('/suppliers', require('./supplier.routes'));
router.use('/customers', require('./customer.routes'));
router.use('/medicines', require('./medicine.routes'));
router.use('/inventory', require('./inventory.routes'));
router.use('/sales', require('./sale.routes'));
router.use('/purchases', require('./purchase.routes'));
router.use('/dashboard', require('./dashboard.routes'));

module.exports = router;
