import { AGENT_CLASS, CLASS_COLOR, CLASS_LABEL } from '../constants';
import AgentIcon from './AgentIcon';

type Props = {
  agent: string;
  size?: number;
};

export default function AgentBadge({ agent, size = 16 }: Props) {
  if (!agent) return <span className="text-valorant-muted text-xs">—</span>;
  const cls = AGENT_CLASS[agent];
  const color = cls ? CLASS_COLOR[cls] : 'bg-white/10 text-valorant-accent';
  const label = cls ? CLASS_LABEL[cls] : 'Agent';
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-xs font-medium ${color}`}
      title={label}
    >
      <AgentIcon agent={agent} size={size} />
      {agent}
    </span>
  );
}
