import { NsI18n, useTranslation } from '@booking/i18n';
import { Button } from '@booking/ui/components/ui/button';
import { Download } from 'lucide-react';
import type { ReactNode } from 'react';
import { usePwa } from '~/features/pwa/lib/pwa-context';

export function SiteHeaderMobile({ brand, actions }: { brand: ReactNode; actions?: ReactNode }) {
  const { t: tPwa } = useTranslation(NsI18n.Pwa);
  const { canInstall, install } = usePwa();

  return (
    <div className="flex h-18 items-center justify-between gap-1 min-[400px]:gap-2 lg:hidden">
      <div className="min-w-0 flex-1 overflow-hidden [&_img]:max-w-full [&_span]:block [&_span]:max-w-full">
        {brand}
      </div>
      <div className="flex shrink-0 items-center gap-1 min-[400px]:gap-2">
        {actions ? (
          <div className="shrink-0 max-[359px]:[&>a]:px-2 max-[359px]:[&>button]:px-2">
            {actions}
          </div>
        ) : null}
        {canInstall ? (
          <Button
            type="button"
            className="h-10 shrink-0 rounded-lg px-2.5 text-xs font-semibold min-[400px]:px-3.5 min-[400px]:text-sm"
            onClick={() => void install()}
          >
            <Download className="size-5" aria-hidden="true" />
            {tPwa('install.headerAction')}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
