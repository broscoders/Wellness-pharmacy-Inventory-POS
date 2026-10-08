'use client';
import ResourcePage, { ActiveBadge } from '@/components/ResourcePage';

export default function CategoriesPage() {
  return (
    <ResourcePage title="Categories" subtitle="Group medicines (tablet, syrup, injection...)" endpoint="/categories" manage="categories:manage" noun="category" newLabel="Add category"
      searchPlaceholder="Search categories..." archivable
      fields={[{ key: 'name', label: 'Name', required: true }, { key: 'description', label: 'Description', wide: true }]}
      columns={[{ label: 'Category', render: (c) => <span className="font-medium">{c.name}</span> }, { label: 'Description', render: (c) => c.description || '-' }, { label: 'Status', render: (c) => <ActiveBadge row={c} /> }]} />
  );
}
