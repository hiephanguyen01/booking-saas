import { useState } from 'react';
import { Tabs, TabsList, TabsTrigger } from '@booking/ui/components/ui/tabs';
import { useT } from '../../lib/i18n';

/**
 * Static location filter tabs (§ home redesign). Purely visual — there's no
 * location field on listings today, so switching tabs doesn't filter
 * anything. One tab is active by default, matching the Figma design.
 */
export function LocationTabs() {
  const { t } = useT();
  const locations = [
    { key: 'hcm', label: t('home.locations.hcm') },
    { key: 'hanoi', label: t('home.locations.hanoi') },
    { key: 'danang', label: t('home.locations.danang') },
    { key: 'sapa', label: t('home.locations.sapa') },
    { key: 'dalat', label: t('home.locations.dalat') },
  ];
  const [active, setActive] = useState(locations[0].key);

  return (
    <Tabs value={active} onValueChange={setActive}>
      <TabsList
        variant="line"
        className="h-auto w-full justify-start gap-0 overflow-x-auto rounded-none border-b border-border bg-transparent p-0"
      >
        {locations.map((loc) => (
          <TabsTrigger
            key={loc.key}
            value={loc.key}
            className="rounded-none border-b-2 border-transparent px-4 py-3 text-sm font-semibold text-muted-foreground shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:shadow-none dark:data-[state=active]:bg-transparent"
          >
            {loc.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
