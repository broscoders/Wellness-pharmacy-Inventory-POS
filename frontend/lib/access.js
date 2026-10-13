// Where each kind of staff member lands after signing in, and which screen needs which permission.
// (The server enforces every permission anyway; this only keeps people from landing on screens that are not theirs.)
export function homeFor(can) {
  if (can('reports:view')) return '/dashboard';   // owner
  if (can('pos:use')) return '/pos';              // cashier, pharmacist: straight to billing
  return '/dashboard';                            // inventory staff: their counter home
}

// extra pages that are not in the menu
export const EXTRA_PAGES = [{ href: '/medicines/import', perm: 'medicines:manage' }];

// The menu item (or extra page) that owns this address, longest match first.
export function pageFor(pathname, items) {
  return [...items, ...EXTRA_PAGES].filter((i) => pathname === i.href || pathname.startsWith(`${i.href}/`)).sort((a, b) => b.href.length - a.href.length)[0];
}
