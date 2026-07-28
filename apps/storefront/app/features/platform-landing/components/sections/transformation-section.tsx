import { ArrowDownRight, Check } from 'lucide-react';
import { AFTER_ITEMS, BEFORE_ITEMS } from '~/features/platform-landing/lib/platform-content';
import { NsI18n, useTranslation } from '~/lib/i18n';

export function TransformationSection() {
  const { t } = useTranslation(NsI18n.Platform);

  return (
    <section className="platform-section px-5 py-18 sm:px-6 sm:py-22">
      <div className="mx-auto w-full max-w-300">
        <div className="platform-section-reveal mx-auto max-w-180 text-center">
          <h2 className="platform-heading">{t('transformation.title')}</h2>
          <p className="platform-description mx-auto mt-4">{t('transformation.description')}</p>
        </div>

        <div className="mt-11 grid items-center gap-4 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:gap-5">
          <TransformationList
            title={t('transformation.beforeTitle')}
            items={BEFORE_ITEMS.map((key) => t(key))}
            muted
          />
          <div className="grid place-items-center py-1" aria-hidden="true">
            <span className="grid size-12 place-items-center rounded-full bg-[#ffb020] text-[#0a0e13] shadow-[0_8px_20px_-8px_rgba(255,176,32,.8)]">
              <ArrowDownRight className="size-5 lg:-rotate-45" />
            </span>
          </div>
          <TransformationList
            title={t('transformation.afterTitle')}
            items={AFTER_ITEMS.map((key) => t(key))}
          />
        </div>
      </div>
    </section>
  );
}

function TransformationList({
  title,
  items,
  muted = false,
}: {
  title: string;
  items: string[];
  muted?: boolean;
}) {
  return (
    <div
      className={`rounded-[1.25rem] p-7 sm:p-8 ${
        muted
          ? 'border border-[#e4e6ea] bg-white text-[#0a0e13]'
          : 'bg-[#0a0e13] text-[#f4f5f7] shadow-[0_24px_54px_-30px_rgba(10,14,19,.6)]'
      }`}
    >
      <h3
        className={`text-[13px] font-bold tracking-[0.06em] uppercase ${muted ? 'text-[#8a909a]' : 'text-[#ffb020]'}`}
      >
        {title}
      </h3>
      <ul className="mt-5 grid gap-4">
        {items.map((item) => (
          <li
            key={item}
            className={`flex items-start gap-3 text-[15.5px] leading-6 ${muted ? 'text-[#4a515b]' : 'text-[#d7dae0]'}`}
          >
            {muted ? (
              <span className="mt-3 h-px w-4 shrink-0 bg-[#b9bec6]" aria-hidden="true" />
            ) : (
              <Check className="mt-1 size-4 shrink-0 text-[#ffb020]" aria-hidden="true" />
            )}
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
