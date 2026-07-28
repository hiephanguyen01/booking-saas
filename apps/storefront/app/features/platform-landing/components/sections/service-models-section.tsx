import { SERVICE_MODELS } from '~/features/platform-landing/lib/platform-content';
import { NsI18n, useTranslation } from '@booking/i18n';

export function ServiceModelsSection() {
  const { t } = useTranslation(NsI18n.Platform);

  return (
    <section id="models" className="platform-section border-t border-border bg-secondary">
      <div className="mx-auto grid w-full max-w-300 gap-10 px-5 py-18 sm:px-6 sm:py-20 lg:grid-cols-[minmax(0,.85fr)_minmax(0,1.15fr)] lg:gap-13">
        <div className="platform-section-reveal max-w-120">
          <h2 className="platform-heading">{t('models.title')}</h2>
          <p className="platform-description mt-5">{t('models.description')}</p>
        </div>
        <div className="grid content-start gap-px overflow-hidden rounded-[1.125rem] border border-border bg-border sm:grid-cols-2">
          {SERVICE_MODELS.map(({ key, icon: Icon }) => (
            <div
              key={key}
              className="group flex min-h-32 flex-col items-start gap-3 bg-card p-6 transition-colors hover:bg-(--platform-primary-tint)"
            >
              <span className="grid size-10.5 shrink-0 place-items-center rounded-[0.6875rem] bg-(--platform-primary-soft) text-(--platform-primary-emphasis)">
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <span className="text-[17px] font-bold leading-6 text-(--platform-ink-soft)">
                {t(`models.${key}`)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
