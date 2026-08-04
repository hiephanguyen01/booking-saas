import type { AvailabilityResponse, HourlySlot } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import { Calendar } from '@booking/ui/components/ui/calendar';
import { Spinner } from '@booking/ui/components/ui/spinner';
import { Image } from '@booking/ui/components/media/image';
import { cn } from '@booking/ui/lib/utils';
import { AlertCircle, CalendarDays, Check, Clock3, RotateCw } from 'lucide-react';
import type { ReactNode } from 'react';
import { AvailabilitySkeleton } from '~/components/loading-skeletons';
import { NsI18n, useTranslation } from '@booking/i18n';
import type { PublicPackageOption } from '~/lib/package-options';
import type { ScheduledBookingMode } from '~/features/booking-widget/lib/booking-modes';
import { RoomPhotoStrip } from '~/components/room-photo-strip';
import { useBookingDialogStepsController } from '~/features/booking-widget/hooks/use-booking-dialog-steps-controller';

export type RoomBookingDateRange = { from: Date | undefined; to?: Date | undefined };

/**
 * The dialog calendar sizes its day cells to the 44px touch target, but seven of
 * them plus the calendar's own `p-3` need 332px of dialog — more than a phone
 * narrower than ~390px offers, and the seventh column (Saturday) was silently
 * cut off rather than wrapped. Drop the padding and step the cell down until the
 * full week fits, then restore both as soon as there is room for them.
 */
const DIALOG_CALENDAR_FIT =
  'max-w-full p-0 [--cell-size:2.25rem] min-[360px]:[--cell-size:2.5rem] min-[380px]:[--cell-size:2.75rem] min-[400px]:p-3';

interface BookingDialogStepsProps {
  mode: ScheduledBookingMode;
  supportedModes: ScheduledBookingMode[];
  fixedPackages: boolean;
  packageOptions: PublicPackageOption[];
  packageId: string | null;
  selectedPackage: PublicPackageOption | null;
  listingTitle: string;
  listingPhotos: string[];
  date: string | null;
  today: string;
  from: string | null;
  to: string | null;
  availability: AvailabilityResponse | null;
  availabilityPending: boolean;
  availabilityError: boolean;
  requestError: boolean;
  slots: HourlySlot[];
  selectedSlots: HourlySlot[];
  selectionError: string;
  selectionUnavailable: boolean;
  quotePending: boolean;
  quoteError: boolean;
  onSwitchMode: (mode: ScheduledBookingMode) => void;
  onSelectPackage: (packageId: string) => void;
  onSelectDate: (date: string) => void;
  onChangeDate: () => void;
  onToggleSlot: (slot: HourlySlot) => void;
  onSelectRange: (range: RoomBookingDateRange | undefined) => void;
  onRetryHourly: () => void;
  onRetryQuote: () => void;
  onRetryDaily: () => void;
  onOpenPackageMedia?: (index: number, trigger: HTMLButtonElement) => void;
  packageFlow?: boolean;
}

type BookingDialogStepModel = ReturnType<typeof useBookingDialogStepsController>;

export function BookingDialogSteps(props: BookingDialogStepsProps) {
  const { mode, supportedModes, fixedPackages, selectionError, selectionUnavailable } = props;
  const packageFlow = props.packageFlow ?? false;
  const model = useBookingDialogStepsController({ ...props, packageFlow });

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
      <BookingModeSwitch
        mode={mode}
        supportedModes={supportedModes}
        onSwitchMode={props.onSwitchMode}
      />
      <BookingPackageSelector
        visible={fixedPackages && !packageFlow}
        model={model}
        onSelectPackage={props.onSelectPackage}
        onOpenPackageMedia={props.onOpenPackageMedia}
      />

      {mode === 'hourly' ? (
        <HourlyBookingStep {...props} packageFlow={packageFlow} model={model} />
      ) : (
        <DailyBookingStep {...props} model={model} />
      )}

      {!packageFlow && selectionError ? (
        <SelectionAlert className="mt-4">{selectionError}</SelectionAlert>
      ) : null}
      {selectionUnavailable ? (
        <SelectionAlert className={cn(!packageFlow && 'mt-4')}>
          {model.selectionUnavailableMessage}
        </SelectionAlert>
      ) : null}
    </div>
  );
}

