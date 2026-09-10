import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { CHANGELOG } from '../utils/changelog';

type Props = {
  onClose: () => void;
};

export default function ChangelogModal({ onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="card w-full max-w-lg max-h-[80vh] overflow-y-auto space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-lg">Version history</h3>
          <button type="button" className="btn-ghost" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="space-y-5">
          {CHANGELOG.map((entry) => (
            <div key={entry.version} className="space-y-1.5">
              <div className="flex items-baseline gap-2">
                <span className="font-semibold tabular-nums text-white">v{entry.version}</span>
                <span className="text-sm text-emerald-400">{entry.title}</span>
              </div>
              {entry.changes.length > 0 && (
                <ul className="list-disc list-inside space-y-0.5 text-sm text-valorant-muted">
                  {entry.changes.map((change) => (
                    <li key={change}>{change}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}
