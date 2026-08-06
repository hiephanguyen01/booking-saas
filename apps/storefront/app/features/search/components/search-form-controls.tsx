import type { PublicListingTypeResponse } from '@booking/contracts';
import { NsI18n, useTranslation } from '@booking/i18n';
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
import type { LucideIcon } from 'lucide-react';
import { Check, ChevronsUpDown, MapPin } from 'lucide-react';
import type { ReactNode } from 'react';
import { ListingTypeGlyph } from '~/components/listing-type-glyph';
import { useLocationComboboxController } from '~/features/search/hooks/use-location-combobox-controller';
import type { SearchFormVariant } from '~/features/search/lib/search-form-types';
import type { SearchMode } from '~/features/search/lib/search-state';

type ModeAppearance = 'pills' | 'tabs';

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
        'w-full overscroll-x-contain rounded-none',
        isHero
          ? 'grid grid-cols-3 gap-1 rounded-t-lg bg-muted p-2 shadow-sm sm:flex sm:gap-0 sm:overflow-x-auto sm:p-0'
          : 'mx-auto max-w-292.5 overflow-x-auto px-4 pt-5 pb-4 lg:px-0',
      )}
    >
      {types.map((type) => {
        const iconClass = cn(isHero ? 'size-6 sm:size-7 md:size-8' : 'size-5');
        return (
          <ToggleGroupItem
            key={type.id}
            value={type.slug}
            className={cn(
              'font-medium',
              isHero
                ? 'h-auto min-h-18 flex-col gap-1.5 rounded-lg! px-1 py-2.5 text-[0.6875rem] leading-tight whitespace-normal text-muted-foreground hover:bg-foreground/5 data-[state=on]:bg-primary/10 data-[state=on]:text-primary data-[state=on]:shadow-none! sm:h-14 sm:min-h-0 sm:min-w-40 sm:flex-1 sm:flex-row sm:gap-3 sm:rounded-none! sm:px-6 sm:text-base sm:leading-6 sm:whitespace-nowrap sm:text-foreground sm:hover:text-foreground sm:data-[state=on]:bg-card sm:data-[state=on]:text-foreground sm:data-[state=on]:shadow-sm! md:min-w-48 md:px-10'
                : 'min-h-11 gap-2 rounded-full! border border-transparent px-4 py-2 text-sm whitespace-nowrap text-background/75 hover:bg-background/10 hover:text-background data-[state=on]:border-background data-[state=on]:bg-transparent data-[state=on]:text-background',
            )}
          >
            {/* The tile inherits its colour from the selected state, so the glyph
                must not pin `text-foreground` on mobile the way the desktop row
                does. */}
            <ListingTypeGlyph
              type={type}
              className={cn(iconClass, isHero && 'sm:text-foreground')}
            />
            <span className="line-clamp-2 sm:line-clamp-none">{type.name}</span>
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
      // The two pills sit side by side at ~270px, wider than the hero card on a
      // 320px screen — let them wrap instead of pushing out of the card.
      className={cn(isPills ? 'max-w-full flex-wrap' : 'mx-auto grid grid-cols-2 px-6')}
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

/** One bordered box holding an icon + a control: the box IS the form control.
 * Nested inputs shed their border/height/padding; a composed Select keeps the
 * shared 44px trigger geometry but sheds its inner border, padding and shadow. */
export function SearchField({
  icon: Icon,
  label,
  children,
  asLabel = true,
}: {
  icon: LucideIcon;
  label: string;
  children: ReactNode;
  asLabel?: boolean;
}) {
  const content = (
    <>
      <span className="sr-only">{label}</span>
      <Icon className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="min-w-0 flex-1 [&_[data-slot=select-trigger]]:w-full">{children}</span>
    </>
  );
  const className =
    'flex h-11 w-full min-w-0 items-center gap-2 rounded-md border border-border bg-background px-4 text-foreground shadow-xs focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/30';

  return asLabel ? (
    <label className={className}>{content}</label>
  ) : (
    <div className={className}>{content}</div>
  );
}
