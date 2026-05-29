import { useState } from 'react';
import { useGetTaskNotesQuery, useCreateTaskNoteMutation, useDeleteTaskNoteMutation } from '../../../store/api';
import { RichTextEditor } from '../RichTextEditor';
import { IconNote, IconPlus, IconChevronRight } from '../icons/task-panel-icons';
import { HoverTip } from './HoverTip';

function isEmptyHtml(html: string): boolean {
  const text = html.replace(/<[^>]*>/g, '').trim();
  return text.length === 0;
}

function formatNoteDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
}

export function NotesList({ taskId, isArchived }: { taskId: string; isArchived: boolean }) {
  const { data: notes } = useGetTaskNotesQuery(taskId);
  const [createNote] = useCreateTaskNoteMutation();
  const [deleteNote] = useDeleteTaskNoteMutation();

  const [collapsed, setCollapsed] = useState(false);
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState('');

  const noteCount = notes?.length ?? 0;

  const handleSave = () => {
    if (!draft || isEmptyHtml(draft)) return;
    createNote({ taskId, content: draft });
    setDraft('');
    setComposing(false);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <button
          onClick={() => setCollapsed((v) => !v)}
          className="group flex items-center gap-1.5 text-xs font-medium text-[var(--color-text)] hover:text-[var(--color-primary)] transition-colors"
        >
          <span className={`transition-transform ${collapsed ? '' : 'rotate-90'}`}><IconChevronRight size={14} /></span>
          <IconNote size={18} />
          <span className={isArchived ? 'text-[var(--color-text-muted)]' : ''}>
            Notes{noteCount > 0 ? ` (${noteCount})` : ''}
          </span>
        </button>
        {!isArchived && !collapsed && (
          <HoverTip label="Add note">
            <button
              onClick={() => { setComposing(true); }}
              className="w-11 h-11 md:w-9 md:h-9 flex items-center justify-center rounded-md text-[var(--color-text-muted)] hover:bg-[var(--color-surface-alt)] hover:text-[var(--color-text)] active:scale-[0.97] transition-all"
              aria-label="Add note"
            >
              <IconPlus size={18} />
            </button>
          </HoverTip>
        )}
      </div>

      {!collapsed && (
        <div className="space-y-2">
          {/* Compose area */}
          {composing && !isArchived && (
            <div className="space-y-2">
              <RichTextEditor autoFocus value={draft} onChange={setDraft} placeholder="Write a note..." minRows={3} />
              <div className="flex gap-2">
                <button
                  onClick={handleSave}
                  className="text-xs px-3 py-1.5 rounded-md bg-[var(--color-primary)] text-white hover:opacity-90 active:scale-[0.97] transition-all"
                >
                  Save
                </button>
                <button
                  onClick={() => { setComposing(false); setDraft(''); }}
                  className="text-xs px-2 py-1.5 text-[var(--color-text-muted)]"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Note cards */}
          {notes && notes.length > 0 && (
            <div className="space-y-1.5">
              {notes.map((note) => (
                <div
                  key={note.id}
                  className="group/note relative rounded-lg bg-[var(--color-surface-alt)] px-3 py-2.5 text-sm text-[var(--color-text)] leading-relaxed [&_strong]:font-semibold [&_em]:italic [&_u]:underline [&_ul]:list-disc [&_ul]:ml-4 [&_ol]:list-decimal [&_ol]:ml-4 [&_li]:mb-0.5 [&_p]:mb-2 whitespace-pre-wrap break-words"
                >
                  <div dangerouslySetInnerHTML={{ __html: note.content }} />
                  <div className="flex items-center justify-between mt-1.5">
                    <span className="text-[10px] text-[var(--color-text-muted)]">
                      {formatNoteDate(note.createdAt)}
                    </span>
                    {!isArchived && (
                      <button
                        onClick={() => deleteNote({ taskId, noteId: note.id })}
                        className="opacity-0 group-hover/note:opacity-100 text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-danger)] transition-all px-1"
                        aria-label="Delete note"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Empty state */}
          {!composing && (!notes || notes.length === 0) && !isArchived && (
            <div
              onClick={() => setComposing(true)}
              className="text-sm text-[var(--color-text-muted)] italic cursor-text rounded px-1 py-1"
            >
              Add a note...
            </div>
          )}
        </div>
      )}
    </div>
  );
}
