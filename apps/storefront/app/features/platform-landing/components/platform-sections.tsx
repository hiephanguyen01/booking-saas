import {
  ArrowDownRight,
  ArrowRight,
  BadgeCheck,
  Boxes,
  CalendarCheck2,
  CalendarRange,
  Check,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  Database,
  Dumbbell,
  Fingerprint,
  Globe2,
  GraduationCap,
  Handshake,
  Home,
  KeyRound,
  PackageOpen,
  ReceiptText,
  Sparkles,
} from 'lucide-react';
import { NsI18n, useTranslation } from '../../../lib/i18n';
import type { PlatformRootLoaderPayload } from '../../root/server/root-loader.server';
import { PlatformConsultationForm } from './platform-consultation-form';
import { PlatformBrand } from './platform-header';

const SERVICE_MODELS = [
  { key: 'studio', icon: Sparkles },
  { key: 'sport', icon: Dumbbell },
  { key: 'class', icon: GraduationCap },
  { key: 'appointment', icon: Clock3 },
  { key: 'stay', icon: Home },
  { key: 'inventory', icon: PackageOpen },
] as const;

const BEFORE_ITEMS = [
  'transformation.before.one',
  'transformation.before.two',
  'transformation.before.three',
  'transformation.before.four',
  'transformation.before.five',
] as const;

const AFTER_ITEMS = [
  'transformation.after.one',
  'transformation.after.two',
  'transformation.after.three',
  'transformation.after.four',
  'transformation.after.five',
] as const;

const TRUST_ITEMS = [
  { key: 'isolation', icon: Database },
  { key: 'access', icon: KeyRound },
  { key: 'session', icon: Fingerprint },
  { key: 'schedule', icon: CalendarCheck2 },
  { key: 'ledger', icon: ReceiptText },
] as const;

const FAQ_ITEMS = ['one', 'two', 'three', 'four', 'five', 'six'] as const;

export function PlatformHero() {
  const { t } = useTranslation(NsI18n.Platform);

  return (
    <section className="platform-hero relative isolate overflow-hidden px-5 pb-16 pt-12 sm:px-8 sm:pb-20 sm:pt-16 lg:px-10 lg:pb-22 lg:pt-18">
      <div className="platform-hero-shape pointer-events-none absolute inset-y-0 right-0 -z-10 w-[58%]" />
      <div className="mx-auto grid w-full max-w-350 items-center gap-12 lg:grid-cols-2 lg:gap-14">
        <div className="platform-hero-copy max-w-176">
          <h1 className="text-[clamp(3rem,5.2vw,4.65rem)] leading-[0.96] font-extrabold tracking-[-0.06em] text-[#0a0e13]">
            {t('hero.title')}
          </h1>
          <p className="mt-7 max-w-145 text-base leading-7 text-[#565d63] sm:text-lg sm:leading-8">
            {t('hero.description')}
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <a href="#consultation" className="platform-primary-button group">
              {t('hero.primaryCta')}
              <ArrowRight
                className="size-4 transition-transform group-hover:translate-x-1"
                aria-hidden="true"
              />
            </a>
            <a href="#demos" className="platform-secondary-button">
              {t('hero.secondaryCta')}
            </a>
          </div>
        </div>

        <figure className="platform-hero-media relative lg:justify-self-end">
          <div className="relative overflow-hidden rounded-[1.5rem] border border-[#0a0e13]/10 bg-[#d9d4c8] shadow-[0_34px_90px_rgba(10,14,19,0.18)]">
            <img
              src="/booking-studio/hero.png"
              width="1024"
              height="685"
              alt={t('hero.visualAlt')}
              fetchPriority="high"
              decoding="async"
              className="aspect-[1.495/1] w-full object-cover"
            />
          </div>
          <SchedulePreview className="mt-3 lg:absolute lg:top-[56%] lg:-left-8 lg:mt-0 lg:w-[68%]" />
          <figcaption className="mt-4 flex flex-col gap-1 border-l-2 border-[#ffb020] pl-4 sm:flex-row sm:items-center sm:justify-between sm:gap-5">
            <span className="text-sm font-bold text-[#252a30]">{t('hero.visualCaption')}</span>
            <span className="text-xs text-[#686f75]">{t('hero.visualMeta')}</span>
          </figcaption>
        </figure>
      </div>
    </section>
  );
}

