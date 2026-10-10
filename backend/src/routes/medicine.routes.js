const router = require('express').Router();
const c = require('../controllers/medicine.controller');
const validate = require('../middleware/validate');
const { protect, requirePermission } = require('../middleware/auth');

router.use(protect);
router.get('/', requirePermission('medicines:view'), c.list);
router.post('/import', requirePermission('medicines:manage'), requirePermission('inventory:manage'), validate(c.importSchema), c.importRows);
router.get('/barcode/:code', requirePermission('medicines:view'), c.byBarcode);
router.get('/:id', requirePermission('medicines:view'), c.getOne);
router.post('/', requirePermission('medicines:manage'), validate(c.createSchema), c.create);
router.patch('/:id', requirePermission('medicines:manage'), validate(c.updateSchema), c.update);
router.delete('/:id', requirePermission('medicines:manage'), c.archive);

module.exports = router;
