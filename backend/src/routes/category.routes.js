const router = require('express').Router();
const { z } = require('zod');
const Category = require('../models/Category');
const crud = require('../controllers/crud.factory')(Category, { entity: 'Category' });
const validate = require('../middleware/validate');
const { protect, requirePermission } = require('../middleware/auth');

const base = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(300).optional(),
  isActive: z.boolean().optional(),
});

router.use(protect);
router.get('/', requirePermission('categories:view'), crud.list);
router.get('/:id', requirePermission('categories:view'), crud.getOne);
router.post('/', requirePermission('categories:manage'), validate(base), crud.create);
router.patch('/:id', requirePermission('categories:manage'), validate(base.partial()), crud.update);
router.delete('/:id', requirePermission('categories:manage'), crud.archive);

module.exports = router;
