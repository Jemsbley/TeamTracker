import { useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import WriteButton from './WriteButton';

type Props = {
  title: string;
  value: string;
  canEdit: boolean;
  onSave: (markdown: string) => void;
  /** Shown when there's nothing written yet. */
  emptyText: string;
  placeholder?: string;
};

/**
 * A markdown block that shows rendered text, with an Edit mode that swaps in
 * a plain textarea (Write / Preview tabs) and saves only on Save. Tables,
 * checklists and strikethrough work (GitHub-flavored); raw HTML is not
 * rendered, so pasted text can't inject markup.
 */
export default function MarkdownNotes({ title, value, canEdit, onSave, emptyText, placeholder }: Props) {
  const [draft, setDraft] = useState<string | null>(null);
  const [tab, setTab] = useState<'write' | 'preview'>('write');
  const editing = draft !== null;

  const startEditing = () => {
    setDraft(value);
    setTab('write');
  };
  const save = () => {
    if (draft === null) return;
    onSave(draft);
    setDraft(null);
  };

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h4 className="font-semibold">{title}</h4>
        {editing ? (
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-md bg-valorant-panel2 p-0.5 gap-0.5">
              {(['write', 'preview'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={`px-2.5 py-1 rounded text-xs font-semibold capitalize transition-colors ${
                    tab === t ? 'bg-valorant-red text-white' : 'text-valorant-accent hover:bg-white/5'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
            <button type="button" className="btn-ghost" onClick={() => setDraft(null)}>
              Cancel
            </button>
            <button type="button" className="btn-primary" onClick={save}>
              Save
            </button>
          </div>
        ) : (
          <WriteButton canEdit={canEdit} className="btn-ghost" onClick={startEditing}>
            {value.trim() ? 'Edit' : 'Add notes'}
          </WriteButton>
        )}
      </div>

      {editing ? (
        tab === 'write' ? (
          <textarea
            className="input min-h-[320px] font-mono text-sm resize-y"
            value={draft}
            placeholder={placeholder}
            onChange={(e) => setDraft(e.target.value)}
            autoFocus
          />
        ) : draft.trim() ? (
          <div className="markdown-body">
            <Markdown remarkPlugins={[remarkGfm]}>{draft}</Markdown>
          </div>
        ) : (
          <div className="text-sm text-valorant-muted">Nothing to preview yet.</div>
        )
      ) : value.trim() ? (
        <div className="markdown-body">
          <Markdown remarkPlugins={[remarkGfm]}>{value}</Markdown>
        </div>
      ) : (
        <div className="text-sm text-valorant-muted">{emptyText}</div>
      )}
    </div>
  );
}
