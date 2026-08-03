import type {
  CreateListingTypeInput,
  ListingTypeSearchConfig,
  ListingTypeSearchSchedule,
} from '@booking/contracts';
import type { UseFormReturn } from '@booking/ui/components/form/rhf';
import { Label } from '@booking/ui/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@booking/ui/components/ui/select';
import { Switch } from '@booking/ui/components/ui/switch';
import { CalendarRange } from 'lucide-react';
import { SEARCH_SCHEDULE_LABEL } from '~/features/tenant/constants';
import { AttributeFacetEditor } from './attribute-facet-editor';
import { EMPTY_CONFIG, normalizeSearchConfig, SEARCHABLE_MODES } from './listing-type-search-config';
import { SystemFacetEditor } from './system-facet-editor';

type SearchableSchedule = Exclude<ListingTypeSearchSchedule, 'none'>;

/** The "Tìm kiếm & bộ lọc Storefront" block of the listing-type form. */
export function ListingTypeSearchConfigFields({
  form,
}: {
  form: UseFormReturn<CreateListingTypeInput>;
}) {
  const config = form.watch('searchConfig') ?? EMPTY_CONFIG;
  const allowedModes = form.watch('allowedModes') ?? [];
  const attributes = form.watch('attributeSchema') ?? [];
  const filterable = attributes.filter((field) => field.filterable && field.key);
  const configError = form.formState.errors.searchConfig;

  const updateConfig = (next: ListingTypeSearchConfig): void => {
    form.setValue('searchConfig', normalizeSearchConfig(next, attributes, allowedModes), {
      shouldDirty: true,
      shouldValidate: true,
    });
  };

  const scheduleOptions: ListingTypeSearchSchedule[] = [
    'none',
    ...allowedModes.filter((mode): mode is SearchableSchedule => SEARCHABLE_MODES.has(mode)),
  ];

  return (
    <div className="space-y-5">
      {configError?.message ? (
        <p className="text-sm text-destructive">{String(configError.message)}</p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3 rounded-lg border bg-background p-4">
          <div className="flex items-center gap-2">
            <CalendarRange className="size-4 text-muted-foreground" aria-hidden />
            <Label htmlFor="search-schedule">Lịch tìm kiếm</Label>
          </div>
          <Select
            value={config.schedule}
            onValueChange={(value) =>
              updateConfig({ ...config, schedule: value as ListingTypeSearchSchedule })
            }
          >
            <SelectTrigger id="search-schedule" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {scheduleOptions.map((schedule) => (
                <SelectItem key={schedule} value={schedule}>
                  {SEARCH_SCHEDULE_LABEL[schedule]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Chỉ các hình thức đặt đã bật mới có thể dùng làm lịch tìm kiếm.
          </p>
        </div>

        <div className="flex items-center justify-between gap-4 rounded-lg border bg-background p-4">
          <div>
            <Label htmlFor="show-guests">Lọc theo số khách</Label>
            <p className="mt-1 text-xs text-muted-foreground">
              So sánh số khách với sức chứa của từng tin đăng.
            </p>
          </div>
          <Switch
            id="show-guests"
            checked={config.showGuests}
            onCheckedChange={(checked) => updateConfig({ ...config, showGuests: checked })}
          />
        </div>
      </div>

      <SystemFacetEditor config={config} updateConfig={updateConfig} />
      <AttributeFacetEditor config={config} fields={filterable} updateConfig={updateConfig} />
    </div>
  );
}
