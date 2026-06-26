const iconModules = import.meta.glob('../assets/maps/*.{webp,png,jpg,jpeg}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

const iconMap: Record<string, string> = {};
for (const [path, url] of Object.entries(iconModules)) {
  const file = path.split('/').pop() ?? '';
  const base = file.replace(/\.(webp|png|jpe?g)$/i, '');
  // Strip common prefixes used by Valorant loading screen filenames
  const stripped = base.replace(/^Loading[_\s-]?Screen[_\s-]?/i, '');
  iconMap[stripped.toLowerCase()] = url;
}

export function mapIconUrl(map: string | undefined | null): string | undefined {
  if (!map) return undefined;
  return iconMap[map.toLowerCase()];
}
