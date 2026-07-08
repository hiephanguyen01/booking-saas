import type { ButtonHTMLAttributes, ReactNode } from 'react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost';
  children: ReactNode;
}

/**
 * Placeholder shared button — real styling arrives with the storefront/dashboard
 * work in Phase 1 (Tailwind + shadcn/ui, themed via CSS variables).
 */
export function Button({ variant = 'primary', children, ...rest }: ButtonProps) {
  return (
    <button data-variant={variant} {...rest}>
      {children}
    </button>
  );
}
