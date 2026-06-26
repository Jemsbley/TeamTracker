import MapIcon from './MapIcon';
import { sortSeriesGames, useStore } from '../store';
import type { Game, MatchVideo, Series } from '../types';

const uid = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

type Props = {
  series: Series;
};

export default function MatchVideosSection({ series }: Props) {
  const games = useStore((s) =>
    s.games.filter((g) => g.seriesId === series.id)
  );
  const updateSeries = useStore((s) => s.updateSeries);

  const videos = series.videos ?? [];
  const sortedGames = sortSeriesGames(games);

  const setVideos = (next: MatchVideo[]) => {
    updateSeries(series.id, { videos: next });
  };

  const addVideo = () => {
    const v: MatchVideo = {
      id: uid(),
      name: '',
      url: '',
      gameIds: [],
    };
    setVideos([...videos, v]);
  };

  const updateVideo = (id: string, patch: Partial<MatchVideo>) => {
    setVideos(videos.map((v) => (v.id === id ? { ...v, ...patch } : v)));
  };

  const removeVideo = (id: string) => {
    setVideos(videos.filter((v) => v.id !== id));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Match videos</h3>
        <button type="button" className="btn-primary" onClick={addVideo}>
          + Add video
        </button>
      </div>
      {videos.length === 0 && (
        <div className="card text-center text-valorant-muted text-sm">
          No videos yet. Attach links to recordings of the match.
        </div>
      )}
      {videos.map((v) => (
        <VideoCard
          key={v.id}
          video={v}
          games={sortedGames}
          onUpdate={(patch) => updateVideo(v.id, patch)}
          onRemove={() => {
            if (confirm('Delete this video link?')) removeVideo(v.id);
          }}
        />
      ))}
    </div>
  );
}

function VideoCard({
  video,
  games,
  onUpdate,
  onRemove,
}: {
  video: MatchVideo;
  games: Game[];
  onUpdate: (patch: Partial<MatchVideo>) => void;
  onRemove: () => void;
}) {
  const toggleMap = (gameId: string) => {
    if (video.gameIds.includes(gameId)) {
      onUpdate({ gameIds: video.gameIds.filter((id) => id !== gameId) });
    } else {
      onUpdate({ gameIds: [...video.gameIds, gameId] });
    }
  };

  return (
    <div className="card space-y-3">
      <div className="flex items-end gap-2 flex-wrap">
        <div className="flex-1 min-w-[160px]">
          <label className="label">Name</label>
          <input
            className="input"
            value={video.name}
            onChange={(e) => onUpdate({ name: e.target.value })}
            placeholder="e.g. Map 1 — Ascent (Twitch)"
          />
        </div>
        <div className="flex-[2] min-w-[260px]">
          <label className="label">Link</label>
          <input
            className="input"
            type="url"
            value={video.url}
            onChange={(e) => onUpdate({ url: e.target.value })}
            placeholder="https://..."
          />
        </div>
        <button type="button" className="btn-danger" onClick={onRemove}>
          Delete
        </button>
      </div>
      {video.url && (
        <a
          href={video.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-valorant-red hover:underline inline-block break-all"
        >
          {video.name ? `${video.name} — ` : ''}
          {video.url} ↗
        </a>
      )}

      <div>
        <label className="label">Maps covered</label>
        {games.length === 0 ? (
          <p className="text-xs text-valorant-muted">
            No maps in this series yet — add maps first to tag them.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {games.map((g, i) => {
              const selected = video.gameIds.includes(g.id);
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
    </div>
  );
}
