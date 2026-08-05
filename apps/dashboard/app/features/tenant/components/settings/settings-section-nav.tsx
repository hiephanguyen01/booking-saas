import { TabsList, TabsTrigger } from '@booking/ui/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@booking/ui/components/ui/select';
import type { LucideIcon } from 'lucide-react';

export interface SettingsSection {
  value: string;
  label: string;
  icon: LucideIcon;
}

/**
 * Section switcher for the tenant settings page.
 *
 * Seven sections do not fit one horizontal strip: stretched across a desktop the
 * triggers read as thin and unrelated, and below `lg` only the first three stayed
 * visible behind a scroll with no affordance that the rest existed. So the rail is
 * vertical from `lg` (the convention for a settings surface with this many groups)
 * and collapses to a plain select below it, where every section is one tap away.
 *
 * Both render the same `Tabs` value, so the page keeps one route and one loader.
 */
export function SettingsSectionNav({
  sections,
  value,
  onChange,
}: {
  sections: SettingsSection[];
  value: string;
  onChange: (value: string) => void;
}) {
  const active = sections.find((section) => section.value === value);

  return (
    <>
      <div className="lg:hidden">
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger
            id="settings-section"
            className="w-full font-medium"
            aria-label="Nhóm cài đặt"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {sections.map((section) => (
              <SelectItem key={section.value} value={section.value}>
                {section.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {active ? <span className="sr-only">Đang xem nhóm {active.label}</span> : null}
      </div>

      <TabsList
        aria-label="Nhóm cài đặt"
        className="sticky top-20 hidden h-auto w-full flex-col items-stretch gap-0.5 rounded-xl border bg-card p-1.5 shadow-xs lg:flex"
      >
        {sections.map((section) => {
          const Icon = section.icon;
          return (
            <TabsTrigger
              key={section.value}
              value={section.value}
              className="group relative min-h-11 w-full justify-start gap-2.5 rounded-lg px-3 py-2 text-left font-medium text-muted-foreground shadow-none hover:bg-muted/60 hover:text-foreground data-[state=active]:bg-muted data-[state=active]:font-semibold data-[state=active]:text-foreground data-[state=active]:shadow-none dark:data-[state=active]:bg-muted/70"
            >
              {/* The accent bar carries the active state; the label stays plain
                  foreground so the rail never competes with the page content. */}
              <span
                aria-hidden="true"
                className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-primary opacity-0 transition-opacity group-data-[state=active]:opacity-100"
              />
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              {section.label}
            </TabsTrigger>
          );
        })}
      </TabsList>
    </>
  );
}
