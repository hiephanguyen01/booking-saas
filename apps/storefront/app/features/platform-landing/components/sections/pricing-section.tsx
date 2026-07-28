import { NsI18n, useTranslation } from '@booking/i18n';

export function PricingSection() {
  const { t } = useTranslation(NsI18n.Platform);
  const plans = ['one', 'two', 'three'] as const;

  return (
    <section id="pricing" className="platform-section px-5 py-18 sm:px-6 sm:py-22">
      <div className="mx-auto w-full max-w-300">
        <div className="platform-section-reveal flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="platform-heading">{t('pricing.title')}</h2>
            <p className="platform-description mt-4">{t('pricing.description')}</p>
          </div>
        </div>
        <div className="mt-11 grid items-stretch gap-6 md:grid-cols-3">
          {plans.map((plan) => (
            <article
              key={plan}
              className="platform-section-reveal flex flex-col rounded-[1.375rem] border border-[#e4e6ea] bg-white p-7 sm:p-8"
            >
              <h3 className="text-[19px] font-bold tracking-[-0.01em] text-[#0a0e13]">
                {t(`pricing.plans.${plan}.name`)}
              </h3>
              <p className="mt-1.5 text-sm text-[#8a909a]">{t(`pricing.plans.${plan}.limits`)}</p>
              <p className="mt-5 text-3xl font-extrabold tracking-[-0.02em] text-[#0a0e13]">
                {t(`pricing.plans.${plan}.price`)}
              </p>
              <p className="mt-6 flex-1 border-t border-[#e4e6ea] pt-5 text-[15px] leading-6 text-[#4a515b]">
                {t(`pricing.plans.${plan}.feature`)}
              </p>
              <a href="#consultation" className="platform-dark-button mt-7 w-full">
                {t('pricing.consultation')}
              </a>
            </article>
          ))}
        </div>
        <p className="mt-7 text-[15px] text-[#6a707a]">
          {t('pricing.pendingDescription')}{' '}
          <a href="#consultation" className="font-semibold text-[#9a6200] hover:text-[#6f4900]">
            {t('pricing.consultation')}
          </a>
        </p>
      </div>
    </section>
  );
}
