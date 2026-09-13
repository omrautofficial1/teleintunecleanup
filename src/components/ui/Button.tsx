import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'destructive' | 'ghost';

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-app-ink text-white hover:opacity-90 focus-visible:ring-app-ink disabled:opacity-40',
  secondary:
    'bg-white text-app-ink border border-app-hairline hover:bg-app-background focus-visible:ring-app-ink disabled:opacity-40',
  destructive:
    'bg-app-delete text-white hover:opacity-90 focus-visible:ring-app-delete disabled:opacity-40',
  ghost:
    'bg-transparent text-app-ink hover:bg-app-background focus-visible:ring-app-ink disabled:opacity-40',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  children: ReactNode;
}

export function Button({ variant = 'primary', className = '', ...rest }: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed ${VARIANT_CLASSES[variant]} ${className}`}
      {...rest}
    />
  );
}
