import { CalendarDays, CircleCheck, Layers3, ReceiptText, Store } from 'lucide-react';
import { NsI18n, useTranslation } from '../../../lib/i18n';

const FLOW_ITEMS = [
  { key: 'incoming', icon: Layers3, tone: 'bg-[#dff7ef] text-[#087a5b]' },
  { key: 'confirmed', icon: CircleCheck, tone: 'bg-[#e8f0ff] text-[#2c5bd3]' },
  { key: 'settled', icon: ReceiptText, tone: 'bg-[#f3f0e8] text-[#735c23]' },
] as const;

export function PlatformProductPreview() {
  const { t } = useTranslation(NsI18n.Platform);

  return (
    <div
      className="platform-console relative mx-auto w-full max-w-150 overflow-hidden rounded-[1.75rem] border border-white/12 bg-[#0a2421] p-3 shadow-[0_32px_90px_rgba(1,20,18,0.34)] sm:p-4"
      aria-label={t('preview.title')}
    >
      <div className="pointer-events-none absolute -right-20 -top-24 size-64 rounded-full bg-[#b9f36b]/12 blur-3xl" />
      <div className="relative overflow-hidden rounded-[1.25rem] border border-white/10 bg-[#f4f7f2] text-[#142522]">
        <div className="flex items-center justify-between border-b border-[#dce5df] bg-white/80 px-4 py-3 backdrop-blur sm:px-5">
          <div className="flex items-center gap-2.5">
            <div className="grid size-8 place-items-center rounded-lg bg-[#0b302b] text-[#c6f477]">
              <Layers3 className="size-4" aria-hidden="true" />
            </div>
            <div>
              <p className="font-mono text-[9px] font-bold tracking-[0.18em] text-[#657570] uppercase">
                {t('preview.eyebrow')}
              </p>
              <p className="text-xs font-bold tracking-[-0.01em] sm:text-sm">BookingOS Control</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-[#cfe1d6] bg-[#f6fff9] px-2.5 py-1.5 text-[10px] font-bold text-[#176849] sm:text-xs">
            <span
              className="platform-status-dot size-1.5 rounded-full bg-[#27a56f]"
              aria-hidden="true"
            />
            {t('preview.status')}
          </div>
        </div>

        <div className="grid gap-3 p-3 sm:grid-cols-[0.72fr_1.28fr] sm:p-4">
          <div className="hidden flex-col gap-2 sm:flex" aria-hidden="true">
            {[
              { icon: Store, label: t('preview.storefront') },
              { icon: CalendarDays, label: t('preview.scheduling') },
              { icon: ReceiptText, label: t('preview.finance') },
            ].map(({ icon: PreviewIcon, label }, index) => {
              return (
                <div
                  key={String(label)}
                  className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-xs font-semibold ${
                    index === 1 ? 'bg-[#0b302b] text-white' : 'text-[#60706b]'
                  }`}
                >
                  <PreviewIcon className="size-4" />
                  {label}
                </div>
              );
            })}
            <div className="mt-auto rounded-xl border border-[#dce5df] bg-white p-3">
              <div className="mb-3 h-1.5 w-16 rounded-full bg-[#dce5df]" />
              <div className="flex h-14 items-end gap-1.5">
                {[35, 54, 42, 75, 62, 88, 70].map((height) => (
                  <span
                    key={height}
                    className="flex-1 rounded-t-sm bg-[#b9f36b]"
                    style={{ height: `${height}%` }}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-[#dce5df] bg-white p-4 sm:p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-mono text-[9px] font-bold tracking-[0.18em] text-[#7b8a85] uppercase">
                  {t('preview.bookingFlow')}
                </p>
                <h2 className="mt-1 max-w-70 text-xl leading-tight font-extrabold tracking-[-0.04em] text-[#0b302b] sm:text-2xl">
                  {t('preview.title')}
                </h2>
              </div>
              <div className="grid size-9 shrink-0 place-items-center rounded-full bg-[#e8f5ee] text-[#176849]">
                <CalendarDays className="size-4" aria-hidden="true" />
              </div>
            </div>

            <div className="mt-5 space-y-2.5">
              {FLOW_ITEMS.map(({ key, icon: Icon, tone }, index) => (
                <div
                  key={key}
                  className="flex items-center gap-3 rounded-xl border border-[#e2e9e4] bg-[#fbfcfb] p-2.5"
                >
                  <div className={`grid size-8 shrink-0 place-items-center rounded-lg ${tone}`}>
                    <Icon className="size-4" aria-hidden="true" />
                  </div>
                  <span className="text-xs font-bold text-[#344640] sm:text-sm">
                    {t(`preview.${key}`)}
                  </span>
                  <div className="ml-auto flex items-center gap-1" aria-hidden="true">
                    {[0, 1, 2].map((bar) => (
                      <span
                        key={bar}
                        className={`h-1.5 rounded-full ${bar <= index ? 'w-4 bg-[#2d8266]' : 'w-2 bg-[#dce5df]'}`}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 rounded-xl bg-[#0b302b] p-3.5 text-white">
              <p className="text-xs font-bold">{t('preview.controlTitle')}</p>
              <p className="mt-1 text-[11px] leading-4 text-[#c7d7d2]">
                {t('preview.controlDescription')}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
