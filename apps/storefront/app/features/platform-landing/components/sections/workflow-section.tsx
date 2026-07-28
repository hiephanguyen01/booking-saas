import { Rocket, SlidersHorizontal, TrendingUp } from 'lucide-react';
import { NsI18n, useTranslation } from '~/lib/i18n';

export function WorkflowSection() {
  const { t } = useTranslation(NsI18n.Platform);
  const items = [
    { key: 'configure', icon: SlidersHorizontal },
    { key: 'publish', icon: Rocket },
    { key: 'grow', icon: TrendingUp },
  ] as const;

  return (
    <section id="workflow" className="platform-section px-5 py-18 sm:px-6 sm:py-22">
      <div className="mx-auto w-full max-w-300">
        <div className="platform-section-reveal max-w-180">
          <h2 className="platform-heading">{t('workflow.title')}</h2>
          <p className="platform-description mt-5">{t('workflow.description')}</p>
        </div>
        <ol className="mt-12 grid gap-6 md:grid-cols-3">
          {items.map(({ key, icon: Icon }) => (
            <li
              key={key}
              className="platform-section-reveal rounded-[1.125rem] border border-[#e4e6ea] border-t-[3px] border-t-[#ffb020] bg-[#fbfbfc] p-7"
            >
              <span className="grid size-11.5 place-items-center rounded-xl bg-[#0a0e13] text-[#ffb020]">
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <h3 className="mt-5 text-[21px] font-bold tracking-[-0.02em] text-[#0a0e13]">
                {t(`workflow.${key}.title`)}
              </h3>
              <p className="mt-3 text-[15px] leading-6 text-[#4a515b]">
                {t(`workflow.${key}.description`)}
              </p>
              <p className="mt-5 text-sm leading-6 font-semibold text-[#6f4900]">
                {t(`workflow.${key}.note`)}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
