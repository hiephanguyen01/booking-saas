import type { AvailabilityResponse, HourlySlot } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import { Calendar } from '@booking/ui/components/ui/calendar';
import { Spinner } from '@booking/ui/components/ui/spinner';
import { cn } from '@booking/ui/lib/utils';
import { AlertCircle, CalendarDays, Check, Clock3, RotateCw } from 'lucide-react';
import { AvailabilitySkeleton } from '../../../components/loading-skeletons';
import { NsI18n, useTranslation } from '../../../lib/i18n';
import type { PublicPackageOption } from '../../../lib/package-options';
import { RoomPhotoStrip } from './room-photo-strip';
import { useRoomBookingDialogStepsController } from './use-room-booking-dialog-steps-controller';

export type ListingBookingMode = 'hourly' | 'daily';
export type RoomBookingDateRange = { from: Date | undefined; to?: Date | undefined };

export function RoomBookingDialogSteps({
  mode,
  supportedModes,
  fixedPackages,
  packageOptions,
  packageId,
  selectedPackage,
  listingTitle,
  listingPhotos,
  date,
  from,
  to,
  availability,
  availabilityPending,
  requestError,
  slots,
  selectedSlots,
  selectionError,
  selectionUnavailable,
  onSwitchMode,
  onSelectPackage,
  onSelectDate,
  onChangeDate,
  onToggleSlot,
  onSelectRange,
  onRetryHourly,
  onRetryDaily,
  onOpenPackageMedia,
}: {
  mode: ListingBookingMode;
  supportedModes: ListingBookingMode[];
  fixedPackages: boolean;
  packageOptions: PublicPackageOption[];
  packageId: string | null;
  selectedPackage: PublicPackageOption | null;
  listingTitle: string;
  listingPhotos: string[];
  date: string | null;
  from: string | null;
  to: string | null;
  availability: AvailabilityResponse | null;
  availabilityPending: boolean;
  requestError: boolean;
  slots: HourlySlot[];
  selectedSlots: HourlySlot[];
  selectionError: string;
  selectionUnavailable: boolean;
  onSwitchMode: (mode: ListingBookingMode) => void;
  onSelectPackage: (packageId: string) => void;
  onSelectDate: (date: string) => void;
  onChangeDate: () => void;
  onToggleSlot: (slot: HourlySlot) => void;
  onSelectRange: (range: RoomBookingDateRange | undefined) => void;
  onRetryHourly: () => void;
  onRetryDaily: () => void;
  onOpenPackageMedia: (index: number, trigger: HTMLButtonElement) => void;
}) {
  const { t } = useTranslation([NsI18n.Listing, NsI18n.Common]);
  const {
    calendarA11y,
    dailyEndDate,
    dailySoldOut,
    defaultRangeMonth,
    hourlyDateInstruction,
    isRangeDateDisabled,
    packageModels,
    selectCalendarDay,
    selectedPackageGallery,
    selectedRange,
    selectionUnavailableMessage,
    slotModels,
    todayDate,
  } = useRoomBookingDialogStepsController({
    mode,
    packageOptions,
    packageId,
    selectedPackage,
    listingTitle,
    listingPhotos,
    date,
    from,
    to,
    availability,
    availabilityPending,
    slots,
    selectedSlots,
    onSelectDate,
  });

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
      {supportedModes.length > 1 ? (
        <div
          role="group"
          aria-label={t('mode')}
          className="mb-5 grid grid-cols-2 gap-1 rounded-lg bg-muted/70 p-1"
        >
          {supportedModes.map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={item === mode}
              onClick={() => onSwitchMode(item)}
              className={cn(
                'min-h-11 rounded-md px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                item === mode ? 'bg-card shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {item === 'hourly' ? t('modeHourly') : t('modeDaily')}
            </button>
          ))}
        </div>
      ) : null}

      {fixedPackages ? (
        <div className="mb-5 space-y-2">
          <h3 className="text-sm font-semibold">Chọn gói dịch vụ</h3>
          <div className="grid gap-2">
            {packageModels.map(({ item, photo, selected, priceLabel }) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectPackage(item.id)}
                className={cn(
                  'rounded-lg border p-3 text-left',
                  selected && 'border-primary bg-primary/5',
                )}
              >
                <span className="flex items-center gap-3">
                  {photo ? (
                    <img src={photo} alt="" className="size-12 rounded-md object-cover" />
                  ) : null}
                  <span className="min-w-0 flex-1">
                    <span className="flex justify-between gap-3 text-sm font-medium">
                      <span>{item.name}</span>
                      <span>{priceLabel}</span>
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {item.duration} {item.durationLabel}
                    </span>
                  </span>
                </span>
              </button>
            ))}
          </div>
          {selectedPackageGallery ? (
            <RoomPhotoStrip
              photos={selectedPackageGallery.photos}
              title={selectedPackageGallery.title}
              onOpenPhoto={onOpenPackageMedia}
            />
          ) : null}
        </div>
      ) : null}

      {mode === 'hourly' ? (
        date ? (
          <section aria-labelledby="room-hourly-step-title" className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 id="room-hourly-step-title" className="font-semibold">
                  {t('pickSlot')}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">{hourlyDateInstruction}</p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-11"
                onClick={onChangeDate}
              >
                <CalendarDays aria-hidden="true" /> {t('group.changeDay')}
              </Button>
            </div>

            {availabilityPending && !availability ? (
              <AvailabilitySkeleton label={t('common:loading')} />
            ) : requestError ? (
              <RoomBookingErrorMessage onRetry={onRetryHourly} />
            ) : slotModels.length ? (
              <div className="grid grid-cols-2 gap-2">
                {slotModels.map(({ key, slot, selected, startLabel, endLabel, priceLabel }) => (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={selected}
                    disabled={!slot.available}
                    onClick={() => onToggleSlot(slot)}
                    className={cn(
                      'min-h-14 rounded-md border px-2 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      selected && 'border-primary bg-primary/10 text-primary',
                      !slot.available && 'cursor-not-allowed bg-muted opacity-60',
                    )}
                  >
                    <span className="flex items-center justify-center gap-1 font-medium">
                      {selected ? (
                        <Check className="size-3.5" aria-hidden="true" />
                      ) : (
                        <Clock3 className="size-3.5" aria-hidden="true" />
                      )}
                      {startLabel}–{endLabel}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">{priceLabel}</span>
                  </button>
                ))}
              </div>
            ) : (
              <EmptyAvailability message={t('group.noOpenSlots')} />
            )}
          </section>
        ) : (
          <section aria-labelledby="room-day-step-title">
            <h3 id="room-day-step-title" className="font-semibold">
              {t('pickDay')}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">{t('group.pickDayInstruction')}</p>
            <Calendar
              fullWidth
              mode="single"
              selected={undefined}
              onSelect={selectCalendarDay}
              disabled={{ before: todayDate }}
              startMonth={todayDate}
              defaultMonth={todayDate}
              showOutsideDays={false}
              fixedWeeks
              formatters={calendarA11y.formatters}
              labels={calendarA11y.labels}
              className="sf-calendar mx-auto mt-3 [--cell-size:2.75rem]"
            />
          </section>
        )
      ) : (
        <section aria-labelledby="room-range-step-title" aria-busy={availabilityPending}>
          <h3 id="room-range-step-title" className="font-semibold">
            {t('selectRange')}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">{t('group.dailyInstruction')}</p>
          {requestError ? (
            <div className="mt-4">
              <RoomBookingErrorMessage onRetry={onRetryDaily} />
            </div>
          ) : dailySoldOut ? (
            <div className="mt-4">
              <EmptyAvailability message={t('group.soldOut')} />
            </div>
          ) : (
            <div className="relative mt-3">
              <Calendar
                fullWidth
                connectedRange
                mode="range"
                numberOfMonths={1}
                selected={selectedRange}
                onSelect={onSelectRange}
                disabled={isRangeDateDisabled}
                startMonth={todayDate}
                endMonth={dailyEndDate}
                excludeDisabled
                resetOnSelect
                showOutsideDays={false}
                fixedWeeks
                defaultMonth={defaultRangeMonth}
                formatters={calendarA11y.formatters}
                labels={calendarA11y.labels}
                className="sf-calendar mx-auto [--cell-size:2.75rem]"
              />
              {availabilityPending ? (
                <div
                  className="absolute inset-0 grid place-items-center rounded-lg bg-background/75"
                  role="status"
                  aria-live="polite"
                >
                  <span className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Spinner aria-hidden="true" /> {t('group.loadingAvailability')}
                  </span>
                </div>
              ) : null}
            </div>
          )}
        </section>
      )}

      {selectionError ? (
        <p role="alert" className="mt-4 flex items-start gap-2 text-sm text-destructive">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {selectionError}
        </p>
      ) : null}
      {selectionUnavailable ? (
        <p role="alert" className="mt-4 flex items-start gap-2 text-sm text-destructive">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {selectionUnavailableMessage}
        </p>
      ) : null}
    </div>
  );
}

function EmptyAvailability({ message }: { message: string }) {
  return (
    <p className="rounded-md border border-dashed px-5 py-10 text-center text-sm text-muted-foreground">
      {message}
    </p>
  );
}

function RoomBookingErrorMessage({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation(NsI18n.Listing);
  return (
    <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-4">
      <p className="flex items-start gap-2 text-sm text-destructive">
        <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        {t('group.availabilityError')}
      </p>
      <Button type="button" variant="outline" size="sm" className="mt-3 min-h-11" onClick={onRetry}>
        <RotateCw aria-hidden="true" /> {t('group.retry')}
      </Button>
    </div>
  );
}
