'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { KeyRound, LayoutDashboard, ShoppingCart, Receipt, Pill, LogOut, Menu, X, Boxes, Truck, Users, Building2, FileText, Wallet, BarChart3, Tags, UserCog, ScrollText, Settings, Landmark, ClipboardList, TrendingUp, Users2, ClipboardCheck, Barcode as BarcodeIcon, PackageX, BellRing, CalendarCheck } from 'lucide-react';
import { homeFor, pageFor } from '@/lib/access';
import { useAuth } from '@/context/AuthContext';
import { Spinner } from '@/components/ui';
import ChangePassword from '@/components/ChangePassword';
import { SettingsProvider, useSettings } from '@/context/SettingsContext';

// Only pages that exist are listed. Each item shows only if the user has the permission.
const GROUPS = [
  { title: 'Sell', items: [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, perm: 'dashboard:view' },
    { href: '/pos', label: 'POS / Billing', icon: ShoppingCart, perm: 'pos:use' },
    { href: '/sales', label: 'Sales & Returns', icon: Receipt, perm: 'sales:view' },
    { href: '/shifts', label: 'Cash closing', icon: Landmark, perm: 'shifts:use' },
  ] },
  { title: 'Stock', items: [
    { href: '/medicines', label: 'Medicines', icon: Pill, perm: 'medicines:view' },
    { href: '/inventory', label: 'Inventory & Expiry', icon: Boxes, perm: 'inventory:view' },
    { href: '/stock-take', label: 'Stock take', icon: ClipboardCheck, perm: 'inventory:adjust' },
    { href: '/expiry-returns', label: 'Expiry returns', icon: PackageX, perm: 'inventory:view' },
    { href: '/labels', label: 'Barcode labels', icon: BarcodeIcon, perm: 'medicines:manage' },
    { href: '/purchase-orders', label: 'Purchase orders', icon: ClipboardList, perm: 'purchases:view' },
    { href: '/purchases', label: 'Purchases', icon: Truck, perm: 'purchases:view' },
  ] },
  { title: 'People', items: [
    { href: '/customers', label: 'Customers (udhaar)', icon: Users, perm: 'customers:view' },
    { href: '/udhaar', label: 'Udhaar reminders', icon: BellRing, perm: 'customers:view' },
    { href: '/suppliers', label: 'Suppliers', icon: Building2, perm: 'suppliers:view' },
    { href: '/prescriptions', label: 'Prescriptions', icon: FileText, perm: 'prescriptions:view' },
  ] },
  { title: 'Owner', items: [
    { href: '/expenses', label: 'Expenses', icon: Wallet, perm: 'expenses:view' },
    { href: '/daily', label: 'Daily summary', icon: CalendarCheck, perm: 'reports:view' },
    { href: '/finance', label: 'Finance & profit', icon: TrendingUp, perm: 'reports:view' },
    { href: '/payroll', label: 'Staff salaries', icon: Users2, perm: 'payroll:manage' },
    { href: '/reports', label: 'Reports', icon: BarChart3, perm: 'reports:view' },
    { href: '/categories', label: 'Categories', icon: Tags, perm: 'categories:manage' },
    { href: '/users', label: 'Staff & roles', icon: UserCog, perm: 'users:manage' },
    { href: '/audit', label: 'Audit log', icon: ScrollText, perm: 'audit:view' },
    { href: '/settings', label: 'Shop settings', icon: Settings, perm: 'settings:manage' },
  ] },
];

export default function AppShell({ children }) {
  const { user, loading } = useAuth();
  if (loading || !user) return <Shell>{children}</Shell>;
  return <SettingsProvider><Shell>{children}</Shell></SettingsProvider>;
}

