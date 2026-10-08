const router = require('express').Router();
const c = require('../controllers/expense.controller');
const validate = require('../middleware/validate');
const { protect, requirePermission } = require('../middleware/auth');

router.use(protect);
router.get('/', requirePermission('expenses:view'), c.list);
router.post('/', requirePermission('expenses:manage'), validate(c.createSchema), c.create);
router.post('/:id/void', requirePermission('expenses:manage'), validate(c.voidSchema), c.voidExpense);

module.exports = router;
