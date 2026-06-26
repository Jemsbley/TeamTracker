import { useState } from 'react';
import MapIcon from './MapIcon';
import { sortSeriesGames, useStore } from '../store';
import type { Game, Series, VodReview } from '../types';

const uid = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

type Props = {
  series: Series;
};

export default function VodReviewsSection({ series }: Props) {
  const games = useStore((s) =>
    s.games.filter((g) => g.seriesId === series.id)
  );
  const updateSeries = useStore((s) => s.updateSeries);

  const reviews = series.vodReviews ?? [];
  const sortedGames = sortSeriesGames(games);

  const setReviews = (next: VodReview[]) => {
    updateSeries(series.id, { vodReviews: next });
  };

  const addReview = () => {
    const review: VodReview = {
      id: uid(),
      name: '',
      url: '',
      gameIds: sortedGames[0] ? [sortedGames[0].id] : [],
      takeaways: [],
    };
    setReviews([...reviews, review]);
  };

  const updateReview = (id: string, patch: Partial<VodReview>) => {
    setReviews(reviews.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const removeReview = (id: string) => {
    setReviews(reviews.filter((r) => r.id !== id));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">VOD reviews</h3>
        <button type="button" className="btn-primary" onClick={addReview}>
          + Add VOD review
        </button>
      </div>
      {reviews.length === 0 && (
        <div className="card text-center text-valorant-muted text-sm">
          No reviews yet. Add a link to a VOD review and tag the maps it covers.
        </div>
      )}
      {reviews.map((r) => (
        <ReviewCard
          key={r.id}
          review={r}
          games={sortedGames}
          onUpdate={(patch) => updateReview(r.id, patch)}
          onRemove={() => {
            if (
              confirm('Delete this VOD review and all of its takeaways?')
            )
              removeReview(r.id);
          }}
        />
      ))}
    </div>
  );
}

function ReviewCard({
  review,
  games,
  onUpdate,
  onRemove,
}: {
  review: VodReview;
  games: Game[];
  onUpdate: (patch: Partial<VodReview>) => void;
  onRemove: () => void;
}) {
  const [newTakeaway, setNewTakeaway] = useState('');

  const toggleMap = (gameId: string) => {
    if (review.gameIds.includes(gameId)) {
      // Don't allow removing the last selected map.
      if (review.gameIds.length <= 1) return;
      onUpdate({ gameIds: review.gameIds.filter((id) => id !== gameId) });
    } else {
      onUpdate({ gameIds: [...review.gameIds, gameId] });
    }
  };

  const addTakeaway = () => {
    const t = newTakeaway.trim();
    if (!t) return;
    onUpdate({ takeaways: [...review.takeaways, t] });
    setNewTakeaway('');
  };

  const removeTakeaway = (i: number) => {
    onUpdate({
      takeaways: review.takeaways.filter((_, idx) => idx !== i),
    });
  };

  const updateTakeaway = (i: number, value: string) => {
    onUpdate({
      takeaways: review.takeaways.map((t, idx) => (idx === i ? value : t)),
    });
  };

  return (
    <div className="card space-y-3">
      <div className="flex items-end gap-2 flex-wrap">
        <div className="flex-1 min-w-[160px]">
          <label className="label">Name</label>
          <input
            className="input"
            value={review.name}
            onChange={(e) => onUpdate({ name: e.target.value })}
            placeholder="e.g. Coach review — Map 1"
          />
        </div>
        <div className="flex-[2] min-w-[260px]">
          <label className="label">Link</label>
          <input
            className="input"
            type="url"
            value={review.url}
            onChange={(e) => onUpdate({ url: e.target.value })}
            placeholder="https://..."
          />
        </div>
        <button type="button" className="btn-danger" onClick={onRemove}>
          Delete review
        </button>
      </div>
      {review.url && (
        <a
          href={review.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-valorant-red hover:underline inline-block break-all"
        >
          {review.name ? `${review.name} — ` : ''}
          {review.url} ↗
        </a>
      )}

      <div>
        <label className="label">Maps covered (at least one)</label>
        {games.length === 0 ? (
          <p className="text-xs text-valorant-muted">
            No maps in this series yet — add maps first to tag them.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {games.map((g, i) => {
              const selected = review.gameIds.includes(g.id);
              return (
                <label
                  key={g.id}
                  className={`flex items-center gap-2 px-2 py-1 rounded border cursor-pointer transition-colors ${
                    selected
                      ? 'border-valorant-red bg-valorant-red/10'
                      : 'border-white/10 hover:bg-white/5'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => toggleMap(g.id)}
                    className="accent-valorant-red"
                  />
                  <MapIcon map={g.map} width={36} height={20} />
                  <span className="text-sm">
                    <span className="text-valorant-muted">
                      Map {g.order ?? i + 1} ·{' '}
                    </span>
                    {g.map}
                  </span>
                </label>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <label className="label">Takeaways</label>
        {review.takeaways.length > 0 && (
          <ul className="space-y-1.5 mb-2">
            {review.takeaways.map((t, i) => (
              <li key={i} className="flex items-center gap-2">
                <span
                  className="text-valorant-muted select-none"
                  aria-hidden="true"
                >
                  •
                </span>
                <input
                  className="input flex-1 bg-transparent border-transparent hover:border-white/10 focus:border-white/10"
                  value={t}
                  onChange={(e) => updateTakeaway(i, e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => removeTakeaway(i)}
                  title="Remove takeaway"
                  className="btn-danger px-2"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2">
          <input
            className="input flex-1"
            value={newTakeaway}
            onChange={(e) => setNewTakeaway(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addTakeaway();
              }
            }}
            placeholder="Add a takeaway and press Enter…"
          />
          <button
            type="button"
            className="btn-ghost"
            onClick={addTakeaway}
            disabled={!newTakeaway.trim()}
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
