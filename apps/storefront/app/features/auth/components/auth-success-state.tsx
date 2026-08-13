import { Button } from '@booking/ui/components/ui/button';
import { ArrowRight, Check, CheckCircle2, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router';
import { NsI18n, useTranslation } from '@booking/i18n';
import { storefrontPaths } from '~/constants/paths';

export function SuccessState({
  mode,
  locale,
  title,
  description,
}: {
  mode: 'registration' | 'reset';
  locale: 'vi' | 'en';
  title?: string;
  description?: string;
}) {
  const { t } = useTranslation(NsI18n.Auth);

  return (
    <div className="flex flex-col items-center text-center">
      <div className="mb-6 grid size-19 place-items-center rounded-full bg-success/10 md:hidden">
        <span className="grid size-13.5 place-items-center rounded-full bg-success text-success-foreground">
          <Check className="size-7" aria-hidden="true" />
        </span>
      </div>
      {title ? <h1 className="text-xl font-semibold tracking-tight md:hidden">{title}</h1> : null}
      {description ? (
        <p className="mt-2 text-sm leading-6 text-muted-foreground md:hidden">{description}</p>
      ) : null}
      <div className="mb-6 hidden size-20 items-center justify-center rounded-full bg-primary/10 text-primary md:flex">
        {mode === 'registration' ? (
          <ShieldCheck className="size-10" aria-hidden="true" />
        ) : (
          <CheckCircle2 className="size-10" aria-hidden="true" />
        )}
      </div>
      <Button
        asChild
        size="control"
        className="w-full text-base max-md:mt-5 max-md:h-13 max-md:rounded-(--sf-surface-radius) max-md:shadow-lg max-md:shadow-primary/20"
      >
        <Link to={storefrontPaths.login(locale)}>
          {t('success.login')}
          <ArrowRight data-icon="inline-end" className="md:hidden" aria-hidden="true" />
        </Link>
      </Button>
    </div>
  );
}
