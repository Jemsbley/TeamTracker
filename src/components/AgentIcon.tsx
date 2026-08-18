import { agentIconUrl } from '../utils/agentIcon';

type Props = {
  agent: string;
  size?: number;
  className?: string;
  title?: string;
};

export default function AgentIcon({ agent, size = 20, className, title }: Props) {
  const url = agentIconUrl(agent);
  const style = { width: size, height: size };
  if (!url) {
    return (
      <span
        className={`inline-flex items-center justify-center rounded-sm bg-white/5 text-xs text-valorant-muted ${className ?? ''}`}
        style={style}
        title={title ?? agent}
      >
        ?
      </span>
    );
  }
  return (
    <img
      src={url}
      alt={agent}
      title={title ?? agent}
      className={`inline-block rounded-sm object-cover bg-valorant-panel2 ${className ?? ''}`}
      style={style}
    />
  );
}
