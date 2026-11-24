/** A row of mutually exclusive pill buttons (the selected one in red). */
export default function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { key: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-md bg-valorant-panel2 p-0.5 gap-0.5">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
            value === o.key
              ? 'bg-valorant-red text-white'
              : 'text-valorant-accent hover:bg-white/5'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
