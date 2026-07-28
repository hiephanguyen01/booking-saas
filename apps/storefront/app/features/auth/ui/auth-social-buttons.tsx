import { Button } from '@booking/ui/components/ui/button';
import { FieldSeparator } from '@booking/ui/components/ui/field';
import { NsI18n, useTranslation } from '~/lib/i18n';

export function SocialButtons() {
  const { t } = useTranslation(NsI18n.Auth);

  return (
    <div className="mt-8">
      <FieldSeparator>{t('social.or')}</FieldSeparator>
      <div className="mt-6 grid grid-cols-2 gap-3">
        {[t('social.google'), t('social.facebook')].map((label) => (
          <Button
            key={label}
            type="button"
            variant="outline"
            size="control"
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
