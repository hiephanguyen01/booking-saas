import {
  ArrowRight,
  Blocks,
  Building2,
  CalendarRange,
  CircleDollarSign,
  Globe2,
  LockKeyhole,
  Network,
  ShieldCheck,
  UsersRound,
} from 'lucide-react';
import { Link } from 'react-router';
import { NsI18n, useTranslation } from '../../../lib/i18n';
import type { PlatformRootLoaderPayload } from '../../root/server/root-loader.server';
import { PlatformProductPreview } from './platform-product-preview';

const BENEFITS = [
  { key: 'storefront', icon: Globe2 },
  { key: 'operations', icon: CalendarRange },
  { key: 'finance', icon: CircleDollarSign },
  { key: 'security', icon: ShieldCheck },
] as const;

const WORKFLOW = ['configure', 'publish', 'operate'] as const;

const AUDIENCES = [
  { key: 'tenant', icon: Building2 },
  { key: 'partner', icon: Network },
  { key: 'customer', icon: UsersRound },
] as const;

export function PlatformLanding({ loaderData }: { loaderData: PlatformRootLoaderPayload }) {
  const { locale, dashboardLoginUrl } = loaderData;
  const { t } = useTranslation(NsI18n.Platform);
  const alternateLocale = locale === 'vi' ? 'en' : 'vi';

  return (
    <div className="platform-landing min-h-dvh overflow-hidden bg-[#f3f6f1] text-[#122420] selection:bg-[#b9f36b] selection:text-[#0b302b]">
      <a
        href="#platform-main"
        className="fixed left-4 top-3 z-100 -translate-y-20 rounded-full bg-[#0b302b] px-4 py-2.5 text-sm font-bold text-white transition-transform focus:translate-y-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#b9f36b] focus-visible:ring-offset-2"
      >
        {t('skipToContent')}
      </a>

      <header className="relative z-40 border-b border-[#173a34]/10 bg-[#f3f6f1]/88 backdrop-blur-xl">
        <div className="mx-auto flex h-18 w-full max-w-300 items-center justify-between px-5 sm:px-8 lg:px-10">
          <PlatformBrand label={t('brandLabel')} />

          <nav aria-label={t('nav.label')} className="hidden items-center gap-7 lg:flex">
            <a className="platform-nav-link" href="#benefits">
              {t('nav.benefits')}
            </a>
            <a className="platform-nav-link" href="#workflow">
              {t('nav.workflow')}
            </a>
            <a className="platform-nav-link" href="#audiences">
              {t('nav.audiences')}
            </a>
          </nav>

          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              to={`/${alternateLocale}`}
              aria-label={t('nav.language')}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-[#173a34]/12 px-3 text-xs font-extrabold tracking-[0.12em] text-[#35534b] uppercase transition hover:border-[#173a34]/30 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176849] focus-visible:ring-offset-2"
            >
              {alternateLocale}
            </Link>
            <a
              href={dashboardLoginUrl}
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#0b302b] px-4 text-sm font-bold text-white shadow-[0_8px_24px_rgba(11,48,43,0.16)] transition hover:-translate-y-0.5 hover:bg-[#17483f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176849] focus-visible:ring-offset-2 sm:px-5"
            >
              {t('nav.login')}
            </a>
          </div>
        </div>
      </header>

      <main id="platform-main">
        <section className="platform-grid relative isolate border-b border-[#173a34]/10 px-5 pb-18 pt-16 sm:px-8 sm:pb-24 sm:pt-22 lg:px-10 lg:pb-30">
          <div className="platform-orbit pointer-events-none absolute left-[8%] top-12 -z-10 size-72 rounded-full border border-[#176849]/10 sm:size-120" />
          <div className="mx-auto grid w-full max-w-300 items-center gap-14 lg:grid-cols-[0.92fr_1.08fr] lg:gap-16">
            <div className="max-w-170">
              <p className="platform-reveal font-mono text-[11px] font-bold tracking-[0.2em] text-[#176849] uppercase">
                {t('hero.eyebrow')}
              </p>
              <h1 className="platform-reveal platform-delay-1 mt-5 text-[clamp(2.85rem,7vw,5.9rem)] leading-[0.94] font-extrabold tracking-[-0.07em] text-[#0b302b]">
                {t('hero.title')}
              </h1>
              <p className="platform-reveal platform-delay-2 mt-7 max-w-150 text-base leading-7 text-[#526a63] sm:text-lg sm:leading-8">
                {t('hero.description')}
              </p>
              <div className="platform-reveal platform-delay-3 mt-9 flex flex-col gap-3 sm:flex-row">
                <a
                  href={dashboardLoginUrl}
                  className="group inline-flex min-h-13 items-center justify-center gap-2 rounded-full bg-[#0b302b] px-6 text-sm font-extrabold text-white shadow-[0_14px_36px_rgba(11,48,43,0.2)] transition hover:-translate-y-0.5 hover:bg-[#17483f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176849] focus-visible:ring-offset-2"
                >
                  {t('hero.primaryCta')}
                  <ArrowRight
                    className="size-4 transition-transform group-hover:translate-x-1"
                    aria-hidden="true"
                  />
                </a>
                <a
                  href="#benefits"
                  className="inline-flex min-h-13 items-center justify-center rounded-full border border-[#173a34]/16 bg-white/65 px-6 text-sm font-extrabold text-[#173a34] transition hover:-translate-y-0.5 hover:border-[#173a34]/35 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176849] focus-visible:ring-offset-2"
                >
                  {t('hero.secondaryCta')}
                </a>
              </div>
              <div className="platform-reveal platform-delay-4 mt-8 flex items-start gap-3 text-sm leading-6 text-[#526a63]">
                <LockKeyhole className="mt-0.5 size-4 shrink-0 text-[#176849]" aria-hidden="true" />
                <p>{t('hero.trustNote')}</p>
              </div>
            </div>

            <div className="platform-reveal platform-delay-2 lg:justify-self-end">
              <PlatformProductPreview />
            </div>
          </div>
        </section>

        <section
          id="benefits"
          className="scroll-mt-24 bg-[#0b302b] px-5 py-20 text-white sm:px-8 sm:py-28 lg:px-10"
        >
          <div className="mx-auto w-full max-w-300">
            <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:gap-18">
              <div>
                <SectionEyebrow inverted>{t('benefits.eyebrow')}</SectionEyebrow>
                <h2 className="mt-4 max-w-120 text-4xl leading-[1.02] font-extrabold tracking-[-0.055em] sm:text-5xl">
                  {t('benefits.title')}
                </h2>
              </div>
              <p className="max-w-150 self-end text-base leading-7 text-[#b9cbc5] sm:text-lg sm:leading-8">
                {t('benefits.description')}
              </p>
            </div>

            <div className="mt-14 grid border-l border-t border-white/12 sm:grid-cols-2 lg:grid-cols-4">
              {BENEFITS.map(({ key, icon: Icon }, index) => (
                <article
                  key={key}
                  className="group min-h-70 border-b border-r border-white/12 p-6 transition-colors hover:bg-white/[0.045] sm:p-7"
                >
                  <div className="flex items-center justify-between">
                    <div className="grid size-11 place-items-center rounded-2xl bg-[#b9f36b] text-[#0b302b]">
                      <Icon className="size-5" aria-hidden="true" />
                    </div>
                    <span className="font-mono text-[10px] font-bold tracking-[0.18em] text-[#79928a]">
                      0{index + 1}
                    </span>
                  </div>
                  <h3 className="mt-12 text-xl font-bold tracking-[-0.03em]">
                    {t(`benefits.${key}.title`)}
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-[#a9bdb6]">
                    {t(`benefits.${key}.description`)}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section
          id="workflow"
          className="scroll-mt-24 bg-[#f3f6f1] px-5 py-20 sm:px-8 sm:py-28 lg:px-10"
        >
          <div className="mx-auto w-full max-w-300">
            <SectionEyebrow>{t('workflow.eyebrow')}</SectionEyebrow>
            <h2 className="mt-4 max-w-190 text-4xl leading-[1.04] font-extrabold tracking-[-0.055em] text-[#0b302b] sm:text-5xl">
              {t('workflow.title')}
            </h2>
            <div className="relative mt-14 grid gap-4 lg:grid-cols-3">
              <div
                className="absolute left-[16%] right-[16%] top-7 hidden border-t border-dashed border-[#7ea094] lg:block"
                aria-hidden="true"
              />
              {WORKFLOW.map((key) => (
                <article
                  key={key}
                  className="relative rounded-[1.5rem] border border-[#173a34]/12 bg-white p-7 shadow-[0_18px_60px_rgba(13,50,44,0.055)] sm:p-8"
                >
                  <span className="relative z-10 inline-flex min-h-14 min-w-14 items-center justify-center rounded-full border-4 border-[#f3f6f1] bg-[#b9f36b] font-mono text-xs font-bold text-[#0b302b]">
                    {t(`workflow.${key}.step`)}
                  </span>
                  <h3 className="mt-10 text-2xl font-extrabold tracking-[-0.04em] text-[#0b302b]">
                    {t(`workflow.${key}.title`)}
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-[#5b706a] sm:text-base sm:leading-7">
                    {t(`workflow.${key}.description`)}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section
          id="audiences"
          className="scroll-mt-24 border-y border-[#173a34]/10 bg-[#e8eee9] px-5 py-20 sm:px-8 sm:py-28 lg:px-10"
        >
          <div className="mx-auto w-full max-w-300">
            <div className="max-w-180">
              <SectionEyebrow>{t('audiences.eyebrow')}</SectionEyebrow>
              <h2 className="mt-4 text-4xl leading-[1.04] font-extrabold tracking-[-0.055em] text-[#0b302b] sm:text-5xl">
                {t('audiences.title')}
              </h2>
            </div>
            <div className="mt-14 grid gap-4 lg:grid-cols-3">
              {AUDIENCES.map(({ key, icon: Icon }) => (
                <article
                  key={key}
                  className="group rounded-[1.5rem] border border-[#173a34]/12 bg-[#f8faf7] p-7 transition hover:-translate-y-1 hover:border-[#176849]/35 sm:p-8"
                >
                  <div className="flex items-center justify-between">
                    <p className="font-mono text-[10px] font-bold tracking-[0.2em] text-[#176849] uppercase">
                      {t(`audiences.${key}.label`)}
                    </p>
                    <Icon className="size-5 text-[#648078]" aria-hidden="true" />
                  </div>
                  <h3 className="mt-16 text-2xl leading-tight font-extrabold tracking-[-0.04em] text-[#0b302b]">
                    {t(`audiences.${key}.title`)}
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-[#5b706a] sm:text-base sm:leading-7">
                    {t(`audiences.${key}.description`)}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-[#f3f6f1] px-5 py-16 sm:px-8 sm:py-22 lg:px-10">
          <div className="platform-cta relative mx-auto w-full max-w-300 overflow-hidden rounded-[2rem] bg-[#b9f36b] px-6 py-12 text-[#0b302b] sm:px-12 sm:py-16 lg:px-16">
            <Blocks
              className="pointer-events-none absolute -right-8 -top-8 size-48 rotate-12 text-[#0b302b]/8 sm:size-64"
              aria-hidden="true"
            />
            <div className="relative max-w-190">
              <SectionEyebrow>{t('cta.eyebrow')}</SectionEyebrow>
              <h2 className="mt-4 text-4xl leading-[1.02] font-extrabold tracking-[-0.06em] sm:text-5xl lg:text-6xl">
                {t('cta.title')}
              </h2>
              <p className="mt-5 max-w-140 text-base leading-7 text-[#31524a] sm:text-lg">
                {t('cta.description')}
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <a
                  href={dashboardLoginUrl}
                  className="group inline-flex min-h-13 items-center justify-center gap-2 rounded-full bg-[#0b302b] px-6 text-sm font-extrabold text-white transition hover:-translate-y-0.5 hover:bg-[#17483f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b302b] focus-visible:ring-offset-2 focus-visible:ring-offset-[#b9f36b]"
                >
                  {t('cta.login')}
                  <ArrowRight
                    className="size-4 transition-transform group-hover:translate-x-1"
                    aria-hidden="true"
                  />
                </a>
                <a
                  href="#workflow"
                  className="inline-flex min-h-13 items-center justify-center rounded-full border border-[#0b302b]/20 px-6 text-sm font-extrabold transition hover:border-[#0b302b]/45 hover:bg-white/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b302b] focus-visible:ring-offset-2 focus-visible:ring-offset-[#b9f36b]"
                >
                  {t('cta.explore')}
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-[#071f1c] px-5 py-10 text-white sm:px-8 lg:px-10">
        <div className="mx-auto flex w-full max-w-300 flex-col gap-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <PlatformBrand label={t('brandLabel')} inverted />
            <p className="mt-4 max-w-95 text-sm leading-6 text-[#9cb2ab]">{t('footer.tagline')}</p>
          </div>
          <div className="flex flex-col gap-6 sm:items-end">
            <nav
              aria-label={t('nav.label')}
              className="flex flex-wrap gap-x-6 gap-y-3 text-sm font-semibold text-[#c4d2ce]"
            >
              <a
                href="#benefits"
                className="hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b9f36b]"
              >
                {t('footer.product')}
              </a>
              <a
                href="#workflow"
                className="hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b9f36b]"
              >
                {t('footer.workflow')}
              </a>
              <a
                href={dashboardLoginUrl}
                className="hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b9f36b]"
              >
                {t('footer.login')}
              </a>
            </nav>
            <p className="text-xs text-[#728c84]">© {t('footer.rights')}</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

function PlatformBrand({ label, inverted = false }: { label: string; inverted?: boolean }) {
  return (
    <Link
      to="."
      aria-label={label}
      className="inline-flex min-h-11 items-center gap-2.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176849] focus-visible:ring-offset-2"
    >
      <span
        className={`relative grid size-9 place-items-center overflow-hidden rounded-[0.7rem] ${inverted ? 'bg-[#b9f36b] text-[#0b302b]' : 'bg-[#0b302b] text-[#b9f36b]'}`}
        aria-hidden="true"
      >
        <span className="absolute -right-2 -top-2 size-5 rotate-45 border-2 border-current opacity-50" />
        <span className="text-base font-black tracking-[-0.08em]">B</span>
      </span>
      <span
        className={`text-lg font-extrabold tracking-[-0.045em] ${inverted ? 'text-white' : 'text-[#0b302b]'}`}
      >
        BookingOS
      </span>
    </Link>
  );
}

function SectionEyebrow({
  children,
  inverted = false,
}: {
  children: React.ReactNode;
  inverted?: boolean;
}) {
  return (
    <p
      className={`font-mono text-[10px] font-bold tracking-[0.2em] uppercase ${inverted ? 'text-[#b9f36b]' : 'text-[#176849]'}`}
    >
      {children}
    </p>
  );
}
