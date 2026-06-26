const iconModules = import.meta.glob('../assets/agents/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

const iconMap: Record<string, string> = {};
for (const [path, url] of Object.entries(iconModules)) {
  const file = path.split('/').pop() ?? '';
  const name = file.replace(/\.png$/i, '');
  iconMap[name.toLowerCase()] = url;
}

export function agentIconUrl(agent: string | undefined | null): string | undefined {
  if (!agent) return undefined;
  return iconMap[agent.toLowerCase()];
}
