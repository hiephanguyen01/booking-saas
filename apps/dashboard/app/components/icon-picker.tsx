import type { ListingTypeIcon as ListingTypeIconName } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@booking/ui/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@booking/ui/components/ui/popover';
import { cn } from '@booking/ui/lib/utils';
import { ChevronsUpDown, X } from 'lucide-react';
import { useState } from 'react';
import { ICON_LABEL, ICON_OPTIONS } from '~/constants/icons';
import { ListingTypeIcon } from './listing-type-icon';

/**
 * A searchable popover grid over the `LISTING_TYPE_ICONS` allowlist. Serves both
 * the listing type's own `icon` and each custom attribute's `icon`; the value is a
 * lucide icon NAME (never a URL), so it renders theme-aware via {@link ListingTypeIcon}.
 * Search matches the Vietnamese label (`ICON_LABEL`) and the lucide name.
 */
export function IconPicker({
  value,
  onChange,
  ariaLabel = 'Chọn biểu tượng',
  className,
  compact = false,
  clearable = true,
}: {
  value?: ListingTypeIconName | null;
  onChange: (icon: ListingTypeIconName | undefined) => void;
  ariaLabel?: string;
  className?: string;
  compact?: boolean;
  clearable?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-label={ariaLabel}
            size={compact ? 'icon' : 'default'}
            className={cn(compact ? 'shrink-0' : 'justify-start gap-2')}
          >
            <span className="flex size-5 items-center justify-center text-muted-foreground">
              {value ? <ListingTypeIcon name={value} className="size-4" /> : null}
            </span>
            {compact ? null : (
              <>
                <span className="truncate">{value ? ICON_LABEL[value] : 'Chọn biểu tượng'}</span>
                <ChevronsUpDown className="ml-auto size-4 shrink-0 opacity-50" />
              </>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-0" align="start">
          <Command>
            <CommandInput placeholder="Tìm biểu tượng…" />
            <CommandList>
              <CommandEmpty>Không tìm thấy biểu tượng</CommandEmpty>
              <CommandGroup>
                {ICON_OPTIONS.map((option) => (
                  <CommandItem
                    key={option.name}
                    value={`${option.label} ${option.name}`}
                    onSelect={() => {
                      onChange(option.name);
                      setOpen(false);
                    }}
                    className="gap-2"
                  >
                    <ListingTypeIcon name={option.name} className="size-4" />
                    <span className="truncate">{option.label}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {value && clearable ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => onChange(undefined)}
          aria-label="Bỏ biểu tượng"
        >
          <X className="size-4" />
        </Button>
      ) : null}
    </div>
  );
}
