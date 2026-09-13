// PLACEHOLDER brand mark (Phase 2 rebrand). This is not Telestar's actual
// logo file — I don't have it. It's a simple, deliberately restrained
// signal-bars-into-a-node glyph (ascending device/connectivity signal)
// rendered entirely from the brand CSS variables in styles/tokens.css, so
// swapping to the real SVG later is a one-file change: replace this
// component's body with an <img src="/telestar-logo.svg" ... /> once you
// have the asset, and nothing that imports <BrandMark /> needs to change.

interface BrandMarkProps {
  className?: string;
  /** Render the wordmark next to the glyph. Off for tight spaces (favicon-style use). */
  withWordmark?: boolean;
}

export function BrandMark({ className = '', withWordmark = true }: BrandMarkProps) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
        <rect width="28" height="28" rx="6" fill="var(--color-brand-primary)" />
        <rect x="7" y="15" width="3" height="6" rx="1" fill="var(--color-brand-accent-soft)" />
        <rect x="12.5" y="11" width="3" height="10" rx="1" fill="var(--color-brand-accent-soft)" />
        <rect x="18" y="7" width="3" height="14" rx="1" fill="var(--color-brand-accent)" />
      </svg>
      {withWordmark && (
        <span className="text-lg font-semibold tracking-tight text-app-ink">Telestar</span>
      )}
    </div>
  );
}
