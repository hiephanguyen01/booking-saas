import type { PropsWithChildren } from 'react';

export function DetailPriceCard({ children }: PropsWithChildren) {
  return (
    <div className="bg-card text-right text-card-foreground rounded-(--sf-surface-radius) [border:var(--sf-surface-border-width)_solid_var(--sf-surface-border-color)] shadow-(--sf-surface-shadow) p-(--sf-surface-pad)">
      {children}
    </div>
  );
}
