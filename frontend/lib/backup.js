import { api } from '@/lib/api';

const PAGE = 500;

// Reads every collection page by page (small requests, so it works on Vercel's size limits) and returns ONE bundle:
//   { manifest: { database, createdAt, collections: { name: count } }, collections: { name: [docs in extended JSON] } }
// `npm run restore -- <file> --yes` puts such a file back into a database.
export async function buildBackup(onProgress = () => {}) {
  const man = await api('/ops/backup/manifest');
  const names = Object.keys(man.collections);
  const collections = {};
  for (let i = 0; i < names.length; i += 1) {
    const name = names[i];
    const docs = [];
    for (let skip = 0; ; skip += PAGE) {
      onProgress({ name, index: i, total: names.length, done: docs.length, of: man.collections[name] });
      const page = await api(`/ops/backup/${encodeURIComponent(name)}`, { params: { skip, limit: PAGE } });
      docs.push(...page.docs);
      if (page.count < PAGE) break;
    }
    collections[name] = docs;
  }
  return { manifest: { database: man.database, createdAt: new Date().toISOString(), collections: Object.fromEntries(Object.entries(collections).map(([k, v]) => [k, v.length])) }, collections };
}

export function saveBundle(bundle) {
  const blob = new Blob([JSON.stringify(bundle)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `wellness-backup-${bundle.manifest.createdAt.slice(0, 10)}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export async function markBackupDone() { await api('/ops/backup/done', { method: 'POST' }); }
