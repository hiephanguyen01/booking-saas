import { ArrowDownRight, Check } from 'lucide-react';
import { AFTER_ITEMS, BEFORE_ITEMS } from '~/features/platform-landing/lib/platform-content';
import { NsI18n, useTranslation } from '@booking/i18n';

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
            <span className="platform-badge-glow grid size-12 place-items-center rounded-full bg-primary text-primary-foreground">
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
          ? 'border border-border bg-card text-card-foreground'
          : 'platform-panel-shadow dark bg-background text-foreground'
      }`}
    >
      <h3
        className={`text-[13px] font-bold tracking-[0.06em] uppercase ${
          muted ? 'text-(--platform-muted-subtle)' : 'text-primary'
        }`}
      >
        {title}
      </h3>
      <ul className="mt-5 grid gap-4">
        {items.map((item) => (
          <li
            key={item}
            className="flex items-start gap-3 text-[15.5px] leading-6 text-muted-foreground"
          >
            {muted ? (
              <span className="mt-3 h-px w-4 shrink-0 bg-muted-foreground/40" aria-hidden="true" />
            ) : (
              <Check className="mt-1 size-4 shrink-0 text-primary" aria-hidden="true" />
            )}
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
