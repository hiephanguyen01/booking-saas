import {
  ArrowDownRight,
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
  PlayCircle,
  ReceiptText,
  Rocket,
  SlidersHorizontal,
  Sparkles,
  TrendingUp,
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
    <section className="platform-hero px-5 pb-18 pt-14 sm:px-6 sm:pt-16">
      <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,.95fr)] lg:gap-14">
        <div className="platform-hero-copy">
          <h1 className="max-w-[14ch] text-[clamp(2.375rem,5vw,3.75rem)] leading-[1.04] font-extrabold tracking-[-0.03em] text-balance text-[#0a0e13]">
            {t('hero.title')}
          </h1>
          <p className="mt-5 max-w-[52ch] text-base leading-[1.6] text-[#4a515b] sm:text-[19px]">
            {t('hero.description')}
          </p>
          <div className="mt-8 flex flex-col gap-3.5 sm:flex-row">
            <a href="#consultation" className="platform-primary-button">
              {t('hero.primaryCta')}
            </a>
            <a href="#demos" className="platform-secondary-button">
              <PlayCircle className="size-5" aria-hidden="true" />
              {t('hero.secondaryCta')}
            </a>
          </div>
        </div>

        <figure className="platform-hero-media relative pb-0 lg:pb-10">
          <div className="relative overflow-hidden rounded-[1.25rem] border border-[#e4e6ea] bg-white shadow-[0_24px_60px_-28px_rgba(10,14,19,.4)]">
            <img
              src="/booking-studio/hero.png"
              width="1024"
              height="485"
              alt={t('hero.visualAlt')}
              fetchPriority="high"
              decoding="async"
              className="aspect-4/3 w-full object-cover"
            />
          </div>
          <SchedulePreview className="mt-3 lg:absolute lg:-bottom-0 lg:-left-10 lg:mt-0 lg:w-[56%]" />
        </figure>
      </div>
    </section>
  );
}

