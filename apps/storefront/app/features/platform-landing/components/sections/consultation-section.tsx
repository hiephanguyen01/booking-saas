import { NsI18n, useTranslation } from '@booking/i18n';
import { PlatformConsultationForm } from '~/features/platform-landing/components/platform-consultation-form';

export function ConsultationSection() {
  const { t } = useTranslation(NsI18n.Platform);

  return (
    <section
      id="consultation"
      className="platform-section dark border-t border-foreground/12 bg-background px-5 py-18 text-foreground sm:px-6 sm:py-22"
    >
      <div className="mx-auto grid w-full max-w-270 gap-12 lg:grid-cols-2 lg:gap-14">
        <div className="platform-section-reveal max-w-130">
          <p className="text-sm font-bold tracking-[0.05em] text-primary uppercase">
            {t('consultation.eyebrow')}
          </p>
          <h2 className="mt-4 max-w-[16ch] text-[clamp(1.75rem,3.4vw,2.625rem)] leading-[1.1] font-extrabold tracking-[-0.025em]">
            {t('consultation.title')}
          </h2>
          <p className="mt-4 max-w-[46ch] text-[17px] leading-[1.6] text-muted-foreground">
            {t('consultation.description')}
          </p>
        </div>
        <div className="platform-section-reveal rounded-3xl border border-border bg-card p-6 sm:p-8">
          <h3 className="mb-6 text-xl font-bold">{t('consultation.formTitle')}</h3>
          <PlatformConsultationForm />
        </div>
      </div>
    </section>
  );
}
