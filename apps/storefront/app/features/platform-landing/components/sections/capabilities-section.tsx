import { CalendarRange, Check, CircleDollarSign, Globe2, Handshake } from 'lucide-react';
import { NsI18n, useTranslation } from '@booking/i18n';

export function CapabilitiesSection() {
  const { t } = useTranslation(NsI18n.Platform);

  return (
    <section
      id="capabilities"
      className="platform-section border-t border-border bg-secondary px-5 py-18 sm:px-6 sm:py-22"
    >
      <div className="mx-auto w-full max-w-300">
        <div className="platform-section-reveal max-w-180">
          <h2 className="platform-heading">{t('capabilities.title')}</h2>
        </div>

        <div className="mt-13 grid gap-7">
          <CapabilityRow
            icon={Globe2}
            title={t('capabilities.storefront.title')}
            description={t('capabilities.storefront.description')}
            detail={t('capabilities.storefront.detail')}
            image="/booking-studio/carousel/04.jpg"
            imageAlt={t('demos.studio.alt')}
          />
          <CapabilityRow
            icon={CalendarRange}
            title={t('capabilities.scheduling.title')}
            description={t('capabilities.scheduling.description')}
            detail={t('capabilities.scheduling.detail')}
            image="/booking-studio/carousel/02.jpg"
            imageAlt={t('hero.visualAlt')}
            mediaFirst
          />
          <CapabilityRow
            icon={Handshake}
            title={t('capabilities.partners.title')}
            description={t('capabilities.partners.description')}
            detail={t('capabilities.partners.detail')}
            image="/booking-stad/platform-courts.png"
            imageAlt={t('demos.sport.alt')}
            dark
          />
          <CapabilityRow
            icon={CircleDollarSign}
            title={t('capabilities.finance.title')}
            description={t('capabilities.finance.description')}
            detail={t('capabilities.finance.detail')}
            image="/booking-studio/carousel/03.jpg"
            imageAlt={t('demos.studio.alt')}
          />
        </div>
      </div>
    </section>
  );
}

function CapabilityRow({
  icon: Icon,
  title,
  description,
  detail,
  image,
  imageAlt,
  mediaFirst = false,
  dark = false,
}: {
  icon: typeof Globe2;
  title: string;
  description: string;
  detail: string;
  image: string;
  imageAlt: string;
  mediaFirst?: boolean;
  dark?: boolean;
}) {
  return (
    <article
      className={`platform-section-reveal grid items-center gap-8 overflow-hidden rounded-[1.375rem] p-6 sm:p-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] md:gap-11 lg:p-10 ${
        dark
          ? 'dark bg-background text-foreground'
          : 'border border-border bg-card text-card-foreground'
      }`}
    >
      <div className={mediaFirst ? 'md:order-2' : undefined}>
        <span className="grid size-11 place-items-center rounded-xl bg-(--platform-primary-soft) text-(--platform-primary-emphasis)">
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <h3 className="mt-5 max-w-125 text-2xl leading-[1.15] font-bold tracking-[-0.02em]">
          {title}
        </h3>
        <p className="mt-4 max-w-135 text-[15.5px] leading-6 text-muted-foreground">
          {description}
        </p>
        <p className="mt-5 flex items-start gap-2 text-sm leading-6 font-semibold text-(--platform-ink-soft)">
          <Check
            className="mt-1 size-4 shrink-0 text-(--platform-primary-emphasis)"
            aria-hidden="true"
          />
          {detail}
        </p>
      </div>
      <div
        className={`overflow-hidden rounded-[0.875rem] border border-border bg-muted ${
          mediaFirst ? 'md:order-1' : ''
        }`}
      >
        <img
          src={image}
          width="1800"
          height="1200"
          loading="lazy"
          decoding="async"
          alt={imageAlt}
          className="aspect-[16/10] w-full object-cover"
        />
      </div>
    </article>
  );
}