function SchedulePreview({ className }: { className?: string }) {
  const { t } = useTranslation(NsI18n.Platform);

  return (
    <aside
      className={`overflow-hidden rounded-2xl border border-[#e4e6ea] bg-white shadow-[0_20px_44px_-22px_rgba(10,14,19,.45)] ${className ?? ''}`}
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
    <section id="models" className="platform-section border-t border-[#e7e9ed] bg-[#fbfbfc]">
      <div className="mx-auto grid w-full max-w-300 gap-10 px-5 py-18 sm:px-6 sm:py-20 lg:grid-cols-[minmax(0,.85fr)_minmax(0,1.15fr)] lg:gap-13">
        <div className="platform-section-reveal max-w-120">
          <h2 className="platform-heading">{t('models.title')}</h2>
          <p className="platform-description mt-5">{t('models.description')}</p>
        </div>
        <div className="grid content-start gap-px overflow-hidden rounded-[1.125rem] border border-[#e7e9ed] bg-[#e7e9ed] sm:grid-cols-2">
          {SERVICE_MODELS.map(({ key, icon: Icon }) => (
            <div
              key={key}
              className="group flex min-h-32 flex-col items-start gap-3 bg-white p-6 transition-colors hover:bg-[#fffaf0]"
            >
              <span className="grid size-10.5 shrink-0 place-items-center rounded-[0.6875rem] bg-[#fff4de] text-[#b27400]">
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <span className="text-[17px] font-bold leading-6 text-[#252a30]">
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

export function CapabilitiesSection() {
  const { t } = useTranslation(NsI18n.Platform);

  return (
    <section
      id="capabilities"
      className="platform-section border-t border-[#e7e9ed] bg-[#fbfbfc] px-5 py-18 sm:px-6 sm:py-22"
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
        dark ? 'bg-[#0a0e13] text-[#f4f5f7]' : 'border border-[#e4e6ea] bg-white text-[#0a0e13]'
      }`}
    >
      <div className={mediaFirst ? 'md:order-2' : undefined}>
        <span
          className={`grid size-11 place-items-center rounded-xl ${
            dark ? 'bg-[#1b212b] text-[#ffb020]' : 'bg-[#fff4de] text-[#b27400]'
          }`}
        >
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <h3 className="mt-5 max-w-125 text-2xl leading-[1.15] font-bold tracking-[-0.02em]">
          {title}
        </h3>
        <p
          className={`mt-4 max-w-135 text-[15.5px] leading-6 ${dark ? 'text-[#c9cdd4]' : 'text-[#4a515b]'}`}
        >
          {description}
        </p>
        <p
          className={`mt-5 flex items-start gap-2 text-sm leading-6 font-semibold ${
            dark ? 'text-[#f4f5f7]' : 'text-[#343a40]'
          }`}
        >
          <Check className="mt-1 size-4 shrink-0 text-[#b27400]" aria-hidden="true" />
          {detail}
        </p>
      </div>
      <div
        className={`overflow-hidden rounded-[0.875rem] border ${
          mediaFirst ? 'md:order-1' : ''
        } ${dark ? 'border-[#2a313c] bg-[#141922]' : 'border-[#e4e6ea] bg-[#edeff2]'}`}
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

export function DemosSection() {
  const { t } = useTranslation(NsI18n.Platform);

  return (
    <section
      id="demos"
      className="platform-section border-t border-[#e7e9ed] bg-[#fbfbfc] px-5 py-18 sm:px-6 sm:py-22"
    >
      <div className="mx-auto w-full max-w-300">
        <div className="platform-section-reveal max-w-190">
          <h2 className="platform-heading">{t('demos.title')}</h2>
          <p className="platform-description mt-5">{t('demos.description')}</p>
        </div>
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          <DemoFigure
            image="/booking-studio/carousel/01.jpg"
            width="1200"
            height="1800"
            title={t('demos.studio.title')}
            description={t('demos.studio.description')}
            alt={t('demos.studio.alt')}
            label={t('demos.demoLabel')}
          />
          <DemoFigure
            image="/booking-stad/platform-courts.png"
            width="1568"
            height="1003"
            title={t('demos.sport.title')}
            description={t('demos.sport.description')}
            alt={t('demos.sport.alt')}
            label={t('demos.illustrationLabel')}
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
}: {
  image: string;
  width: string;
  height: string;
  title: string;
  description: string;
  alt: string;
  label: string;
}) {
  return (
    <figure className="platform-section-reveal overflow-hidden rounded-[1.375rem] border border-[#e4e6ea] bg-white">
      <div className="overflow-hidden border-b border-[#e4e6ea] bg-[#edeff2]">
        <img
          src={image}
          width={width}
          height={height}
          loading="lazy"
          decoding="async"
          alt={alt}
          className="aspect-[16/10] w-full object-cover"
        />
      </div>
      <figcaption className="p-7 sm:p-8">
        <p className="inline-flex rounded-full bg-[#fff4de] px-3 py-1.5 text-xs font-bold tracking-[0.05em] text-[#b27400] uppercase">
          {label}
        </p>
        <h3 className="mt-4 text-[22px] font-bold tracking-[-0.02em] text-[#0a0e13]">{title}</h3>
        <p className="mt-2 text-[15.5px] leading-6 text-[#4a515b]">{description}</p>
      </figcaption>
    </figure>
  );
}

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

export function TrustSection() {
  const { t } = useTranslation(NsI18n.Platform);

  return (
    <section className="platform-section border-t border-[#e7e9ed] bg-[#fbfbfc] px-5 py-18 sm:px-6 sm:py-22">
      <div className="mx-auto grid w-full max-w-300 gap-10 lg:grid-cols-[minmax(0,.9fr)_minmax(0,1.1fr)] lg:gap-13">
        <div className="platform-section-reveal">
          <h2 className="platform-heading">{t('trust.title')}</h2>
          <p className="platform-description mt-5">{t('trust.description')}</p>
        </div>
        <ul className="platform-section-reveal grid content-start gap-4">
          {TRUST_ITEMS.map(({ key, icon: Icon }) => (
            <li key={key} className="flex items-start gap-3 text-[#2a303a]">
              <Icon className="mt-0.5 size-5 shrink-0 text-[#b27400]" aria-hidden="true" />
              <span>
                <span className="block text-base font-semibold">{t(`trust.${key}.title`)}</span>
                <span className="mt-1 block text-sm leading-6 text-[#5a616b]">
                  {t(`trust.${key}.description`)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function FaqSection() {
  const { t } = useTranslation(NsI18n.Platform);

  return (
    <section id="faq" className="platform-section px-5 py-18 sm:px-6 sm:py-22">
      <div className="mx-auto w-full max-w-215">
        <div className="platform-section-reveal">
          <h2 className="platform-heading">{t('faq.title')}</h2>
        </div>
        <div className="mt-10 border-t border-[#e4e6ea]">
          {FAQ_ITEMS.map((key) => (
            <details key={key} className="platform-faq border-b border-[#e4e6ea]">
              <summary className="flex min-h-18 cursor-pointer list-none items-center justify-between gap-5 px-1 py-5 text-left text-base font-semibold text-[#0a0e13] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b87300] focus-visible:ring-offset-4 sm:text-[17.5px]">
                {t(`faq.${key}.question`)}
                <ChevronDown
                  className="platform-faq-icon size-5 shrink-0 text-[#b27400]"
                  aria-hidden="true"
                />
              </summary>
              <p className="max-w-[64ch] px-1 pb-6 pr-10 text-sm leading-[1.6] text-[#4a515b] sm:text-base">
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

export function PlatformFooter({ loaderData }: { loaderData: PlatformRootLoaderPayload }) {
  const { t } = useTranslation(NsI18n.Platform);
  const alternateLocale = loaderData.locale === 'vi' ? 'en' : 'vi';

  return (
    <footer className="border-t border-[#e4e6ea] bg-[#fbfbfc] px-5 py-10 sm:px-6 sm:py-14">
      <div className="mx-auto grid w-full max-w-300 gap-10 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <div>
          <PlatformBrand label={t('brandLabel')} />
          <p className="mt-4 max-w-95 text-[15px] leading-6 text-[#6a707a]">
            {t('footer.tagline')}
          </p>
          <div className="mt-5 flex gap-2">
            <span className="rounded-full bg-[#0a0e13] px-3 py-1.5 text-sm font-semibold text-white">
              {loaderData.locale === 'vi' ? 'Tiếng Việt' : 'English'}
            </span>
            <a
              href={`/${alternateLocale}`}
              className="rounded-full border border-[#d3d6dc] px-3 py-1.5 text-sm font-semibold text-[#4a515b] hover:border-[#0a0e13] hover:text-[#0a0e13]"
            >
              {alternateLocale === 'vi' ? 'Tiếng Việt' : 'English'}
            </a>
          </div>
        </div>
        <FooterGroup
          title={t('footer.productTitle')}
          links={[
            [t('footer.product'), '#capabilities'],
            [t('nav.solutions'), '#models'],
            [t('footer.workflow'), '#workflow'],
            [t('footer.pricing'), '#pricing'],
            [t('footer.faq'), '#faq'],
            [t('footer.login'), loaderData.dashboardLoginUrl],
          ]}
        />
        <nav aria-label={t('footer.legalTitle')}>
          <h2 className="text-[13px] font-bold tracking-[0.05em] text-[#8a909a] uppercase">
            {t('footer.legalTitle')}
          </h2>
          <ul className="mt-4 grid gap-3 text-[15px] text-[#9aa0a9]">
            <li title={t('footer.legalUnavailable')}>{t('footer.terms')}</li>
            <li title={t('footer.legalUnavailable')}>{t('footer.privacy')}</li>
          </ul>
        </nav>
      </div>
      <div className="mx-auto mt-10 w-full max-w-300 border-t border-[#e4e6ea] pt-6 text-sm text-[#8a909a]">
        <p>© {t('footer.rights')}</p>
      </div>
    </footer>
  );
}

function FooterGroup({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <nav aria-label={title}>
      <h2 className="text-[13px] font-bold tracking-[0.05em] text-[#8a909a] uppercase">{title}</h2>
      <ul className="mt-4 grid gap-3">
        {links.map(([label, href]) => (
          <li key={`${label}-${href}`}>
            <a
              href={href}
              className="text-[15px] text-[#4a515b] transition hover:text-[#b27400] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b87300]"
            >
              {label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
