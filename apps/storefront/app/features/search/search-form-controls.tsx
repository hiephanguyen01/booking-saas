import type { PublicListingTypeResponse } from '@booking/contracts';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@booking/ui/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@booking/ui/components/ui/popover';
import { ToggleGroup, ToggleGroupItem } from '@booking/ui/components/ui/toggle-group';
import { cn } from '@booking/ui/lib/utils';
import { Check, ChevronsUpDown, MapPin } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { NsI18n, useTranslation } from '../../lib/i18n';
import { typeIcon } from '../../lib/ui';
import type { SearchMode } from './search-state';
import type { SearchFormVariant } from './search-form-types';
import { useLocationComboboxController } from './use-location-combobox-controller';

type ModeAppearance = 'pills' | 'tabs';
type Translate = ReturnType<typeof useTranslation<typeof NsI18n.Common>>['t'];

export function modeHint(mode: SearchMode, t: Translate): string {
  if (mode === 'hourly') return t('home.bookHourlyHint');
  if (mode === 'inventory') return t('home.inventoryHint');
  return t('home.bookDailyHint');
}

export function LocationCombobox({
  initialValue,
  options,
}: {
  initialValue: string;
  options: { value: string; label: string }[];
}) {
  const { t } = useTranslation(NsI18n.Common);
  const { listId, open, select, selected, setOpen, value } = useLocationComboboxController({
    initialValue,
    options,
  });
  const placeholder = t('home.locationPlaceholder');

  return (
    <>
      <input type="hidden" name="location" value={value} />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-label={placeholder}
            className="flex h-11 w-full min-w-0 items-center gap-2 rounded-md border border-border bg-background px-4 text-left text-foreground shadow-xs hover:bg-accent focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30"
          >
            <MapPin className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span
              className={cn(
                'min-w-0 flex-1 truncate text-sm',
                !selected && 'text-muted-foreground',
              )}
            >
              {selected?.label ?? placeholder}
            </span>
            <ChevronsUpDown
              className="size-4 shrink-0 text-muted-foreground opacity-70"
              aria-hidden="true"
            />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[var(--radix-popover-trigger-width)] max-w-[var(--radix-popover-content-available-width)] p-0"
        >
          <Command>
            <CommandInput placeholder={t('home.searchLocation')} />
            <CommandList id={listId}>
              <CommandEmpty>{t('home.noLocationResults')}</CommandEmpty>
              <CommandGroup>
                <CommandItem
                  value={placeholder}
                  onSelect={() => select('')}
                  className="data-[selected=true]:bg-primary/10 data-[selected=true]:text-primary"
                >
                  <Check
                    className={cn('mr-2 size-4 text-primary', value ? 'opacity-0' : 'opacity-100')}
                  />
                  {placeholder}
                </CommandItem>
                {options.map((option) => {
                  const isSelected = option.value === value;
                  return (
                    <CommandItem
                      key={option.value}
                      value={option.label}
                      onSelect={() => select(option.value)}
                      className={cn(
                        'data-[selected=true]:bg-primary/10 data-[selected=true]:text-primary',
                        isSelected &&
                          'bg-primary text-primary-foreground data-[selected=true]:bg-primary data-[selected=true]:text-primary-foreground',
                      )}
                    >
                      <Check
                        className={cn(
                          'mr-2 size-4',
                          isSelected
                            ? 'text-primary-foreground opacity-100'
                            : 'text-primary opacity-0',
                        )}
                      />
                      <span className="truncate">{option.label}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </>
  );
}

export function CategoryPicker({
  types,
  selectedType,
  onSelectType,
  variant,
}: {
  types: PublicListingTypeResponse[];
  selectedType: string;
  onSelectType: (value: string) => void;
  variant: SearchFormVariant;
}) {
  const { t } = useTranslation(NsI18n.Common);
  const isHero = variant === 'hero';
  return (
    <ToggleGroup
      type="single"
      value={selectedType}
      onValueChange={(value) => value && onSelectType(value)}
      aria-label={t('home.listingTypes')}
      className={cn(
        'w-full overflow-x-auto overscroll-x-contain rounded-none',
        isHero ? 'rounded-t-lg bg-muted shadow-sm' : 'mx-auto max-w-292.5 px-4 pt-5 pb-4 lg:px-0',
      )}
    >
      {types.map((type) => {
        const Icon = typeIcon(type.slug);
        return (
          <ToggleGroupItem
            key={type.id}
            value={type.slug}
            className={cn(
              'font-medium whitespace-nowrap',
              isHero
                ? 'h-14 min-w-40 flex-1 gap-3 rounded-none! px-6 text-base leading-6 text-foreground hover:bg-foreground/5 hover:text-foreground data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-sm! md:min-w-48 md:px-10'
                : 'min-h-11 gap-2 rounded-full! border border-transparent px-4 py-2 text-sm text-background/75 hover:bg-background/10 hover:text-background data-[state=on]:border-background data-[state=on]:bg-transparent data-[state=on]:text-background',
            )}
          >
            <Icon
              className={cn(isHero ? 'size-7 text-foreground md:size-8' : 'size-5')}
              strokeWidth={1.7}
              aria-hidden="true"
            />
            {type.name}
          </ToggleGroupItem>
        );
      })}
    </ToggleGroup>
  );
}

const MODE_ITEM_CLASS: Record<ModeAppearance, string> = {
  pills:
    'h-10 rounded-full border-border px-4 data-[state=on]:border-primary data-[state=on]:bg-primary/10 data-[state=on]:text-primary',
  tabs: 'h-14 rounded-none! border-0 border-b-2 border-transparent bg-transparent data-[state=on]:border-primary data-[state=on]:bg-transparent data-[state=on]:text-primary',
};

export function ModeToggle({
  mode,
  modes,
  onModeChange,
  appearance,
}: {
  mode: SearchMode;
  modes: SearchMode[];
  onModeChange: (mode: SearchMode) => void;
  appearance: ModeAppearance;
}) {
  const { t } = useTranslation(NsI18n.Common);
  const isPills = appearance === 'pills';
  return (
    <ToggleGroup
      type="single"
      value={mode}
      onValueChange={(value) => value && onModeChange(value as SearchMode)}
      variant={isPills ? 'outline' : 'default'}
      spacing={isPills ? 3 : 0}
      className={cn(!isPills && 'mx-auto grid grid-cols-2 px-6')}
      aria-label={t('home.bookingMode')}
    >
      {modes.map((item) => (
        <ToggleGroupItem key={item} value={item} className={MODE_ITEM_CLASS[appearance]}>
          {item === 'hourly' ? t('home.bookHourly') : t('home.bookDaily')}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

/** One bordered box holding an icon + a control: the box IS the form control, so it
 * owns the 44px geometry and the control inside is stripped of its own
 * border/height/padding (`h-auto border-0 p-0` — merged last, so it beats the
 * primitive's own `h-11 px-4`). */
export function SearchField({
  icon: Icon,
  label,
  children,
}: {
  icon: LucideIcon;
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="flex h-11 w-full min-w-0 items-center gap-2 rounded-md border border-border bg-background px-4 text-foreground shadow-xs focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/30">
      <span className="sr-only">{label}</span>
      <Icon className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="min-w-0 flex-1 [&_[data-slot=native-select-wrapper]]:w-full">
        {children}
      </span>
    </label>
  );
}
