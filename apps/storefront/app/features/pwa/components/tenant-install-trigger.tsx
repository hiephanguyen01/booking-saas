import { NsI18n, useTranslation } from '@booking/i18n';
import { Button } from '@booking/ui/components/ui/button';
import { cn } from '@booking/ui/lib/utils';
import { Download } from 'lucide-react';
import type { ReactNode } from 'react';
import { usePwa } from '~/features/pwa/lib/pwa-context';

export function TenantInstallTrigger({
  variant = 'full',
  fallback = null,
  className,
}: {
  variant?: 'full' | 'compact';
  fallback?: ReactNode;
  className?: string;
}) {
  const { t } = useTranslation(NsI18n.Pwa);
  const { canInstall, install } = usePwa();

  if (!canInstall) return fallback;

  return (
    <Button
      type="button"
      size="sm"
      className={cn(
        'shrink-0 font-bold',
        variant === 'compact'
          ? 'h-9 rounded-full px-2.5 text-[11px]'
          : 'h-9.5 rounded-md px-3 text-xs',
        className,
      )}
      onClick={() => void install()}
    >
      <Download className="size-4" aria-hidden="true" />
      {t(variant === 'compact' ? 'install.compactAction' : 'install.headerAction')}
    </Button>
  );
}
