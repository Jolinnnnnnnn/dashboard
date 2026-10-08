"use client";

// Styled select with a custom stacked-chevron indicator (see .select in globals.css).
// `allLabel` marks the "no filter" option: any other value shows the active (filtering) state.

type Option = string | { value: string; label: string };

export function Select({ label, value, options, onChange, allLabel, size = "md", className = "", disabled }: {
  label: string;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  allLabel?: string;
  size?: "sm" | "md";
  className?: string;
  disabled?: boolean;
}) {
  const active = allLabel !== undefined && value !== allLabel;
  return (
    <span className={`select ${className}`} data-size={size} data-active={active}>
      <select aria-label={label} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => {
          const { value: v, label: l } = typeof o === "string" ? { value: o, label: o } : o;
          return <option key={v} value={v}>{l}</option>;
        })}
      </select>
    </span>
  );
}
