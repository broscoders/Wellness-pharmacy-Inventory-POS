const router = require('express').Router();
const { z } = require('zod');
const Customer = require('../models/Customer');
const crud = require('../controllers/crud.factory')(Customer, { entity: 'Customer', searchFields: ['name', 'phone'] });
const validate = require('../middleware/validate');
const { protect, requirePermission } = require('../middleware/auth');
const ledgerCtl = require('../controllers/customerLedger.controller');
const { defaultCreditLimit } = require('../services/settings.service');

const base = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(20).optional(),
  address: z.string().trim().max(300).optional(),
  type: z.enum(['retail', 'wholesale']).optional(),
  notes: z.string().trim().max(500).optional(),
  creditLimit: z.number().min(0).optional(),
  isActive: z.boolean().optional(),
});

// Cashiers can add a customer and fix a name or phone, but only the owner sets credit limits or archives customers.
// A customer added by a cashier starts with the shop's default udhaar limit (Shop settings), never "no limit".
const ownerOnlyFields = async (req, res, next) => {
  try {
    const can = req.user.permissions().includes('customers:credit');
    if (can) return next();
    if (req.method === 'POST') {
      delete req.body.isActive;
      req.body.creditLimit = await defaultCreditLimit();
    } else if (req.body.creditLimit !== undefined || req.body.isActive !== undefined) {
      return next(require('../utils/ApiError').forbidden('Only the owner can change a credit limit'));
    }
    return next();
  } catch (e) { return next(e); }
};

router.use(protect);
router.get('/receivables', requirePermission('customers:view'), ledgerCtl.receivables);
router.get('/', requirePermission('customers:view'), crud.list);
router.get('/:id', requirePermission('customers:view'), crud.getOne);
router.get('/:id/ledger', requirePermission('customers:view'), ledgerCtl.ledger);
router.post('/:id/payments', requirePermission('payments:manage'), validate(ledgerCtl.paymentSchema), ledgerCtl.receivePayment);
router.post('/', requirePermission('customers:manage'), validate(base), ownerOnlyFields, crud.create);
router.patch('/:id', requirePermission('customers:manage'), validate(base.partial()), ownerOnlyFields, crud.update);
router.delete('/:id', requirePermission('customers:credit'), crud.archive);

module.exports = router;
