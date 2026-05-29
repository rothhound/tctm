import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGetEntitiesQuery, useCreateEntityMutation, useDeleteEntityMutation } from '../../store/api';
import { usePageTitle } from '../../hooks/usePageTitle';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { EmptyState } from '../../components/ui/EmptyState';

const TYPE_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  person: { bg: '#E6F1FB', text: '#1F6FCF', label: 'Person' },
  company: { bg: '#E1F5EE', text: '#1D7A5C', label: 'Company' },
  fund: { bg: '#EEEDFE', text: '#5B4DBE', label: 'Fund' },
  deal: { bg: '#FAEEDA', text: '#A66B00', label: 'Deal' },
};

export function EntityManagementPage() {
  usePageTitle('Contacts & Entities');
  const navigate = useNavigate();
  const { data: entities, isLoading } = useGetEntitiesQuery();
  const [createEntity] = useCreateEntityMutation();
  const [deleteEntity] = useDeleteEntityMutation();
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ canonicalName: '', type: 'person', context: '' });

  const handleCreate = async () => {
    if (!form.canonicalName.trim()) return;
    await createEntity({
      type: form.type,
      canonicalName: form.canonicalName.trim(),
      context: form.context.trim() || undefined,
    });
    setForm({ canonicalName: '', type: 'person', context: '' });
    setShowForm(false);
  };

  const filtered = (entities ?? []).filter((e: any) =>
    e.canonicalName.toLowerCase().includes(search.toLowerCase()) ||
    e.type.toLowerCase().includes(search.toLowerCase()) ||
    (e.context ?? '').toLowerCase().includes(search.toLowerCase()),
  );

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="flex flex-col flex-1 min-h-0 min-w-0">
      {/* Header */}
      <div className="shrink-0 px-4 md:px-0 mb-1 md:mb-4">
        <button onClick={() => navigate('/settings')} className="flex items-center gap-1 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors mb-2">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M8.5 3L4.5 7L8.5 11" /></svg>
          Settings
        </button>
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-[var(--color-text)]">Contacts & Entities</h1>
          <button
            onClick={() => setShowForm(!showForm)}
            className="text-xs px-3 py-1.5 rounded-md bg-[var(--color-primary)] text-white hover:opacity-90 transition-opacity"
          >
            {showForm ? 'Cancel' : '+ Add'}
          </button>
        </div>
      </div>

      <div className="overflow-y-auto flex-1 min-h-0 px-3 md:px-0 space-y-3">
        {/* Create form */}
        {showForm && (
          <div className="bg-[var(--color-surface)] rounded-lg p-4 border border-[var(--color-border)] space-y-3">
            <input
              autoFocus
              value={form.canonicalName}
              onChange={(e) => setForm({ ...form, canonicalName: e.target.value })}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
              placeholder="Name"
              className="w-full px-3 py-2.5 rounded-md bg-[var(--color-bg)] border border-[var(--color-border)] text-sm text-[var(--color-text)] focus:outline-none focus:border-[var(--color-primary)] placeholder-[var(--color-text-muted)]"
            />
            <div className="flex gap-2">
              {(['person', 'company', 'fund', 'deal'] as const).map((t) => {
                const s = TYPE_STYLES[t];
                return (
                  <button
                    key={t}
                    onClick={() => setForm({ ...form, type: t })}
                    className="flex-1 py-2 text-xs font-medium rounded-md transition-colors"
                    style={{
                      background: form.type === t ? s.bg : 'var(--color-surface-alt)',
                      color: form.type === t ? s.text : 'var(--color-text-muted)',
                    }}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
            <input
              value={form.context}
              onChange={(e) => setForm({ ...form, context: e.target.value })}
              placeholder="Context (optional) — e.g. Lead investor on Acme Series B"
              className="w-full px-3 py-2.5 rounded-md bg-[var(--color-bg)] border border-[var(--color-border)] text-sm text-[var(--color-text)] focus:outline-none focus:border-[var(--color-primary)] placeholder-[var(--color-text-muted)]"
            />
            <button
              onClick={handleCreate}
              disabled={!form.canonicalName.trim()}
              className="w-full py-2.5 rounded-md bg-[var(--color-primary)] text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Create
            </button>
          </div>
        )}

        {/* Search */}
        {(entities?.length ?? 0) > 5 && (
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search entities..."
            className="w-full px-3 py-2.5 rounded-md bg-[var(--color-surface)] border border-[var(--color-border)] text-sm text-[var(--color-text)] focus:outline-none focus:border-[var(--color-primary)] placeholder-[var(--color-text-muted)]"
          />
        )}

        {/* List */}
        {filtered.length === 0 && !showForm && (
          <EmptyState message={search ? 'No entities match your search.' : 'No entities yet. Add people, companies, or deals to improve extraction accuracy.'} />
        )}

        {filtered.length > 0 && (
          <div className="bg-[var(--color-surface)] rounded-lg border border-[var(--color-border)] divide-y divide-[var(--color-border)]">
            {filtered.map((entity: any) => {
              const s = TYPE_STYLES[entity.type] ?? TYPE_STYLES.person;
              return (
                <div key={entity.id} className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--color-surface-alt)] transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-[var(--color-text)]">{entity.canonicalName}</span>
                      <span
                        className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                        style={{ background: s.bg, color: s.text }}
                      >
                        {s.label}
                      </span>
                    </div>
                    {entity.context && (
                      <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5 truncate">{entity.context}</p>
                    )}
                  </div>
                  <button
                    onClick={() => deleteEntity(entity.id)}
                    className="text-[11px] text-[var(--color-text-muted)] hover:text-[var(--color-danger)] transition-colors px-2 py-1"
                  >
                    Remove
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <p className="text-[10px] text-[var(--color-text-muted)] text-center pb-4">
          {filtered.length} {filtered.length === 1 ? 'entity' : 'entities'}
        </p>
      </div>
    </div>
  );
}
