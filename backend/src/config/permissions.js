// Single source of truth for role-based access control (RBAC).
// Owner/admin ("admin") has everything. Others get the listed permissions.
const ALL = [
  'dashboard:view',
  'users:manage',
  'categories:view', 'categories:manage',
  'medicines:view', 'medicines:manage',
  'inventory:view', 'inventory:manage', 'inventory:adjust',
  'suppliers:view', 'suppliers:manage',
  'customers:view', 'customers:manage',
  'pos:use', 'sales:view', 'sales:cancel', 'sales:discount', 'sales:return',
  'purchases:view', 'purchases:manage', 'purchases:return',
  'payments:manage',
  'prescriptions:view', 'prescriptions:manage',
  'expenses:view', 'expenses:manage',
  'reports:view',
  'audit:view',
];

const ROLE_PERMISSIONS = {
  admin: ALL,
  pharmacist: [
    'dashboard:view',
    'categories:view',
    'medicines:view', 'medicines:manage',
    'inventory:view', 'inventory:manage',
    'customers:view',
    'pos:use', 'sales:view', 'sales:return',
    'prescriptions:view', 'prescriptions:manage',
  ],
  cashier: [
    'dashboard:view',
    'medicines:view',
    'inventory:view',
    'customers:view', 'customers:manage',
    'pos:use', 'sales:view',
    'payments:manage',
  ],
  inventory: [
    'dashboard:view',
    'categories:view', 'categories:manage',
    'medicines:view', 'medicines:manage',
    'inventory:view', 'inventory:manage', 'inventory:adjust',
    'suppliers:view', 'suppliers:manage',
    'purchases:view', 'purchases:manage', 'purchases:return',
    'payments:manage',
  ],
};

const ROLES = Object.keys(ROLE_PERMISSIONS);

module.exports = { ALL, ROLE_PERMISSIONS, ROLES };
