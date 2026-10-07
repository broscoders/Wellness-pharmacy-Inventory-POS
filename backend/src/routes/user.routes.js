const router = require('express').Router();
const c = require('../controllers/user.controller');
const validate = require('../middleware/validate');
const { protect, requirePermission } = require('../middleware/auth');

router.use(protect, requirePermission('users:manage'));
router.get('/', c.list);
router.post('/', validate(c.createSchema), c.create);
router.patch('/:id', validate(c.updateSchema), c.update);

module.exports = router;