function Shell({ children }) {
  const { user, loading, logout, can } = useAuth();
  const { settings } = useSettings();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pwd, setPwd] = useState(false);
  // Desktop: the menu can be folded into a narrow icon strip to give the screen more room (remembered on this computer).
  const [pref, setPref] = useState(null); // null = nothing chosen yet
  useEffect(() => { try { const v = localStorage.getItem('wp_sidebar_collapsed'); setPref(v === null ? null : v === '1'); } catch { /* storage blocked */ } }, []);
  const fold = (v) => { setPref(v); try { localStorage.setItem('wp_sidebar_collapsed', v ? '1' : '0'); } catch { /* storage blocked */ } };
  // Billing needs every pixel: unless the person has chosen, the menu starts folded on the POS and open everywhere else.
  const collapsed = pref ?? pathname.startsWith('/pos');

  useEffect(() => { if (!loading && !user) router.replace('/login'); }, [loading, user, router]);
  useEffect(() => setOpen(false), [pathname]);

  if (loading || !user) return <Spinner label="Loading..." />;
  const page = pageFor(pathname, GROUPS.flatMap((g) => g.items));
  const blocked = !!page && !can(page.perm);
  const groups = GROUPS.map((g) => ({ ...g, items: g.items.filter((n) => can(n.perm)) })).filter((g) => g.items.length);

  const nav = (
    <nav className="flex flex-1 flex-col gap-4 overflow-y-auto p-3">
      {groups.map((g) => (
        <div key={g.title}>
          <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-widest text-emerald-200/50">{g.title}</p>
          {g.items.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link key={href} href={href} className={`flex items-center gap-3 rounded-xl px-3 py-2 text-[14px] font-medium transition-colors ${active ? 'brand-gradient text-white shadow-lg shadow-black/20' : 'text-emerald-50/80 hover:bg-white/10 hover:text-white'}`}>
                <Icon className="h-[18px] w-[18px]" /> {label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );

  return (
    <div className={`min-h-screen lg:grid ${collapsed ? 'lg:grid-cols-[56px_1fr]' : 'lg:grid-cols-[240px_1fr]'}`}>
      {collapsed ? (
        // folded menu: icons only. The 3-bar button opens the full menu over the page, like on a phone.
        <aside className="no-print hidden flex-col items-center sidebar-dark lg:sticky lg:top-0 lg:flex lg:h-screen">
          <button onClick={() => setOpen(true)} className="mt-3 rounded-xl p-2 text-white hover:bg-white/10" aria-label="Open menu" title="Open menu"><Menu className="h-6 w-6" /></button>
          <nav className="mt-2 flex flex-1 flex-col items-center gap-1 overflow-y-auto py-2" aria-label="Menu icons">
            {groups.flatMap((g) => g.items).map(({ href, label, icon: Icon }) => {
              const active = pathname === href || pathname.startsWith(`${href}/`);
              return <Link key={href} href={href} title={label} aria-label={label} className={`rounded-xl p-2 ${active ? 'brand-gradient text-white shadow-lg shadow-black/20' : 'text-emerald-50/80 hover:bg-white/10 hover:text-white'}`}><Icon className="h-[18px] w-[18px]" /></Link>;
            })}
          </nav>
          <button onClick={logout} className="mb-3 rounded-xl p-2 text-emerald-100/70 hover:bg-white/10 hover:text-white" aria-label="Sign out" title="Sign out"><LogOut className="h-[18px] w-[18px]" /></button>
        </aside>
      ) : (
      <aside className="no-print hidden sidebar-dark lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col">
        <div className="flex h-16 items-center gap-2 border-b border-white/10 pl-2 pr-5 text-[15px] font-bold tracking-tight text-white"><button onClick={() => fold(true)} className="rounded-xl p-2 text-white hover:bg-white/10" aria-label="Fold menu" title="Fold menu to give the screen more room"><Menu className="h-5 w-5" /></button><span className="brand-gradient flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"><Pill className="h-4 w-4" /></span><span className="truncate">{settings.shopName}</span></div>
        {nav}
        <div className="border-t border-white/10 p-3">
          <div className="glass mb-2 flex items-center gap-3 rounded-2xl p-3"><span className="brand-gradient flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white">{(user.name || "?").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()}</span><div className="min-w-0"><p className="truncate font-semibold text-white">{user.name}</p><p className="flex items-center gap-1.5 text-xs capitalize text-emerald-200/70"><i className="live-dot" /> {user.role}</p></div></div>
          <button onClick={() => setPwd(true)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-emerald-100/70 hover:bg-white/10 hover:text-white"><KeyRound className="h-[18px] w-[18px]" /> Change password</button>
          <button onClick={logout} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-emerald-100/70 hover:bg-white/10 hover:text-white"><LogOut className="h-[18px] w-[18px]" /> Sign out</button>
        </div>
      </aside>
      )}

      <div className="no-print flex h-14 items-center justify-between sidebar-dark px-4 lg:hidden">
        <span className="flex items-center gap-2 font-bold text-white"><Pill className="h-5 w-5" /> {settings.shopName}</span>
        <button onClick={() => setOpen(true)} aria-label="Open menu" className="text-white"><Menu className="h-6 w-6" /></button>
      </div>
      {open && (
        <div className="no-print fixed inset-0 z-40 bg-ink/40" onClick={() => setOpen(false)}>
          <aside className="flex h-full w-72 flex-col sidebar-dark shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex h-14 items-center justify-between border-b border-white/10 px-5 font-semibold text-white">Menu <button onClick={() => setOpen(false)}><X className="h-5 w-5" /></button></div>
            {nav}
            <button onClick={() => { setOpen(false); setPwd(true); }} className="mx-3 flex items-center gap-3 rounded-xl px-3 py-2 text-emerald-100/70 hover:bg-white/10"><KeyRound className="h-[18px] w-[18px]" /> Change password</button>
            <button onClick={logout} className="m-3 flex items-center gap-3 rounded-xl px-3 py-2 text-emerald-100/70 hover:bg-white/10"><LogOut className="h-[18px] w-[18px]" /> Sign out</button>
          </aside>
        </div>
      )}

      <main className="min-w-0 p-4 lg:p-8">{user.mustChangePassword ? null : blocked ? <NoAccess home={homeFor(can)} /> : children}</main>
      {(pwd || user.mustChangePassword) && <ChangePassword forced={!!user.mustChangePassword} onClose={() => setPwd(false)} />}
    </div>
  );
}

// Shown if someone types an address that belongs to a screen their role does not have.
function NoAccess({ home }) {
  return (
    <div className="mx-auto mt-16 max-w-md rounded-lg border border-line bg-white p-8 text-center">
      <p className="text-lg font-semibold">This screen is not available to your role</p>
      <p className="mt-2 text-sm text-muted">If you need it, ask the owner to give you access.</p>
      <Link href={home} className="mt-4 inline-block rounded-md bg-pine px-4 py-2 text-sm font-medium text-white">Go to my home screen</Link>
    </div>
  );
}
