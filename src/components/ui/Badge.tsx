import type { ReactNode } from 'react';

export type BadgeTone = 'neutral' | 'keeper' | 'delete' | 'wipe' | 'info';

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: 'bg-app-background text-app-ink border-app-hairline',
  keeper: 'bg-app-keeper/10 text-app-keeper border-app-keeper',
  delete: 'bg-app-delete/10 text-app-delete border-app-delete',
  wipe: 'bg-app-wipe/10 text-app-wipe border-app-wipe',
  info: 'bg-app-ink/5 text-app-ink border-app-hairline',
};

export interface BadgeProps {
  tone?: BadgeTone;
  children: ReactNode;
  /** Icon/text cue rendered alongside color — color must never be the only
   * signal (quality-tree.md accessibility note). Pass e.g. an emoji-free
   * short label; this component does not decorate with color alone. */
  className?: string;
}

export function Badge({ tone = 'neutral', children, className = '' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${TONE_CLASSES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
