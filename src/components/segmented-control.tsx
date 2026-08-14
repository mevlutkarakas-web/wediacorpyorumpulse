export type SegmentedOption<T extends string> = { value: T; label: string; activeClassName?: string };

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div className={`inline-flex rounded-xl border bg-card p-1 ${className || ""}`}>
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          className={`rounded-lg px-4 py-2 text-sm font-semibold ${
            value === option.value ? option.activeClassName || "bg-violet-600 text-white" : "text-slate-500"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
