import { TRUST_ITEMS } from '~/features/platform-landing/lib/platform-content';
import { NsI18n, useTranslation } from '@booking/i18n';

export function TrustSection() {
  const { t } = useTranslation(NsI18n.Platform);

  return (
    <section className="platform-section border-t border-border bg-secondary px-5 py-18 sm:px-6 sm:py-22">
      <div className="mx-auto grid w-full max-w-300 gap-10 lg:grid-cols-[minmax(0,.9fr)_minmax(0,1.1fr)] lg:gap-13">
        <div className="platform-section-reveal">
          <h2 className="platform-heading">{t('trust.title')}</h2>
          <p className="platform-description mt-5">{t('trust.description')}</p>
        </div>
        <ul className="platform-section-reveal grid content-start gap-4">
          {TRUST_ITEMS.map(({ key, icon: Icon }) => (
            <li key={key} className="flex items-start gap-3 text-(--platform-ink-soft)">
              <Icon
                className="mt-0.5 size-5 shrink-0 text-(--platform-primary-emphasis)"
                aria-hidden="true"
              />
              <span>
                <span className="block text-base font-semibold">{t(`trust.${key}.title`)}</span>
                <span className="mt-1 block text-sm leading-6 text-(--platform-muted-soft)">
                  {t(`trust.${key}.description`)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
