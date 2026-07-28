import { Tabs, TabsList, TabsTrigger } from '@booking/ui/components/ui/tabs';
import { NsI18n, useTranslation } from '~/lib/i18n';
import type { HomeLocationKey } from '~/features/home/lib/home-listing-presentation';

/** Location filter tabs for the home recommendation catalog. */
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
      className="mt-2 min-w-0 gap-0"
    >
      <TabsList
        variant="line"
        className="h-13! w-full justify-start gap-0 overflow-x-auto rounded-none bg-transparent p-0"
      >
        {locations.map((loc) => (
          <TabsTrigger
            key={loc.key}
            value={loc.key}
            className="h-13! flex-none rounded-none border-x-0 border-t-0 border-b-2 border-b-transparent px-10 py-4 text-sm leading-5 font-semibold text-muted-foreground shadow-none after:hidden data-[state=active]:border-b-primary data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:shadow-none"
          >
            {loc.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
