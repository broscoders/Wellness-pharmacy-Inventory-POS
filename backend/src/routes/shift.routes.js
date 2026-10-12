const router = require('express').Router();
const c = require('../controllers/shift.controller');
const validate = require('../middleware/validate');
const { protect, requirePermission } = require('../middleware/auth');

router.use(protect, requirePermission('shifts:use', 'shifts:manage'));
router.get('/current', c.current);
router.get('/', c.list);
router.post('/', validate(c.openSchema), c.open);
router.get('/:id', c.getOne);
router.post('/:id/movement', validate(c.movementSchema), c.addMovement);
router.post('/:id/close', validate(c.closeSchema), c.close);

module.exports = router;
