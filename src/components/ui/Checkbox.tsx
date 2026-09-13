import type { InputHTMLAttributes } from 'react';

// Dumb, reusable primitive — NO business logic here (solution-strategy.md).
// The safety-critical "keeper has no checkbox" invariant is enforced by
// callers choosing not to render this component at all for a keeper role,
// never by this component conditionally disabling itself.
export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
}

export function Checkbox({ label, className = '', ...rest }: CheckboxProps) {
  return (
    <label className={`inline-flex items-center gap-2 text-sm ${className}`}>
      <input
        type="checkbox"
        className="h-4 w-4 rounded border-app-hairline text-app-ink focus-visible:ring-2 focus-visible:ring-app-ink"
        {...rest}
      />
      <span>{label}</span>
    </label>
  );
}