function SchedulePreview({ className }: { className?: string }) {
  const { t } = useTranslation(NsI18n.Platform);

  return (
    <aside
      className={`overflow-hidden rounded-2xl border border-[#0a0e13]/12 bg-[#fffefa] shadow-[0_22px_60px_rgba(10,14,19,0.16)] ${className ?? ''}`}
      aria-label={t('hero.schedule.title')}
    >
      <div className="flex items-center justify-between border-b border-[#0a0e13]/10 px-4 py-3">
        <span className="flex items-center gap-2 text-xs font-extrabold text-[#252a30]">
          <CalendarRange className="size-4 text-[#9a6200]" aria-hidden="true" />
          {t('hero.schedule.title')}
        </span>
        <span className="flex items-center gap-1.5 text-[0.6875rem] font-bold text-[#526159]">
          <span className="size-1.5 rounded-full bg-[#31845f]" aria-hidden="true" />
          {t('hero.schedule.status')}
        </span>
      </div>
      <table className="w-full table-fixed border-collapse text-left text-[0.6875rem]">
        <caption className="sr-only">{t('hero.schedule.caption')}</caption>
        <thead className="text-[#6a7177]">
          <tr>
            <th scope="col" className="w-14 px-3 py-2 font-semibold">
              {t('hero.schedule.time')}
            </th>
            <th scope="col" className="px-2 py-2 font-semibold">
              {t('hero.schedule.monday')}
            </th>
            <th scope="col" className="px-2 py-2 font-semibold">
              {t('hero.schedule.tuesday')}
            </th>
          </tr>
        </thead>
        <tbody className="border-t border-[#0a0e13]/8 text-[#252a30]">
          <tr>
            <th scope="row" className="px-3 py-2.5 font-semibold text-[#6a7177]">
              09:00
            </th>
            <td className="border-l border-[#0a0e13]/8 bg-[#ffb020]/14 px-2 py-2.5">
              <span className="block font-extrabold">{t('hero.schedule.morning')}</span>
              <span className="text-[#6a7177]">{t('hero.schedule.confirmed')}</span>
            </td>
            <td className="border-l border-[#0a0e13]/8 px-2 py-2.5 text-[#6a7177]">
              {t('hero.schedule.available')}
            </td>
          </tr>
          <tr className="border-t border-[#0a0e13]/8">
            <th scope="row" className="px-3 py-2.5 font-semibold text-[#6a7177]">
              14:00
            </th>
            <td className="border-l border-[#0a0e13]/8 px-2 py-2.5 text-[#6a7177]">
              {t('hero.schedule.available')}
            </td>
            <td className="border-l border-[#0a0e13]/8 bg-[#ffb020]/14 px-2 py-2.5">
              <span className="block font-extrabold">{t('hero.schedule.afternoon')}</span>
              <span className="text-[#6a7177]">{t('hero.schedule.confirmed')}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </aside>
  );
}

