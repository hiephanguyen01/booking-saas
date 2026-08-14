import type { PublicListingTypeResponse } from '@booking/contracts';
import { NsI18n, useTranslation } from '@booking/i18n';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@booking/ui/components/ui/drawer';
import { CalendarDays, ChevronRight, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router';
import { storefrontPaths } from '~/constants/paths';
import { SearchForm, type LocationOption } from '~/features/search/components/search-form';
import { useLocale } from '~/hooks/use-locale';
import type { ListingGroupState } from '~/features/listing-group/lib/listing-group-types';
import { SURFACE_FRAME } from '~/constants/surfaces';
import { cn } from '@booking/ui/lib/utils';
import { formatSearchScheduleSummary } from '~/features/search/lib/search-schedule-summary';

export function ListingGroupSearchDrawer({
  groupSlug,
  listingTypes,
  currentType,
  state,
  locations,
}: {
  groupSlug: string;
  listingTypes: PublicListingTypeResponse[];
  currentType: string;
  state: ListingGroupState;
  locations: LocationOption[];
}) {
  const { t } = useTranslation([NsI18n.Listing, NsI18n.Common]);
  const locale = useLocale();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [location.search]);

  const schedule = formatSearchScheduleSummary(state, locale, {
    chooseSchedule: t('group.chooseSchedule'),
    pickHours: t('group.pickHours'),
    hourly: t('modeHourly'),
    daily: t('modeDaily'),
    inventory: t('modeInventory'),
  });
  const guests = t('common:home.guestsCount', { count: state.guests });
  const accessibleLabel = `${t('group.searchDrawerTitle')}: ${schedule.primary}, ${schedule.secondary}, ${guests}`;

  return (
    <section className="bg-muted/30  p-0 md:hidden">
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerTrigger asChild>
          <button
            type="button"
            aria-label={accessibleLabel}
            className={cn(
              SURFACE_FRAME,
              'grid min-h-17 w-full grid-cols-[minmax(0,1fr)_auto] items-stretch bg-card p-(--sf-surface-pad) text-left text-card-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            )}
          >
            <span className="flex min-w-0 items-center gap-3 pr-2 min-[360px]:pr-3">
              <span className="hidden size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary min-[360px]:grid">
                <CalendarDays className="size-4.5" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm leading-5 font-semibold">
                  {schedule.primary}
                </span>
                <span className="mt-0.5 block truncate text-xs leading-4 text-muted-foreground">
                  {schedule.secondary}
                </span>
              </span>
            </span>
            <span className="flex min-w-0 items-center gap-2 border-l border-border pl-2 min-[360px]:pl-3">
              <Users className="size-4 shrink-0 text-primary" aria-hidden="true" />
              <span className="min-w-0">
                <span className="block whitespace-nowrap text-sm leading-5 font-semibold">
                  {guests}
                </span>
                <span className="mt-0.5 block text-xs leading-4 text-muted-foreground">
                  {t('group.capacity')}
                </span>
              </span>
              <ChevronRight
                className="hidden size-4 shrink-0 text-muted-foreground min-[360px]:block"
                aria-hidden="true"
              />
            </span>
          </button>
        </DrawerTrigger>
        <DrawerContent className="max-h-[92dvh]">
          <DrawerHeader className="text-left">
            <DrawerTitle>{t('group.searchDrawerTitle')}</DrawerTitle>
            <DrawerDescription>{t('group.searchDrawerDescription')}</DrawerDescription>
          </DrawerHeader>
          <div className="overflow-y-auto">
            <SearchForm
              key={`${currentType}:${location.search}`}
              listingTypes={listingTypes}
              currentType={currentType}
              initialState={state}
              locations={locations}
              variant="mobile-sheet"
              fieldScope="schedule-guests"
              submitAction={storefrontPaths.listingGroup(locale, groupSlug)}
              onSubmit={() => window.setTimeout(() => setOpen(false), 0)}
            />
          </div>
        </DrawerContent>
      </Drawer>
    </section>
  );
}
