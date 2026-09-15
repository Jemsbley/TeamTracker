const iconModules = import.meta.glob('../assets/minimaps/*.{webp,png,jpg,jpeg}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

const iconMap: Record<string, string> = {};
for (const [path, url] of Object.entries(iconModules)) {
  const file = path.split('/').pop() ?? '';
  const base = file.replace(/\.(webp|png|jpe?g)$/i, '');
  // Strip the "_minimap" suffix used on these filenames.
  const stripped = base.replace(/[_\s-]?minimap$/i, '');
  iconMap[stripped.toLowerCase()] = url;
}

/** Local top-down minimap image for a map (distinct from the loading-screen
 * splash art served by mapIconUrl). */
export function minimapUrl(map: string | undefined | null): string | undefined {
  if (!map) return undefined;
  return iconMap[map.toLowerCase()];
}
