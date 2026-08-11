import { NsI18n, useTranslation } from '@booking/i18n';
import { Tabs, TabsList, TabsTrigger } from '@booking/ui/components/ui/tabs';
import type { HomeLocationKey } from '~/features/home/lib/home-listing-presentation';

/**
 * Location filter tabs for the home recommendation catalog.
 *
 * A scrolling row of underlined labels with a hairline running the width of the
 * section beneath it — the same shape the search card's listing-type tabs use, so
 * the two rows of tabs on this page do not read as two different controls.
 */
export function LocationTabs({
  value,
  onValueChange,
}: {
  value: HomeLocationKey;
  onValueChange: (value: HomeLocationKey) => void;
}) {
  const { t } = useTranslation(NsI18n.Common);
  const locations = [
    { key: 'hcm', label: t('home.locations.hcm') },
    { key: 'hanoi', label: t('home.locations.hanoi') },
    { key: 'danang', label: t('home.locations.danang') },
    { key: 'sapa', label: t('home.locations.sapa') },
    { key: 'dalat', label: t('home.locations.dalat') },
  ];
  return (
    <Tabs
      value={value}
      onValueChange={(next) => onValueChange(next as HomeLocationKey)}
      className="min-w-0 gap-0 border-b border-border"
    >
      <TabsList
        variant="line"
        className="sf-scroll-x h-10! w-full justify-start gap-0 rounded-none bg-transparent p-0 sm:h-13!"
      >
        {locations.map((loc) => (
          <TabsTrigger
            key={loc.key}
            value={loc.key}
            className="h-10! flex-none rounded-none border-x-0 border-t-0 border-b-2 border-b-transparent px-3 py-2 text-xs leading-4 font-medium text-muted-foreground shadow-none after:hidden data-[state=active]:border-b-primary data-[state=active]:bg-transparent data-[state=active]:font-bold data-[state=active]:text-primary data-[state=active]:shadow-none sm:h-13! sm:px-5 sm:text-sm"
          >
            {loc.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
