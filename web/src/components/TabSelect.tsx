/**
 * A themed native-select dropdown used as the mobile replacement for a row of
 * sub-tabs. Render it alongside the desktop pill row (hide one per breakpoint).
 */
export interface TabOption {
  value: string;
  label: string;
}

export default function TabSelect({
  value,
  options,
  onChange,
  className = "",
}: {
  value: string;
  options: TabOption[];
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <div className={"relative " + className}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none rounded-lg border border-gold bg-gold-soft py-2.5 pl-3.5 pr-9 text-sm font-medium text-cream focus:outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-pitch-950 text-cream">
            {o.label}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-gold">▾</span>
    </div>
  );
}
