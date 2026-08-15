import { CalendarRange, PlayCircle } from 'lucide-react';
import { NsI18n, useTranslation } from '@booking/i18n';
import { Image } from '@booking/ui/components/media/image';

export function PlatformHero() {
  const { t } = useTranslation(NsI18n.Platform);

  return (
    <section className="platform-hero px-5 pb-18 pt-14 sm:px-6 sm:pt-16">
      <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,.95fr)] lg:gap-14">
        <div className="platform-hero-copy">
          <h1 className="max-w-[14ch] text-[clamp(2.375rem,5vw,3.75rem)] leading-[1.04] font-extrabold tracking-[-0.03em] text-balance text-foreground">
            {t('hero.title')}
          </h1>
          <p className="mt-5 max-w-[52ch] text-base leading-[1.6] text-muted-foreground sm:text-[19px]">
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
          <div className="platform-media-shadow relative overflow-hidden rounded-[1.25rem] border border-border bg-card">
            <Image
              src="/studiohub/hero.png"
              width="1024"
              height="485"
              alt={t('hero.visualAlt')}
              priority
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
      className={`platform-card-shadow overflow-hidden rounded-2xl border border-border bg-card ${className ?? ''}`}
      aria-label={t('hero.schedule.title')}
    >
      <div className="flex items-center justify-between border-b border-foreground/10 px-4 py-3">
        <span className="flex items-center gap-2 text-xs font-extrabold text-(--platform-ink-soft)">
          <CalendarRange className="size-4 text-(--platform-primary-ink)" aria-hidden="true" />
          {t('hero.schedule.title')}
        </span>
        <span className="flex items-center gap-1.5 text-[0.6875rem] font-bold text-(--platform-success-ink)">
          <span className="size-1.5 rounded-full bg-(--platform-success)" aria-hidden="true" />
          {t('hero.schedule.status')}
        </span>
      </div>
      <table className="w-full table-fixed border-collapse text-left text-[0.6875rem]">
        <caption className="sr-only">{t('hero.schedule.caption')}</caption>
        <thead className="text-(--platform-muted-soft)">
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
        <tbody className="border-t border-foreground/8 text-(--platform-ink-soft)">
          <tr>
            <th scope="row" className="px-3 py-2.5 font-semibold text-(--platform-muted-soft)">
              09:00
            </th>
            <td className="border-l border-foreground/8 bg-primary/14 px-2 py-2.5">
              <span className="block font-extrabold">{t('hero.schedule.morning')}</span>
              <span className="text-(--platform-muted-soft)">{t('hero.schedule.confirmed')}</span>
            </td>
            <td className="border-l border-foreground/8 px-2 py-2.5 text-(--platform-muted-soft)">
              {t('hero.schedule.available')}
            </td>
          </tr>
          <tr className="border-t border-foreground/8">
            <th scope="row" className="px-3 py-2.5 font-semibold text-(--platform-muted-soft)">
              14:00
            </th>
            <td className="border-l border-foreground/8 px-2 py-2.5 text-(--platform-muted-soft)">
              {t('hero.schedule.available')}
            </td>
            <td className="border-l border-foreground/8 bg-primary/14 px-2 py-2.5">
              <span className="block font-extrabold">{t('hero.schedule.afternoon')}</span>
              <span className="text-(--platform-muted-soft)">{t('hero.schedule.confirmed')}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </aside>
  );
}
