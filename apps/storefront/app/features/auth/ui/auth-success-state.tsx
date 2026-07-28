import { Button } from '@booking/ui/components/ui/button';
import { CheckCircle2, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router';
import { NsI18n, useTranslation } from '~/lib/i18n';
import { storefrontPaths } from '~/constants/paths';

export function SuccessState({
  mode,
  locale,
}: {
  mode: 'registration' | 'reset';
  locale: 'vi' | 'en';
}) {
  const { t } = useTranslation(NsI18n.Auth);

  return (
    <div className="flex flex-col items-center text-center">
      <div className="mb-6 flex size-20 items-center justify-center rounded-full bg-primary/10 text-primary">
        {mode === 'registration' ? (
          <ShieldCheck className="size-10" />
        ) : (
          <CheckCircle2 className="size-10" />
        )}
      </div>
      <Button asChild size="control" className="w-full text-base">
        <Link to={storefrontPaths.login(locale)}>{t('success.login')}</Link>
      </Button>
    </div>
  );
}
