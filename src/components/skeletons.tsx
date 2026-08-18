/** Pulsing placeholder bar — the building block every skeleton below is made of. */
export function Bone({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-white/10 ${className}`} />;
}

/** One labeled filter control (label line + input-sized box), as seen under every `.label` + input pair. */
function FieldSkeleton({ width = 'w-28' }: { width?: string }) {
  return (
    <div className={`space-y-1 ${width}`}>
      <Bone className="h-2.5 w-2/3" />
      <Bone className="h-8 w-full" />
    </div>
  );
}

/** Mimics PageHeader's title card (big bold title + small description line). */
function TitleCardSkeleton({ grow = false }: { grow?: boolean }) {
  return (
    <div
      className={`card bg-valorant-panel2 border-4 border-valorant-red/50 flex flex-col justify-center gap-2 ${
        grow ? 'flex-1 min-w-[240px]' : 'w-[300px] shrink-0'
      }`}
    >
      <Bone className="h-7 w-32" />
      <Bone className="h-3 w-20" />
    </div>
  );
}

/** A PageHeader row: fixed title box + one growing box holding N filter fields. */
function FilterHeaderSkeleton({
  fieldWidths = ['w-28', 'w-28', 'w-28', 'w-28'],
}: {
  fieldWidths?: string[];
}) {
  return (
    <div className="flex flex-wrap items-stretch gap-4">
      <TitleCardSkeleton />
      <div className="card flex-1 min-w-[240px] flex flex-wrap gap-3 items-end">
        {fieldWidths.map((w, i) => (
          <FieldSkeleton key={i} width={w} />
        ))}
      </div>
    </div>
  );
}

export function TableSkeleton({
  rows = 6,
  columns = 5,
}: {
  rows?: number;
  columns?: number;
}) {
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-white/10">
            {Array.from({ length: columns }).map((_, i) => (
              <th key={i} className="py-2 pr-3">
                <Bone className="h-3 w-14" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, r) => (
            <tr key={r} className="border-b border-white/5">
              {Array.from({ length: columns }).map((_, c) => (
                <td key={c} className="py-2.5 pr-3">
                  <Bone className="h-3 w-full max-w-[5rem]" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** stat-grid of stat-box placeholders, matching `.stat-grid`/`.stat-box`. */
function StatBoxesSkeleton({ boxes = 4 }: { boxes?: number }) {
  return (
    <div className="stat-grid">
      {Array.from({ length: boxes }).map((_, i) => (
        <div key={i} className="stat-box space-y-2">
          <Bone className="h-2.5 w-14 mx-auto" />
          <Bone className="h-5 w-10 mx-auto" />
        </div>
      ))}
    </div>
  );
}

/** A `.card` with an h3-sized title line above a stat-grid — matches the "Map pick performance" / "Round economy" cards. */
function StatCardSkeleton({ boxes = 5 }: { boxes?: number }) {
  return (
    <div className="card space-y-2">
      <Bone className="h-4 w-40" />
      <StatBoxesSkeleton boxes={boxes} />
    </div>
  );
}

/** Small map-thumbnail tile: icon block + two text lines. Matches the veto/played tiles on Series pages. */
function MapTileSkeleton() {
  return (
    <div className="w-40 shrink-0 space-y-1.5">
      <Bone className="h-20 w-full rounded" />
      <Bone className="h-3 w-3/4" />
      <Bone className="h-3 w-1/2" />
    </div>
  );
}

function MapTileRowSkeleton({ tiles = 5 }: { tiles?: number }) {
  return (
    <div className="flex flex-wrap gap-3">
      {Array.from({ length: tiles }).map((_, i) => (
        <MapTileSkeleton key={i} />
      ))}
    </div>
  );
}

/** A row list with a leading icon block, matching "Recent maps". */
function IconRowListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="card space-y-2 p-0">
      <Bone className="h-4 w-28 mx-4 mt-4" />
      <div className="divide-y divide-white/5">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-2">
            <Bone className="h-8 w-14 shrink-0 rounded" />
            <Bone className="h-3 w-16" />
            <Bone className="h-3 flex-1" />
            <Bone className="h-3 w-10" />
            <Bone className="h-3 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function CardGridSkeleton({ cards = 6 }: { cards?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
      {Array.from({ length: cards }).map((_, i) => (
        <div key={i} className="card space-y-3">
          <div className="flex items-center gap-2">
            <Bone className="h-9 w-9 rounded-full" />
            <Bone className="h-4 w-24" />
          </div>
          <Bone className="h-3 w-full" />
          <Bone className="h-3 w-2/3" />
        </div>
      ))}
    </div>
  );
}

export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="card space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-2">
              <Bone className="h-4 w-40" />
              <Bone className="h-3 w-28" />
            </div>
            <Bone className="h-7 w-16" />
          </div>
          <MapTileRowSkeleton tiles={5} />
        </div>
      ))}
    </div>
  );
}

/** Stats page: filter header, tab bar, then the Overall-tab shape (stat cards, a table, an icon-row list). */
function StatsSkeleton() {
  return (
    <div className="space-y-6">
      <FilterHeaderSkeleton
        fieldWidths={['w-28', 'w-28', 'w-40', 'w-36', 'w-40']}
      />
      <div className="card stats-shell space-y-4">
        <div className="flex gap-2 border-b border-white/10 pb-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <Bone key={i} className="h-6 w-24 rounded" />
          ))}
        </div>
        <StatCardSkeleton boxes={5} />
        <StatCardSkeleton boxes={3} />
        <TableSkeleton rows={5} columns={7} />
        <IconRowListSkeleton rows={5} />
      </div>
    </div>
  );
}

/** Maps / Players page: filter header + one wide sortable table. */
function TablePageSkeleton({ columns }: { columns: number }) {
  return (
    <div className="space-y-6">
      <FilterHeaderSkeleton fieldWidths={['w-28', 'w-40', 'w-36', 'w-40']} />
      <TableSkeleton rows={8} columns={columns} />
    </div>
  );
}

/** Agents page: filter header (6 fields) + win/pick matrix tables + agent-detail card grid. */
function AgentsSkeleton() {
  return (
    <div className="space-y-6">
      <FilterHeaderSkeleton
        fieldWidths={['w-28', 'w-40', 'w-28', 'w-40', 'w-32', 'w-36']}
      />
      <TableSkeleton rows={4} columns={7} />
      <TableSkeleton rows={4} columns={7} />
      <div className="space-y-2">
        <Bone className="h-4 w-32" />
        <CardGridSkeleton cards={6} />
      </div>
    </div>
  );
}

/** Roster page: header with a row of roster "pill" buttons (not filter fields), summary + add-player cards, players table. */
function RosterSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-stretch gap-4">
        <TitleCardSkeleton />
        <div className="card flex-1 min-w-[240px] flex flex-wrap items-center gap-1.5">
          {Array.from({ length: 3 }).map((_, i) => (
            <Bone key={i} className="h-8 w-24 rounded-md" />
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="card space-y-2">
          <Bone className="h-5 w-32" />
          <Bone className="h-3 w-40" />
        </div>
        <div className="card flex flex-wrap gap-3 items-end">
          <FieldSkeleton width="flex-1 min-w-[200px]" />
          <FieldSkeleton width="w-32" />
          <Bone className="h-8 w-24 rounded-md" />
        </div>
      </div>
      <TableSkeleton rows={6} columns={3} />
    </div>
  );
}

/** Series list page: header with a roster-filter box + new-series form box, then a vertical list of series cards. */
function SeriesListSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-stretch gap-4">
        <TitleCardSkeleton />
        <div className="card shrink-0 flex items-end">
          <FieldSkeleton width="w-32" />
        </div>
        <div className="card flex-1 min-w-[240px] flex flex-wrap gap-3 items-end">
          <FieldSkeleton width="flex-1 min-w-[180px]" />
          <FieldSkeleton width="w-28" />
          <FieldSkeleton width="w-28" />
          <Bone className="h-8 w-28 rounded-md" />
        </div>
      </div>
      <ListSkeleton rows={5} />
    </div>
  );
}

/** Series detail page: header (format/date/scouting fields), pick/ban card, stats section, maps section. */
function SeriesDetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-stretch gap-4">
        <TitleCardSkeleton grow />
        <div className="card shrink-0 flex flex-wrap gap-3 items-end">
          <FieldSkeleton width="w-32" />
          <FieldSkeleton width="w-32" />
          <FieldSkeleton width="w-40" />
        </div>
      </div>
      <div className="card space-y-3">
        <Bone className="h-4 w-40" />
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Bone key={i} className="h-16 w-full rounded" />
          ))}
        </div>
      </div>
      <div className="space-y-3">
        <Bone className="h-4 w-16" />
        <StatCardSkeleton boxes={4} />
        <TableSkeleton rows={5} columns={6} />
      </div>
      <div className="space-y-3">
        <Bone className="h-4 w-16" />
        <MapTileRowSkeleton tiles={4} />
      </div>
    </div>
  );
}

/** Game entry form: map/date/side/score card, lineup grid card, round table card. */
function GameFormSkeleton() {
  return (
    <div className="space-y-6">
      <TitleCardSkeleton grow />
      <div className="card flex flex-wrap gap-3 items-end">
        <FieldSkeleton width="w-28" />
        <FieldSkeleton width="w-32" />
        <FieldSkeleton width="w-40" />
        <FieldSkeleton width="w-24" />
      </div>
      <div className="card space-y-3">
        <Bone className="h-4 w-24" />
        <div className="grid md:grid-cols-2 gap-3">
          {Array.from({ length: 10 }).map((_, i) => (
            <Bone key={i} className="h-10 w-full rounded" />
          ))}
        </div>
      </div>
      <TableSkeleton rows={6} columns={6} />
    </div>
  );
}

/** Scouting list page: header form (team/note/roster/button) + a card of small report tiles. */
function ScoutingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-stretch gap-4">
        <TitleCardSkeleton />
        <div className="card flex-1 min-w-[240px] flex flex-wrap gap-3 items-end">
          <FieldSkeleton width="flex-1 min-w-[180px]" />
          <FieldSkeleton width="flex-1 min-w-[180px]" />
          <FieldSkeleton width="w-32" />
          <Bone className="h-8 w-28 rounded-md" />
        </div>
      </div>
      <div className="card space-y-3">
        <Bone className="h-4 w-20" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="rounded-lg border border-white/10 p-3 space-y-2"
            >
              <Bone className="h-4 w-2/3" />
              <Bone className="h-3 w-1/2" />
              <Bone className="h-3 w-1/3" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Scouting report detail: title only, then per-map rows/notes. */
function ScoutingReportSkeleton() {
  return (
    <div className="space-y-4">
      <TitleCardSkeleton grow />
      <div className="card space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Bone className="h-10 w-14 rounded" />
            <Bone className="h-3 flex-1" />
            <Bone className="h-3 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Settings/account page: plain username field + a danger-zone block. */
function SettingsSkeleton() {
  return (
    <div className="space-y-6">
      <Bone className="h-6 w-24" />
      <div className="space-y-3">
        <Bone className="h-3 w-20" />
        <Bone className="h-9 w-full max-w-md" />
        <Bone className="h-8 w-32 rounded-md" />
      </div>
      <div className="space-y-4 pt-6">
        <Bone className="h-5 w-28" />
        <div className="space-y-3">
          <Bone className="h-4 w-24" />
          <Bone className="h-3 w-full max-w-lg" />
          <Bone className="h-8 w-40 rounded" />
          <Bone className="h-8 w-24 rounded" />
        </div>
      </div>
    </div>
  );
}

function AdminSkeleton() {
  return (
    <div className="space-y-4">
      <TitleCardSkeleton grow />
      <TableSkeleton rows={8} columns={6} />
    </div>
  );
}

function GenericSkeleton() {
  return (
    <div className="card space-y-3">
      <Bone className="h-4 w-1/3" />
      <Bone className="h-3 w-full" />
      <Bone className="h-3 w-5/6" />
      <Bone className="h-3 w-2/3" />
    </div>
  );
}

/**
 * Picks a skeleton shape for the given route's main content. Used while the
 * store is still hydrating, before the real page (and its own data) mounts.
 */
export function RouteSkeleton({ pathname }: { pathname: string }) {
  if (pathname === '/' || pathname === '') return <StatsSkeleton />;
  if (pathname === '/maps') return <TablePageSkeleton columns={9} />;
  if (pathname === '/players') return <TablePageSkeleton columns={10} />;
  if (pathname === '/agents') return <AgentsSkeleton />;
  if (pathname === '/roster') return <RosterSkeleton />;
  if (pathname === '/series') return <SeriesListSkeleton />;
  if (/^\/series\/[^/]+$/.test(pathname)) return <SeriesDetailSkeleton />;
  if (/^\/series\/[^/]+\/games\//.test(pathname)) return <GameFormSkeleton />;
  if (pathname === '/scouting') return <ScoutingSkeleton />;
  if (/^\/scouting\/[^/]+$/.test(pathname)) return <ScoutingReportSkeleton />;
  if (pathname === '/settings') return <SettingsSkeleton />;
  if (pathname === '/admin') return <AdminSkeleton />;
  return <GenericSkeleton />;
}
