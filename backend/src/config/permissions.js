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
  'settings:manage',
  'shifts:use', 'shifts:manage',
  'payroll:manage',
  // Sensitive extras (admin only unless listed below)
  'costs:view',          // purchase prices, profit and margins anywhere in the app
  'sales:view_all',      // see every cashier's bills (others see only their own)
  'sales:discount_any',  // discount beyond the shop's limit
  'customers:credit',    // change a customer's credit limit or archive a customer
];

const ROLE_PERMISSIONS = {
  admin: ALL,
  pharmacist: [
    'dashboard:view',
    'categories:view',
    'medicines:view', 'medicines:manage',
    'inventory:view', 'inventory:manage',
    'customers:view',
    'pos:use', 'sales:view', 'sales:view_all', 'sales:return', 'sales:discount',
    'prescriptions:view', 'prescriptions:manage',
    'shifts:use',
  ],
  cashier: [
    'dashboard:view',
    'medicines:view',
    'customers:view', 'customers:manage',
    'pos:use', 'sales:view', 'sales:discount',
    'payments:manage',
    'shifts:use',
  ],
  inventory: [
    'dashboard:view',
    'categories:view', 'categories:manage',
    'medicines:view', 'medicines:manage',
    'inventory:view', 'inventory:manage', 'inventory:adjust',
    'suppliers:view', 'suppliers:manage',
    'purchases:view', 'purchases:manage', 'purchases:return',
    'payments:manage',
    'costs:view',
  ],
};

const ROLES = Object.keys(ROLE_PERMISSIONS);

module.exports = { ALL, ROLE_PERMISSIONS, ROLES };
