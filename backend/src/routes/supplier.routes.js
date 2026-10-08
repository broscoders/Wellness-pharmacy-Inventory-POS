const router = require('express').Router();
const { z } = require('zod');
const Supplier = require('../models/Supplier');
const crud = require('../controllers/crud.factory')(Supplier, { entity: 'Supplier', searchFields: ['name', 'phone', 'contactPerson'] });
const validate = require('../middleware/validate');
const { protect, requirePermission } = require('../middleware/auth');
const ledgerCtl = require('../controllers/supplierLedger.controller');

const base = z.object({
  name: z.string().trim().min(2).max(120),
  contactPerson: z.string().trim().max(80).optional(),
  phone: z.string().trim().max(20).optional(),
  email: z.string().trim().email().optional().or(z.literal('')),
  address: z.string().trim().max(300).optional(),
  notes: z.string().trim().max(500).optional(),
  isActive: z.boolean().optional(),
});

router.use(protect);
router.get('/payables', requirePermission('suppliers:view'), ledgerCtl.payables);
router.get('/', requirePermission('suppliers:view'), crud.list);
router.get('/:id', requirePermission('suppliers:view'), crud.getOne);
router.get('/:id/ledger', requirePermission('suppliers:view'), ledgerCtl.ledger);
router.post('/:id/payments', requirePermission('payments:manage'), validate(ledgerCtl.paymentSchema), ledgerCtl.pay);
router.post('/', requirePermission('suppliers:manage'), validate(base), crud.create);
router.patch('/:id', requirePermission('suppliers:manage'), validate(base.partial()), crud.update);
router.delete('/:id', requirePermission('suppliers:manage'), crud.archive);

module.exports = router;