function SelectionAlert({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p role="alert" className={cn('flex items-start gap-2 text-sm text-destructive', className)}>
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      {children}
    </p>
  );
}

function BookingModeSwitch({
  mode,
  supportedModes,
  onSwitchMode,
}: {
  mode: ScheduledBookingMode;
  supportedModes: ScheduledBookingMode[];
  onSwitchMode: (mode: ScheduledBookingMode) => void;
}) {
  const { t } = useTranslation(NsI18n.Listing);
  if (supportedModes.length <= 1) return null;

  return (
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
  );
}

function BookingPackageSelector({
  visible,
  model,
  onSelectPackage,
  onOpenPackageMedia,
}: {
  visible: boolean;
  model: BookingDialogStepModel;
  onSelectPackage: (packageId: string) => void;
  onOpenPackageMedia?: (index: number, trigger: HTMLButtonElement) => void;
}) {
  const { t } = useTranslation(NsI18n.Listing);
  if (!visible) return null;

  return (
    <div className="mb-5 space-y-2">
      <h3 className="text-sm font-semibold">{t('packages.selectPackage')}</h3>
      <div className="grid gap-2">
        {model.packageModels.map(({ item, photo, selected, priceLabel }) => {
          const durationLabel =
            item.mode === 'hourly'
              ? t('packages.durationMinutes', { count: item.duration })
              : t('packages.durationDays', { count: item.duration });
          return (
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
                  <Image
                    src={photo}
                    alt=""
                    className="size-12 rounded-md object-cover"
                  />
                ) : null}
                <span className="min-w-0 flex-1">
                  <span className="flex justify-between gap-3 text-sm font-medium">
                    <span>{item.name}</span>
                    <span>{priceLabel}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">{durationLabel}</span>
                </span>
              </span>
            </button>
          );
        })}
      </div>
      {model.selectedPackageGallery && onOpenPackageMedia ? (
        <RoomPhotoStrip
          photos={model.selectedPackageGallery.photos}
          title={model.selectedPackageGallery.title}
          onOpenPhoto={onOpenPackageMedia}
        />
      ) : null}
    </div>
  );
}

type HourlyStepProps = Pick<
  BookingDialogStepsProps,
  | 'date'
  | 'availability'
  | 'availabilityPending'
  | 'availabilityError'
  | 'requestError'
  | 'quotePending'
  | 'quoteError'
  | 'onChangeDate'
  | 'onToggleSlot'
  | 'onRetryHourly'
  | 'onRetryQuote'
> & { packageFlow: boolean; model: BookingDialogStepModel };

type DailyStepProps = Pick<
  BookingDialogStepsProps,
  'availabilityPending' | 'requestError' | 'onSelectRange' | 'onRetryDaily'
> & { model: BookingDialogStepModel };

