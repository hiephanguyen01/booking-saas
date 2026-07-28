import { ChevronDown } from 'lucide-react';
import { FAQ_ITEMS } from '~/features/platform-landing/lib/platform-content';
import { NsI18n, useTranslation } from '@booking/i18n';

export function FaqSection() {
  const { t } = useTranslation(NsI18n.Platform);

  return (
    <section id="faq" className="platform-section px-5 py-18 sm:px-6 sm:py-22">
      <div className="mx-auto w-full max-w-215">
        <div className="platform-section-reveal">
          <h2 className="platform-heading">{t('faq.title')}</h2>
        </div>
        <div className="mt-10 border-t border-border">
          {FAQ_ITEMS.map((key) => (
            <details key={key} className="platform-faq border-b border-border">
              <summary className="flex min-h-18 cursor-pointer list-none items-center justify-between gap-5 px-1 py-5 text-left text-base font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 sm:text-[17.5px]">
                {t(`faq.${key}.question`)}
                <ChevronDown
                  className="platform-faq-icon size-5 shrink-0 text-(--platform-primary-emphasis)"
                  aria-hidden="true"
                />
              </summary>
              <p className="max-w-[64ch] px-1 pb-6 pr-10 text-sm leading-[1.6] text-muted-foreground sm:text-base">
                {t(`faq.${key}.answer`)}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
