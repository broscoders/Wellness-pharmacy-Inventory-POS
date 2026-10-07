const router = require('express').Router();
const { z } = require('zod');
const Customer = require('../models/Customer');
const crud = require('../controllers/crud.factory')(Customer, { entity: 'Customer', searchFields: ['name', 'phone'] });
const validate = require('../middleware/validate');
const { protect, requirePermission } = require('../middleware/auth');

const base = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(20).optional(),
  address: z.string().trim().max(300).optional(),
  type: z.enum(['retail', 'wholesale']).optional(),
  notes: z.string().trim().max(500).optional(),
  creditLimit: z.number().min(0).optional(),
  isActive: z.boolean().optional(),
});

router.use(protect);
router.get('/', requirePermission('customers:view'), crud.list);
router.get('/:id', requirePermission('customers:view'), crud.getOne);
router.post('/', requirePermission('customers:manage'), validate(base), crud.create);
router.patch('/:id', requirePermission('customers:manage'), validate(base.partial()), crud.update);
router.delete('/:id', requirePermission('customers:manage'), crud.archive);

module.exports = router;
