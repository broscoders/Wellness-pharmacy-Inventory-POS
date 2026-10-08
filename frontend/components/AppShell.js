'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, ShoppingCart, Receipt, Pill, LogOut, Menu, X, Boxes, Truck, Users, Building2, FileText, Wallet, BarChart3, Tags, UserCog, ScrollText } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Spinner } from '@/components/ui';

// Only pages that exist are listed. Each item shows only if the user has the permission.
const GROUPS = [
  { title: 'Sell', items: [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, perm: 'dashboard:view' },
    { href: '/pos', label: 'POS / Billing', icon: ShoppingCart, perm: 'pos:use' },
    { href: '/sales', label: 'Sales & Returns', icon: Receipt, perm: 'sales:view' },
  ] },
  { title: 'Stock', items: [
    { href: '/medicines', label: 'Medicines', icon: Pill, perm: 'medicines:view' },
    { href: '/inventory', label: 'Inventory & Expiry', icon: Boxes, perm: 'inventory:view' },
    { href: '/purchases', label: 'Purchases', icon: Truck, perm: 'purchases:view' },
  ] },
  { title: 'People', items: [
    { href: '/customers', label: 'Customers (udhaar)', icon: Users, perm: 'customers:view' },
    { href: '/suppliers', label: 'Suppliers', icon: Building2, perm: 'suppliers:view' },
    { href: '/prescriptions', label: 'Prescriptions', icon: FileText, perm: 'prescriptions:view' },
  ] },
  { title: 'Owner', items: [
    { href: '/expenses', label: 'Expenses', icon: Wallet, perm: 'expenses:view' },
    { href: '/reports', label: 'Reports', icon: BarChart3, perm: 'reports:view' },
    { href: '/categories', label: 'Categories', icon: Tags, perm: 'categories:manage' },
    { href: '/users', label: 'Staff & roles', icon: UserCog, perm: 'users:manage' },
    { href: '/audit', label: 'Audit log', icon: ScrollText, perm: 'audit:view' },
  ] },
];

export default function AppShell({ children }) {
  const { user, loading, logout, can } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => { if (!loading && !user) router.replace('/login'); }, [loading, user, router]);
  useEffect(() => setOpen(false), [pathname]);

  if (loading || !user) return <Spinner label="Loading..." />;
  const groups = GROUPS.map((g) => ({ ...g, items: g.items.filter((n) => can(n.perm)) })).filter((g) => g.items.length);

  const nav = (
    <nav className="flex flex-1 flex-col gap-4 overflow-y-auto p-3">
      {groups.map((g) => (
        <div key={g.title}>
          <p className="mb-1 px-3 text-xs font-medium text-muted">{g.title}</p>
          {g.items.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link key={href} href={href} className={`flex items-center gap-3 rounded-md px-3 py-2 text-[14px] font-medium ${active ? 'bg-pine text-white' : 'text-ink hover:bg-mint'}`}>
                <Icon className="h-[18px] w-[18px]" /> {label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="no-print hidden border-r border-line bg-white lg:flex lg:flex-col">
        <div className="flex h-14 items-center gap-2 border-b border-line px-5 font-semibold text-pine-dark"><Pill className="h-5 w-5" /> Wellness Pharmacy</div>
        {nav}
        <div className="border-t border-line p-3">
          <div className="px-3 pb-2"><p className="truncate font-medium">{user.name}</p><p className="text-xs capitalize text-muted">{user.role}</p></div>
          <button onClick={logout} className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-muted hover:bg-mint hover:text-ink"><LogOut className="h-[18px] w-[18px]" /> Sign out</button>
        </div>
      </aside>

      <div className="no-print flex h-14 items-center justify-between border-b border-line bg-white px-4 lg:hidden">
        <span className="flex items-center gap-2 font-semibold text-pine-dark"><Pill className="h-5 w-5" /> Wellness Pharmacy</span>
        <button onClick={() => setOpen(true)} aria-label="Open menu"><Menu className="h-6 w-6" /></button>
      </div>
      {open && (
        <div className="no-print fixed inset-0 z-40 bg-ink/40 lg:hidden" onClick={() => setOpen(false)}>
          <aside className="flex h-full w-64 flex-col bg-white" onClick={(e) => e.stopPropagation()}>
            <div className="flex h-14 items-center justify-between border-b border-line px-5 font-semibold text-pine-dark">Menu <button onClick={() => setOpen(false)}><X className="h-5 w-5" /></button></div>
            {nav}
            <button onClick={logout} className="m-3 flex items-center gap-3 rounded-md px-3 py-2 text-muted hover:bg-mint"><LogOut className="h-[18px] w-[18px]" /> Sign out</button>
          </aside>
        </div>
      )}

      <main className="min-w-0 p-4 lg:p-6">{children}</main>
    </div>
  );
}
