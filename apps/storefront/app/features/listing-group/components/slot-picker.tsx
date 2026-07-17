import type { HourlySlot } from '@booking/contracts';
import { Badge } from '@booking/ui/components/ui/badge';
import { Button } from '@booking/ui/components/ui/button';
import { Checkbox } from '@booking/ui/components/ui/checkbox';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@booking/ui/components/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@booking/ui/components/ui/dialog';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@booking/ui/components/ui/drawer';
import { cn } from '@booking/ui/lib/utils';
import { CalendarDays, ChevronDown, Clock3, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { PendingLink } from '../../../components/pending-link';
import { NsI18n, useTranslation } from '../../../lib/i18n';
import { DEFAULT_TZ, dateLabelInTz, timeInTz } from '../../../lib/time';
import { formatVnd } from '../../../lib/ui';
import { useLocale } from '../../../lib/use-locale';
import type { RoomOption } from '../listing-group-types';
import { checkoutHref, slotInterval, toggleContiguousSlot } from '../listing-group-utils';

/** The hour picker: a dialog on desktop, a drawer on touch widths. */
export function SlotPicker({
  option,
  slots,
  date,
}: {
  option: RoomOption;
  slots: HourlySlot[];
  date: string;
}) {
  const { t } = useTranslation(NsI18n.Listing);
  const [desktopOpen, setDesktopOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const trigger = (
    <Button className="w-full">
      <Clock3 /> {t('group.pickHours')}
    </Button>
  );

  return (
    <>
      <div className="hidden lg:block">
        <Dialog open={desktopOpen} onOpenChange={setDesktopOpen}>
          <DialogTrigger asChild>{trigger}</DialogTrigger>
          <DialogContent className="gap-0 p-0 sm:max-w-107.5">
            <DialogHeader className="border-b p-5 pr-12">
              <DialogTitle className="text-xl">{t('group.pickHours')}</DialogTitle>
              <DialogDescription>{option.child.title}</DialogDescription>
            </DialogHeader>
            <SlotPickerContent option={option} slots={slots} date={date} />
          </DialogContent>
        </Dialog>
      </div>
      <div className="lg:hidden">
        <Drawer open={mobileOpen} onOpenChange={setMobileOpen}>
          <DrawerTrigger asChild>{trigger}</DrawerTrigger>
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle className="text-lg">{t('group.pickHours')}</DrawerTitle>
              <DrawerDescription>{option.child.title}</DrawerDescription>
            </DrawerHeader>
            <div className="max-h-[70vh] overflow-auto">
              <SlotPickerContent option={option} slots={slots} date={date} />
            </div>
          </DrawerContent>
        </Drawer>
      </div>
    </>
  );
}

function SlotPickerContent({
  option,
  slots,
  date,
}: {
  option: RoomOption;
  slots: HourlySlot[];
  date: string;
}) {
  const { t } = useTranslation(NsI18n.Listing);
  const locale = useLocale();
  const [selected, setSelected] = useState<HourlySlot[]>([]);
  const [useRequestedInterval, setUseRequestedInterval] = useState(
    Boolean(option.start && option.end),
  );
  const [expanded, setExpanded] = useState(false);
  const [selectionError, setSelectionError] = useState('');
  const timezone = option.availability?.timezone ?? DEFAULT_TZ;
  const interval =
    useRequestedInterval && option.start && option.end
      ? { start: option.start, end: option.end }
      : slotInterval(selected);

  function toggle(slot: HourlySlot): void {
    if (!slot.available) return;
    setUseRequestedInterval(false);
    const result = toggleContiguousSlot(selected, slot);
    setSelected(result.slots);
    setSelectionError(result.changed ? '' : t('group.contiguousOnly'));
  }

  const bookingHref = interval
    ? checkoutHref({
        locale,
        listingSlug: option.child.slug,
        mode: 'hourly',
        start: interval.start,
        end: interval.end,
      })
    : null;

  return (
    <div className="flex flex-col gap-4 p-5">
      <div className="flex items-center gap-3 rounded-md bg-muted/60 px-4 py-3 text-sm">
        <CalendarDays className="size-5 text-primary" aria-hidden="true" />
        <span>{dateLabelInTz(`${date}T00:00:00.000Z`, timezone, locale)}</span>
      </div>

      <Collapsible open={expanded} onOpenChange={setExpanded}>
        <CollapsibleTrigger className="flex h-11 w-full items-center justify-between rounded-md border px-4 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span>
            {selected.length ? t('group.slotsChosen', { count: selected.length }) : t('pickSlot')}
          </span>
          <ChevronDown
            className={cn('size-4 transition-transform', expanded && 'rotate-180')}
            aria-hidden="true"
          />
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2 overflow-hidden rounded-md border">
          <div className="max-h-65 overflow-y-auto p-2">
            {slots.length ? (
              slots.map((slot) => (
                <SlotRow
                  key={`${slot.startUtc}:${slot.endUtc}`}
                  id={slotFieldId(option.child.id, slot.startUtc)}
                  checked={selected.some((item) => item.startUtc === slot.startUtc)}
                  disabled={!slot.available}
                  onToggle={() => toggle(slot)}
                >
                  <span className="flex-1 text-sm">
                    {timeInTz(slot.startUtc, timezone)} - {timeInTz(slot.endUtc, timezone)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {slot.available ? formatVnd(slot.price) : t('group.unavailableSlot')}
                  </span>
                </SlotRow>
              ))
            ) : (
              <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                {t('group.noOpenSlots')}
              </p>
            )}
          </div>
          <div className="flex items-center justify-between border-t p-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setSelected([]);
                setUseRequestedInterval(false);
                setSelectionError('');
              }}
            >
              {t('group.clearAll')}
            </Button>
            <Button type="button" size="sm" onClick={() => setExpanded(false)}>
              {t('group.select')}
            </Button>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {selectionError ? (
        <p role="alert" className="text-xs text-destructive">
          {selectionError}
        </p>
      ) : null}
      {useRequestedInterval && option.start && option.end ? (
        <Badge variant="secondary" className="gap-1.5 rounded-md py-1.5">
          {t('group.requestedTime')}: {timeInTz(option.start, timezone)} -{' '}
          {timeInTz(option.end, timezone)}
        </Badge>
      ) : selected.length ? (
        <div className="flex flex-wrap gap-2">
          {selected.map((slot) => (
            <Badge key={slot.startUtc} variant="secondary" className="gap-1.5 rounded-md py-1.5">
              {timeInTz(slot.startUtc, timezone)} - {timeInTz(slot.endUtc, timezone)}
              <button
                type="button"
                onClick={() => toggle(slot)}
                className="grid size-6 place-items-center rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={t('group.removeSlot', { time: timeInTz(slot.startUtc, timezone) })}
              >
                <X className="size-3.5" />
              </button>
            </Badge>
          ))}
        </div>
      ) : null}
      {bookingHref ? (
        <PendingLink to={bookingHref} className="mt-1 w-full" pendingLabel={t('group.navigating')}>
          {t('bookNow')}
        </PendingLink>
      ) : (
        <Button disabled className="mt-1 w-full">
          <span>{t('bookNow')}</span>
        </Button>
      )}
    </div>
  );
}

function SlotRow({
  id,
  checked,
  disabled,
  onToggle,
  children,
}: {
  id: string;
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <label
      htmlFor={id}
      className={cn(
        'flex min-h-11 items-center gap-3 rounded-md px-3 py-2.5',
        disabled
          ? 'cursor-not-allowed bg-muted/40 text-muted-foreground opacity-60'
          : 'cursor-pointer hover:bg-muted',
      )}
    >
      <Checkbox id={id} checked={checked} disabled={disabled} onCheckedChange={onToggle} />
      {children}
    </label>
  );
}

function slotFieldId(roomId: string, startUtc: string): string {
  return `slot-${roomId}-${startUtc}`.replace(/[^a-zA-Z0-9-_]/g, '-');
}