function HourlyBookingStep({
  date,
  availability,
  availabilityPending,
  availabilityError,
  requestError,
  quotePending,
  quoteError,
  packageFlow,
  model,
  onChangeDate,
  onToggleSlot,
  onRetryHourly,
  onRetryQuote,
}: HourlyStepProps) {
  const { t } = useTranslation([NsI18n.Listing, NsI18n.Common]);
  const titleId = packageFlow ? 'packages-day-step-title' : 'room-day-step-title';
  const loaded = Boolean(availability);
  // The two flows fail differently: the packages page reports the availability
  // request on its own, the room dialog surfaces any failed request in the step.
  const failed = packageFlow ? availabilityError : requestError;

  if (!date) {
    return (
      <section aria-labelledby={titleId}>
        <h3 id={titleId} className="font-semibold">
          {t('pickDay')}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {t(packageFlow ? 'packages.pickDayInstruction' : 'group.pickDayInstruction')}
        </p>
        <Calendar
          fullWidth
          mode="single"
          selected={undefined}
          onSelect={model.selectCalendarDay}
          disabled={{ before: model.todayDate }}
          startMonth={model.todayDate}
          defaultMonth={model.todayDate}
          showOutsideDays={false}
          fixedWeeks
          formatters={model.calendarA11y.formatters}
          labels={model.calendarA11y.labels}
          className={cn('sf-calendar mx-auto mt-3', DIALOG_CALENDAR_FIT)}
        />
      </section>
    );
  }

  const slotTitleId = packageFlow ? 'packages-hourly-step-title' : 'room-hourly-step-title';

  return (
    <section aria-labelledby={slotTitleId} className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 id={slotTitleId} className="font-semibold">
            {t('pickSlot')}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">{model.hourlyDateInstruction}</p>
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

      {availabilityPending && !loaded ? (
        <AvailabilitySkeleton label={t('common:loading')} />
      ) : failed ? (
        <BookingDialogErrorMessage onRetry={onRetryHourly} />
      ) : model.slotModels.length ? (
        <BookingSlotGrid
          slotModels={model.slotModels}
          quotePending={quotePending}
          packageFlow={packageFlow}
          onToggleSlot={onToggleSlot}
        />
      ) : (
        <EmptyAvailability message={t('group.noOpenSlots')} />
      )}

      {packageFlow && quoteError ? <BookingDialogErrorMessage onRetry={onRetryQuote} /> : null}
    </section>
  );
}

function DailyBookingStep({
  availabilityPending,
  requestError,
  model,
  onSelectRange,
  onRetryDaily,
}: DailyStepProps) {
  const { t } = useTranslation(NsI18n.Listing);
  return (
    <section aria-labelledby="room-range-step-title" aria-busy={availabilityPending}>
      <h3 id="room-range-step-title" className="font-semibold">
        {t('selectRange')}
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">{t('group.dailyInstruction')}</p>
      {requestError ? (
        <div className="mt-4">
          <BookingDialogErrorMessage onRetry={onRetryDaily} />
        </div>
      ) : model.dailySoldOut ? (
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
            selected={model.selectedRange}
            onSelect={onSelectRange}
            disabled={model.isRangeDateDisabled}
            startMonth={model.todayDate}
            endMonth={model.dailyEndDate}
            excludeDisabled
            resetOnSelect
            showOutsideDays={false}
            fixedWeeks
            defaultMonth={model.defaultRangeMonth}
            formatters={model.calendarA11y.formatters}
            labels={model.calendarA11y.labels}
            className={cn('sf-calendar mx-auto', DIALOG_CALENDAR_FIT)}
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
  );
}

function EmptyAvailability({ message }: { message: string }) {
  return (
    <p className="rounded-md border border-dashed px-5 py-10 text-center text-sm text-muted-foreground">
      {message}
    </p>
  );
}

function BookingSlotGrid({
  slotModels,
  quotePending,
  packageFlow = false,
  onToggleSlot,
}: {
  slotModels: Array<{
    key: string;
    slot: HourlySlot;
    selected: boolean;
    startLabel: string;
    endLabel: string;
    priceLabel: string | null;
  }>;
  quotePending?: boolean;
  packageFlow?: boolean;
  onToggleSlot: (slot: HourlySlot) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2" aria-busy={packageFlow ? quotePending : undefined}>
      {slotModels.map(({ key, slot, selected, startLabel, endLabel, priceLabel }) => (
        <button
          key={key}
          type="button"
          aria-pressed={selected}
          disabled={!slot.available}
          onClick={() => onToggleSlot(slot)}
          className={cn(
            'min-h-14 rounded-md border px-2 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            packageFlow && 'hover:border-primary hover:bg-primary/10 hover:text-primary',
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
  );
}

function BookingDialogErrorMessage({ onRetry }: { onRetry: () => void }) {
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
