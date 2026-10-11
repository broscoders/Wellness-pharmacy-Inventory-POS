import AppShell from '@/components/AppShell';
import { CatalogProvider } from '@/context/CatalogContext';

export default function AppLayout({ children }) {
  return (
    <CatalogProvider>
      <AppShell>{children}</AppShell>
    </CatalogProvider>
  );
}
