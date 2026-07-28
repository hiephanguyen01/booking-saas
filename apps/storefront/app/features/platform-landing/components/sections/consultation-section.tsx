import { NsI18n, useTranslation } from '~/lib/i18n';
import { PlatformConsultationForm } from '../platform-consultation-form';

export function ConsultationSection() {
  const { t } = useTranslation(NsI18n.Platform);

  return (
    <section
      id="consultation"
      className="platform-section border-t border-[#e7e9ed] bg-[#0a0e13] px-5 py-18 text-[#f4f5f7] sm:px-6 sm:py-22"
    >
      <div className="mx-auto grid w-full max-w-270 gap-12 lg:grid-cols-2 lg:gap-14">
        <div className="platform-section-reveal max-w-130">
          <p className="text-sm font-bold tracking-[0.05em] text-[#ffb020] uppercase">
            {t('consultation.eyebrow')}
          </p>
          <h2 className="mt-4 max-w-[16ch] text-[clamp(1.75rem,3.4vw,2.625rem)] leading-[1.1] font-extrabold tracking-[-0.025em]">
            {t('consultation.title')}
          </h2>
          <p className="mt-4 max-w-[46ch] text-[17px] leading-[1.6] text-[#c9cdd4]">
            {t('consultation.description')}
          </p>
        </div>
        <div className="platform-section-reveal rounded-3xl border border-[#232a34] bg-[#12171f] p-6 sm:p-8">
          <h3 className="mb-6 text-xl font-bold">{t('consultation.formTitle')}</h3>
          <PlatformConsultationForm />
        </div>
      </div>
    </section>
  );
}