export function ServiceModelsSection() {
  const { t } = useTranslation(NsI18n.Platform);

  return (
    <section id="solutions" className="platform-section scroll-mt-24 border-y border-[#0a0e13]/8">
      <div className="mx-auto grid w-full max-w-350 gap-10 px-5 py-16 sm:px-8 lg:grid-cols-[0.72fr_1.28fr] lg:px-10 lg:py-20">
        <div className="platform-section-reveal max-w-135">
          <SectionEyebrow>{t('models.eyebrow')}</SectionEyebrow>
          <h2 className="platform-heading mt-4">{t('models.title')}</h2>
          <p className="platform-description mt-5">{t('models.description')}</p>
        </div>
        <div className="grid content-start border-l border-t border-[#0a0e13]/10 sm:grid-cols-2 lg:grid-cols-3">
          {SERVICE_MODELS.map(({ key, icon: Icon }) => (
            <div
              key={key}
              className="group flex min-h-30 items-center gap-4 border-b border-r border-[#0a0e13]/10 bg-[#fbfaf6] p-5 transition-colors hover:bg-[#ffb020]/10"
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#0a0e13] text-[#ffb020]">
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <span className="text-sm font-extrabold leading-5 text-[#252a30]">
                {t(`models.${key}`)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function TransformationSection() {
  const { t } = useTranslation(NsI18n.Platform);

  return (
    <section className="platform-section px-5 py-20 sm:px-8 sm:py-26 lg:px-10 lg:py-30">
      <div className="mx-auto w-full max-w-350">
        <div className="platform-section-reveal max-w-200">
          <h2 className="platform-heading">{t('transformation.title')}</h2>
          <p className="platform-description mt-5">{t('transformation.description')}</p>
        </div>

        <div className="mt-12 grid overflow-hidden rounded-[1.5rem] border border-[#0a0e13]/10 bg-[#fbfaf6] lg:grid-cols-[0.92fr_auto_1.08fr]">
          <TransformationList
            title={t('transformation.beforeTitle')}
            items={BEFORE_ITEMS.map((key) => t(key))}
            muted
          />
          <div className="grid place-items-center border-y border-[#0a0e13]/10 bg-[#ffb020] px-4 py-4 lg:border-x lg:border-y-0">
            <ArrowDownRight className="size-6 text-[#0a0e13] lg:-rotate-45" aria-hidden="true" />
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
    <div className={`p-6 sm:p-8 lg:p-10 ${muted ? 'bg-[#efede7]' : 'bg-[#fbfaf6]'}`}>
      <h3 className="text-lg font-extrabold tracking-[-0.025em] text-[#0a0e13]">{title}</h3>
      <ul className="mt-7 grid gap-4">
        {items.map((item) => (
          <li
            key={item}
            className="flex items-start gap-3 text-sm leading-6 text-[#50575d] sm:text-base"
          >
            {muted ? (
              <span className="mt-3 h-px w-4 shrink-0 bg-[#767c81]" aria-hidden="true" />
            ) : (
              <Check className="mt-1 size-4 shrink-0 text-[#9a6200]" aria-hidden="true" />
            )}
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CapabilitiesSection() {
  const { t } = useTranslation(NsI18n.Platform);

  return (
    <section
      id="product"
      className="platform-section scroll-mt-24 border-y border-[#0a0e13]/8 bg-[#efede7] px-5 py-20 sm:px-8 sm:py-26 lg:px-10 lg:py-30"
    >
      <div className="mx-auto grid w-full max-w-350 gap-12 lg:grid-cols-[0.72fr_1.28fr] lg:gap-20">
        <div className="platform-section-reveal h-fit max-w-135 lg:sticky lg:top-28">
          <h2 className="platform-heading">{t('capabilities.title')}</h2>
          <p className="platform-description mt-5">{t('capabilities.description')}</p>
        </div>

        <div className="grid gap-4">
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
          />
          <CapabilityRow
            icon={Handshake}
            title={t('capabilities.partners.title')}
            description={t('capabilities.partners.description')}
            detail={t('capabilities.partners.detail')}
            wide
          />
          <CapabilityRow
            icon={CircleDollarSign}
            title={t('capabilities.finance.title')}
            description={t('capabilities.finance.description')}
            detail={t('capabilities.finance.detail')}
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
  wide = false,
}: {
  icon: typeof Globe2;
  title: string;
  description: string;
  detail: string;
  image?: string;
  imageAlt?: string;
  wide?: boolean;
}) {
  return (
    <article
      className={`platform-section-reveal overflow-hidden rounded-[1.5rem] border border-[#0a0e13]/10 bg-[#fbfaf6] ${
        image ? 'grid md:grid-cols-[0.9fr_1.1fr]' : ''
      } ${wide ? 'md:ml-12' : ''}`}
    >
      <div className="p-6 sm:p-8 lg:p-10">
        <span className="grid size-11 place-items-center rounded-xl bg-[#ffb020] text-[#0a0e13]">
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <h3 className="mt-10 max-w-125 text-2xl leading-[1.08] font-extrabold tracking-[-0.04em] text-[#0a0e13] sm:text-3xl">
          {title}
        </h3>
        <p className="mt-4 max-w-135 text-sm leading-6 text-[#555c62] sm:text-base sm:leading-7">
          {description}
        </p>
        <p className="mt-8 border-l-2 border-[#ffb020] pl-4 text-sm leading-6 font-semibold text-[#343a40]">
          {detail}
        </p>
      </div>
      {image ? (
        <img
          src={image}
          width="1800"
          height="1200"
          loading="lazy"
          decoding="async"
          alt={imageAlt}
          className="h-full min-h-75 w-full object-cover"
        />
      ) : null}
    </article>
  );
}

export function WorkflowSection() {
  const { t } = useTranslation(NsI18n.Platform);
  const items = ['configure', 'publish', 'grow'] as const;

  return (
    <section
      id="workflow"
      className="platform-section scroll-mt-24 px-5 py-20 sm:px-8 sm:py-26 lg:px-10 lg:py-30"
    >
      <div className="mx-auto w-full max-w-350">
        <div className="platform-section-reveal max-w-180">
          <h2 className="platform-heading">{t('workflow.title')}</h2>
          <p className="platform-description mt-5">{t('workflow.description')}</p>
        </div>
        <div className="mt-14 grid border-t border-[#0a0e13]/14 lg:grid-cols-3">
          {items.map((key) => (
            <article
              key={key}
              className="platform-section-reveal border-b border-[#0a0e13]/12 py-9 lg:border-r lg:px-8 lg:first:pl-0 lg:last:border-r-0 lg:last:pr-0"
            >
              <h3 className="text-3xl font-extrabold tracking-[-0.045em] text-[#0a0e13]">
                {t(`workflow.${key}.title`)}
              </h3>
              <p className="mt-5 text-sm leading-6 text-[#555c62] sm:text-base sm:leading-7">
                {t(`workflow.${key}.description`)}
              </p>
              <p className="mt-8 flex items-start gap-2 text-sm leading-6 font-bold text-[#6f4900]">
                <ArrowRight className="mt-1 size-4 shrink-0" aria-hidden="true" />
                {t(`workflow.${key}.note`)}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function DemosSection() {
  const { t } = useTranslation(NsI18n.Platform);

  return (
    <section
      id="demos"
      className="platform-section scroll-mt-24 border-y border-[#0a0e13]/8 bg-[#efede7] px-5 py-20 sm:px-8 sm:py-26 lg:px-10 lg:py-30"
    >
      <div className="mx-auto w-full max-w-350">
        <div className="platform-section-reveal max-w-190">
          <h2 className="platform-heading">{t('demos.title')}</h2>
          <p className="platform-description mt-5">{t('demos.description')}</p>
        </div>
        <div className="mt-12 grid gap-5 lg:grid-cols-[1.12fr_0.88fr] lg:items-start">
          <DemoFigure
            image="/booking-studio/carousel/01.jpg"
            width="1200"
            height="1800"
            title={t('demos.studio.title')}
            description={t('demos.studio.description')}
            alt={t('demos.studio.alt')}
            label={t('demos.demoLabel')}
            landscape={false}
          />
          <DemoFigure
            image="/booking-stad/platform-courts.png"
            width="1568"
            height="1003"
            title={t('demos.sport.title')}
            description={t('demos.sport.description')}
            alt={t('demos.sport.alt')}
            label={t('demos.illustrationLabel')}
            landscape
          />
        </div>
      </div>
    </section>
  );
}

function DemoFigure({
  image,
  width,
  height,
  title,
  description,
  alt,
  label,
  landscape,
}: {
  image: string;
  width: string;
  height: string;
  title: string;
  description: string;
  alt: string;
  label: string;
  landscape: boolean;
}) {
  return (
    <figure className={`platform-section-reveal ${landscape ? 'lg:mt-24' : ''}`}>
      <div className="overflow-hidden rounded-[1.5rem] border border-[#0a0e13]/10 bg-[#d8d5cd]">
        <img
          src={image}
          width={width}
          height={height}
          loading="lazy"
          decoding="async"
          alt={alt}
          className={`w-full object-cover ${landscape ? 'aspect-[1.55/1]' : 'aspect-[1.2/1]'}`}
        />
      </div>
      <figcaption className="mt-5 grid gap-3 border-l-2 border-[#ffb020] pl-5 sm:grid-cols-[0.42fr_0.58fr]">
        <div>
          <p className="text-xs font-bold tracking-[0.08em] text-[#795100] uppercase">{label}</p>
          <h3 className="mt-2 text-2xl font-extrabold tracking-[-0.04em] text-[#0a0e13]">
            {title}
          </h3>
        </div>
        <p className="text-sm leading-6 text-[#555c62]">{description}</p>
      </figcaption>
    </figure>
  );
}

export function PricingSection() {
  const { t } = useTranslation(NsI18n.Platform);
  const plans = ['one', 'two', 'three'] as const;

  return (
    <section
      id="pricing"
      className="platform-section scroll-mt-24 px-5 py-20 sm:px-8 sm:py-26 lg:px-10 lg:py-30"
    >
      <div className="mx-auto w-full max-w-350">
        <div className="platform-section-reveal max-w-190">
          <SectionEyebrow>{t('pricing.eyebrow')}</SectionEyebrow>
          <h2 className="platform-heading mt-4">{t('pricing.title')}</h2>
          <p className="platform-description mt-5">{t('pricing.description')}</p>
        </div>
        <div className="platform-section-reveal mt-12 overflow-hidden border border-[#0a0e13]/10 bg-[#fbfaf6]">
          <div className="grid border-b border-[#0a0e13]/10 bg-[#ffb020]/12 lg:grid-cols-[1fr_auto] lg:items-center">
            <div className="flex items-start gap-4 p-6 sm:p-8">
              <Boxes className="mt-1 size-6 shrink-0 text-[#8a5700]" aria-hidden="true" />
              <div>
                <h3 className="text-lg font-extrabold tracking-[-0.03em] text-[#0a0e13]">
                  {t('pricing.pendingTitle')}
                </h3>
                <p className="mt-2 max-w-190 text-sm leading-6 text-[#555c62]">
                  {t('pricing.pendingDescription')}
                </p>
              </div>
            </div>
            <div className="border-t border-[#0a0e13]/10 p-6 lg:border-l lg:border-t-0 lg:p-8">
              <a href="#consultation" className="platform-dark-button group w-full lg:w-auto">
                {t('pricing.consultation')}
                <ArrowRight
                  className="size-4 transition-transform group-hover:translate-x-1"
                  aria-hidden="true"
                />
              </a>
            </div>
          </div>
          <div className="grid lg:grid-cols-3">
            {plans.map((plan) => (
              <article
                key={plan}
                className="border-b border-[#0a0e13]/10 p-7 last:border-b-0 lg:border-b-0 lg:border-r lg:last:border-r-0"
              >
                <h3 className="text-xl font-extrabold text-[#0a0e13]">
                  {t(`pricing.plans.${plan}.name`)}
                </h3>
                <p className="mt-5 text-3xl font-extrabold tracking-[-0.04em] text-[#0a0e13]">
                  {t(`pricing.plans.${plan}.price`)}
                </p>
                <p className="mt-7 border-t border-[#0a0e13]/10 pt-5 text-sm leading-6 text-[#555c62]">
                  {t(`pricing.plans.${plan}.limits`)}
                </p>
                <p className="mt-3 text-sm leading-6 text-[#555c62]">
                  {t(`pricing.plans.${plan}.feature`)}
                </p>
                <a href="#consultation" className="platform-secondary-button mt-8 w-full">
                  {t('pricing.consultation')}
                </a>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export function TrustSection() {
  const { t } = useTranslation(NsI18n.Platform);

  return (
    <section className="platform-section border-y border-[#0a0e13]/8 bg-[#fff4d8] px-5 py-20 sm:px-8 sm:py-26 lg:px-10 lg:py-30">
      <div className="mx-auto w-full max-w-350">
        <div className="platform-section-reveal grid gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-end">
          <div>
            <h2 className="platform-heading">{t('trust.title')}</h2>
          </div>
          <p className="platform-description">{t('trust.description')}</p>
        </div>
        <div className="mt-12 grid border-l border-t border-[#0a0e13]/12 sm:grid-cols-2 lg:grid-cols-5">
          {TRUST_ITEMS.map(({ key, icon: Icon }) => (
            <article key={key} className="border-b border-r border-[#0a0e13]/12 bg-[#fff8e8] p-6">
              <Icon className="size-5 text-[#8a5700]" aria-hidden="true" />
              <h3 className="mt-10 text-base font-extrabold leading-6 text-[#0a0e13]">
                {t(`trust.${key}.title`)}
              </h3>
              <p className="mt-3 text-sm leading-6 text-[#5c5c55]">
                {t(`trust.${key}.description`)}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function FaqSection() {
  const { t } = useTranslation(NsI18n.Platform);

  return (
    <section
      id="faq"
      className="platform-section scroll-mt-24 px-5 py-20 sm:px-8 sm:py-26 lg:px-10 lg:py-30"
    >
      <div className="mx-auto grid w-full max-w-350 gap-12 lg:grid-cols-[0.72fr_1.28fr] lg:gap-20">
        <div className="platform-section-reveal h-fit max-w-135 lg:sticky lg:top-28">
          <h2 className="platform-heading">{t('faq.title')}</h2>
          <p className="platform-description mt-5">{t('faq.description')}</p>
        </div>
        <div className="border-t border-[#0a0e13]/14">
          {FAQ_ITEMS.map((key) => (
            <details key={key} className="platform-faq border-b border-[#0a0e13]/14">
              <summary className="flex min-h-20 cursor-pointer list-none items-center justify-between gap-5 py-5 text-left text-base font-extrabold text-[#20252a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b87300] focus-visible:ring-offset-4 sm:text-lg">
                {t(`faq.${key}.question`)}
                <ChevronDown className="platform-faq-icon size-5 shrink-0" aria-hidden="true" />
              </summary>
              <p className="max-w-175 pb-7 pr-10 text-sm leading-7 text-[#555c62] sm:text-base">
                {t(`faq.${key}.answer`)}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export function ConsultationSection() {
  const { t } = useTranslation(NsI18n.Platform);

  return (
    <section
      id="consultation"
      className="platform-section scroll-mt-24 border-t border-[#0a0e13]/8 bg-[#efede7] px-5 py-20 sm:px-8 sm:py-26 lg:px-10 lg:py-30"
    >
      <div className="mx-auto grid w-full max-w-350 gap-10 lg:grid-cols-[0.72fr_1.28fr] lg:gap-20">
        <div className="platform-section-reveal max-w-140">
          <SectionEyebrow>{t('consultation.eyebrow')}</SectionEyebrow>
          <h2 className="platform-heading mt-4">{t('consultation.title')}</h2>
          <p className="platform-description mt-5">{t('consultation.description')}</p>
          <BadgeCheck className="mt-10 size-10 text-[#9a6200]" aria-hidden="true" />
        </div>
        <div className="platform-section-reveal rounded-[1.5rem] border border-[#0a0e13]/10 bg-[#fbfaf6] p-6 shadow-[0_24px_70px_rgba(10,14,19,0.08)] sm:p-8 lg:p-10">
          <PlatformConsultationForm />
        </div>
      </div>
    </section>
  );
}

export function PlatformFooter({ loaderData }: { loaderData: PlatformRootLoaderPayload }) {
  const { t } = useTranslation(NsI18n.Platform);
  const alternateLocale = loaderData.locale === 'vi' ? 'en' : 'vi';

  return (
    <footer className="border-t border-[#0a0e13]/10 bg-[#e5e2da] px-5 py-12 sm:px-8 lg:px-10">
      <div className="mx-auto grid w-full max-w-350 gap-12 lg:grid-cols-[1.1fr_1.9fr]">
        <div>
          <PlatformBrand label={t('brandLabel')} />
          <p className="mt-5 max-w-100 text-sm leading-6 text-[#555c62]">{t('footer.tagline')}</p>
        </div>
        <div className="grid gap-8 sm:grid-cols-3">
          <FooterGroup
            title={t('footer.productTitle')}
            links={[
              [t('footer.product'), '#product'],
              [t('footer.workflow'), '#workflow'],
              [t('footer.pricing'), '#pricing'],
            ]}
          />
          <FooterGroup
            title={t('footer.solutionsTitle')}
            links={[
              [t('footer.demos'), '#demos'],
              [t('footer.faq'), '#faq'],
              [t('footer.consultation'), '#consultation'],
            ]}
          />
          <FooterGroup
            title={t('footer.supportTitle')}
            links={[
              [t('footer.login'), loaderData.dashboardLoginUrl],
              [alternateLocale.toUpperCase(), `/${alternateLocale}`],
            ]}
          />
        </div>
      </div>
      <div className="mx-auto mt-12 flex w-full max-w-350 flex-col gap-3 border-t border-[#0a0e13]/10 pt-6 text-xs leading-5 text-[#656b70] sm:flex-row sm:items-center sm:justify-between">
        <p>© {t('footer.rights')}</p>
        <p title={t('footer.legalUnavailable')}>
          {t('footer.terms')} / {t('footer.privacy')}
        </p>
      </div>
    </footer>
  );
}

function FooterGroup({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <nav aria-label={title}>
      <h2 className="text-sm font-extrabold text-[#20252a]">{title}</h2>
      <ul className="mt-4 grid gap-3">
        {links.map(([label, href]) => (
          <li key={`${label}-${href}`}>
            <a
              href={href}
              className="text-sm text-[#555c62] transition hover:text-[#8a5600] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b87300]"
            >
              {label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function SectionEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-extrabold tracking-[0.15em] text-[#795100] uppercase">
      {children}
    </p>
  );
}
