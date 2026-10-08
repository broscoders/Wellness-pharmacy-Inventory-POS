const router = require('express').Router();
const express = require('express');
const c = require('../controllers/prescription.controller');
const validate = require('../middleware/validate');
const { protect, requirePermission } = require('../middleware/auth');

router.use(protect);
router.get('/', requirePermission('prescriptions:view'), c.list);
router.get('/:id', requirePermission('prescriptions:view'), c.getOne);
router.get('/:id/file', requirePermission('prescriptions:view'), c.downloadFile);
router.post('/', requirePermission('prescriptions:manage'), validate(c.createSchema), c.create);
router.patch('/:id', requirePermission('prescriptions:manage'), validate(c.updateSchema), c.update);
router.put('/:id/file', requirePermission('prescriptions:manage'), express.raw({ type: c.ALLOWED_FILES, limit: c.MAX_FILE }), c.uploadFile);

module.exports = router;
