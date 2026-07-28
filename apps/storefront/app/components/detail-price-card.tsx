import type { PropsWithChildren } from 'react';

export function DetailPriceCard({ children }: PropsWithChildren) {
  return (
    <div className="rounded-lg bg-card p-5 text-right text-card-foreground shadow-sm">
      {children}
    </div>
  );
}
