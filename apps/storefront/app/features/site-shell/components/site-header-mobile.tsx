import type { ReactNode } from 'react';

export function SiteHeaderMobile({ brand, actions }: { brand: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex h-18 items-center justify-between gap-1 min-[400px]:gap-2 lg:hidden">
      <div className="min-w-0 flex-1 overflow-hidden [&_img]:max-w-full [&_span]:block [&_span]:max-w-full">
        {brand}
      </div>
      {actions ? (
        <div className="shrink-0 max-[359px]:[&>a]:px-2 max-[359px]:[&>button]:px-2">
          {actions}
        </div>
      ) : null}
    </div>
  );
}
