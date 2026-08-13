import { Button } from '@booking/ui/components/ui/button';
import { FieldSeparator } from '@booking/ui/components/ui/field';
import { NsI18n, useTranslation } from '@booking/i18n';

export function SocialButtons() {
  const { t } = useTranslation(NsI18n.Auth);

  return (
    <div className="mt-6 md:mt-8">
      <FieldSeparator>{t('social.or')}</FieldSeparator>
      <div className="mt-5 grid grid-cols-2 gap-3 md:mt-6">
        {[t('social.google'), t('social.facebook')].map((label) => (
          <Button
            key={label}
            type="button"
            variant="outline"
            size="control"
            className="max-md:h-12 max-md:rounded-(--sf-surface-radius) max-md:bg-card max-md:shadow-none"
            aria-disabled="true"
            disabled
          >
            <span>{label}</span>
            <span className="sr-only"> - {t('social.soon')}</span>
          </Button>
        ))}
      </div>
      <p className="mt-2 text-center text-xs text-muted-foreground">{t('social.soon')}</p>
    </div>
  );
}
