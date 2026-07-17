import {
  listingTypeSearchConfigSchema,
  type AttributeField,
  type BookingMode,
  type CreateListingTypeInput,
  type ListingTypeSearchAttributeFacet,
  type ListingTypeSearchConfig,
  type ListingTypeSearchFacetControl,
  type ListingTypeSearchSchedule,
  type ListingTypeSearchBucket,
} from '@booking/contracts';
import type { UseFormReturn } from '@booking/ui/components/form/rhf';
import { Badge } from '@booking/ui/components/ui/badge';
import { Button } from '@booking/ui/components/ui/button';
import { Checkbox } from '@booking/ui/components/ui/checkbox';
import { Input } from '@booking/ui/components/ui/input';
import { Label } from '@booking/ui/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@booking/ui/components/ui/select';
import { Switch } from '@booking/ui/components/ui/switch';
import { ArrowDown, ArrowUp, CalendarRange, Plus, SlidersHorizontal, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';

const EMPTY_CONFIG = listingTypeSearchConfigSchema.parse({});
const SEARCHABLE_MODES = new Set<BookingMode>(['hourly', 'daily', 'inventory']);
const SYSTEM_FACETS = [
  { value: 'price', label: 'Khoảng giá' },
  { value: 'location', label: 'Khu vực' },
  { value: 'amenities', label: 'Tiện ích' },
] as const;

type SystemFacet = ListingTypeSearchConfig['systemFacets'][number];
type SearchableSchedule = Exclude<ListingTypeSearchSchedule, 'none'>;

const SCHEDULE_LABEL: Record<ListingTypeSearchSchedule, string> = {
  none: 'Không dùng lịch',
  hourly: 'Theo ngày',
  daily: 'Theo khoảng ngày',
  inventory: 'Theo khoảng thuê kho',
};

const TYPE_LABEL: Record<AttributeField['type'], string> = {
  boolean: 'Có / Không',
  select: 'Chọn một',
  multiselect: 'Chọn nhiều',
  number: 'Số',
  text: 'Văn bản',
};

const CONTROL_LABEL: Record<ListingTypeSearchFacetControl, string> = {
  checkbox: 'Checkbox',
  radio: 'Radio',
  range: 'Khoảng min / max',
  buckets: 'Các khoảng định sẵn',
};

function controlsFor(type: AttributeField['type']): ListingTypeSearchFacetControl[] {
  if (type === 'number') return ['range', 'buckets'];
  if (type === 'multiselect') return ['checkbox'];
  return ['checkbox', 'radio'];
}

function defaultControl(type: AttributeField['type']): ListingTypeSearchFacetControl {
  return type === 'number' ? 'range' : 'checkbox';
}

function move<T>(items: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}

export function normalizeSearchConfig(
  config: ListingTypeSearchConfig,
  attributes: AttributeField[],
  allowedModes: BookingMode[],
): ListingTypeSearchConfig {
  const fields = new Map(
    attributes.filter((field) => field.filterable).map((field) => [field.key, field]),
  );
  return {
    schedule:
      config.schedule === 'none' || allowedModes.includes(config.schedule)
        ? config.schedule
        : 'none',
    showGuests: config.showGuests,
    systemFacets: [...config.systemFacets],
    attributeFacets: config.attributeFacets.flatMap((facet) => {
      const field = fields.get(facet.key);
      if (!field) return [];
      const allowedControls = controlsFor(field.type);
      const control = allowedControls.includes(facet.control)
        ? facet.control
        : defaultControl(field.type);
      return [
        {
          key: facet.key,
          control,
          matchAll: field.type === 'multiselect' && control === 'checkbox' && facet.matchAll,
          ...(control === 'buckets' ? { buckets: facet.buckets } : {}),
        },
      ];
    }),
  };
}

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
    <section className="space-y-5 rounded-xl border bg-muted/15 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <SlidersHorizontal className="size-4" aria-hidden />
        </div>
        <div>
          <h2 className="font-semibold">Tìm kiếm &amp; bộ lọc Storefront</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Quyết định thanh tìm kiếm và các bộ lọc khách hàng nhìn thấy cho loại dịch vụ này.
          </p>
        </div>
      </div>

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
                  {SCHEDULE_LABEL[schedule]}
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
              So sánh số khách với sức chứa của từng listing.
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
    </section>
  );
}

function SystemFacetEditor({
  config,
  updateConfig,
}: {
  config: ListingTypeSearchConfig;
  updateConfig: (config: ListingTypeSearchConfig) => void;
}) {
  const enabled = config.systemFacets;
  const ordered = [
    ...enabled,
    ...SYSTEM_FACETS.map((facet) => facet.value).filter((facet) => !enabled.includes(facet)),
  ];

  const toggle = (facet: SystemFacet, checked: boolean): void => {
    updateConfig({
      ...config,
      systemFacets: checked ? [...enabled, facet] : enabled.filter((current) => current !== facet),
    });
  };

  return (
    <div className="space-y-3 rounded-lg border bg-background p-4">
      <div>
        <h3 className="text-sm font-semibold">Bộ lọc hệ thống</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Bật và sắp xếp các bộ lọc lấy từ dữ liệu chuẩn của listing.
        </p>
      </div>
      <div className="space-y-2">
        {ordered.map((value) => {
          const definition = SYSTEM_FACETS.find((facet) => facet.value === value)!;
          const checked = enabled.includes(value);
          const index = enabled.indexOf(value);
          return (
            <div
              key={value}
              className="flex min-h-11 items-center gap-3 rounded-md border px-3 py-2"
            >
              <Checkbox
                id={`system-facet-${value}`}
                checked={checked}
                onCheckedChange={(next) => toggle(value, next === true)}
              />
              <Label htmlFor={`system-facet-${value}`} className="flex-1 font-normal">
                {definition.label}
              </Label>
              {checked ? (
                <OrderButtons
                  label={definition.label}
                  index={index}
                  length={enabled.length}
                  onMove={(direction) =>
                    updateConfig({ ...config, systemFacets: move(enabled, index, direction) })
                  }
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AttributeFacetEditor({
  config,
  fields,
  updateConfig,
}: {
  config: ListingTypeSearchConfig;
  fields: AttributeField[];
  updateConfig: (config: ListingTypeSearchConfig) => void;
}) {
  const fieldMap = new Map(fields.map((field) => [field.key, field]));
  const enabled = config.attributeFacets.filter((facet) => fieldMap.has(facet.key));
  const disabled = fields.filter((field) => !enabled.some((facet) => facet.key === field.key));

  const add = (field: AttributeField): void => {
    updateConfig({
      ...config,
      attributeFacets: [
        ...enabled,
        { key: field.key, control: defaultControl(field.type), matchAll: false },
      ],
    });
  };
  const update = (index: number, facet: ListingTypeSearchAttributeFacet): void =>
    updateConfig({
      ...config,
      attributeFacets: enabled.map((current, currentIndex) =>
        currentIndex === index ? facet : current,
      ),
    });
  const remove = (key: string): void =>
    updateConfig({
      ...config,
      attributeFacets: enabled.filter((facet) => facet.key !== key),
    });

  return (
    <div className="space-y-3 rounded-lg border bg-background p-4">
      <div>
        <h3 className="text-sm font-semibold">Bộ lọc thuộc tính</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Chỉ các thuộc tính đã đánh dấu “Lọc được” mới xuất hiện tại đây.
        </p>
      </div>

      {enabled.length ? (
        <div className="space-y-3">
          {enabled.map((facet, index) => {
            const field = fieldMap.get(facet.key)!;
            return (
              <FacetRow
                key={facet.key}
                facet={facet}
                field={field}
                index={index}
                length={enabled.length}
                onChange={(next) => update(index, next)}
                onMove={(direction) =>
                  updateConfig({
                    ...config,
                    attributeFacets: move(enabled, index, direction),
                  })
                }
                onRemove={() => remove(facet.key)}
              />
            );
          })}
        </div>
      ) : (
        <p className="rounded-md border border-dashed px-3 py-5 text-center text-sm text-muted-foreground">
          Chưa bật bộ lọc thuộc tính nào.
        </p>
      )}

      {disabled.length ? (
        <div className="flex flex-wrap gap-2 border-t pt-3">
          {disabled.map((field) => (
            <Button
              key={field.key}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => add(field)}
            >
              <Plus className="size-3.5" /> {field.label}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function FacetRow({
  facet,
  field,
  index,
  length,
  onChange,
  onMove,
  onRemove,
}: {
  facet: ListingTypeSearchAttributeFacet;
  field: AttributeField;
  index: number;
  length: number;
  onChange: (facet: ListingTypeSearchAttributeFacet) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}) {
  const controls = controlsFor(field.type);
  const changeControl = (control: ListingTypeSearchFacetControl): void =>
    onChange({
      key: facet.key,
      control,
      matchAll: control === 'checkbox' && field.type === 'multiselect' ? facet.matchAll : false,
      ...(control === 'buckets'
        ? { buckets: facet.buckets?.length ? facet.buckets : [newBucket([])] }
        : {}),
    });

  return (
    <div className="space-y-4 rounded-lg border p-3 sm:p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{field.label}</p>
            <Badge variant="outline">{TYPE_LABEL[field.type]}</Badge>
          </div>
          <p className="mt-1 font-mono text-xs text-muted-foreground">{field.key}</p>
        </div>
        <OrderButtons label={field.label} index={index} length={length} onMove={onMove} />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onRemove}
          aria-label={`Tắt bộ lọc ${field.label}`}
          title="Tắt bộ lọc"
        >
          <Trash2 className="size-4" />
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Kiểu điều khiển</Label>
          <Select
            value={facet.control}
            onValueChange={(value) => changeControl(value as ListingTypeSearchFacetControl)}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {controls.map((control) => (
                <SelectItem key={control} value={control}>
                  {CONTROL_LABEL[control]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {field.type === 'multiselect' && facet.control === 'checkbox' ? (
          <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
            <div>
              <Label htmlFor={`match-all-${field.key}`}>Yêu cầu tất cả</Label>
              <p className="text-xs text-muted-foreground">
                Khớp mọi lựa chọn thay vì một lựa chọn.
              </p>
            </div>
            <Switch
              id={`match-all-${field.key}`}
              checked={facet.matchAll}
              onCheckedChange={(checked) => onChange({ ...facet, matchAll: checked })}
            />
          </div>
        ) : null}
      </div>

      {field.type === 'text' ? (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          Chỉ nên dùng checkbox/radio khi dữ liệu văn bản có ít giá trị lặp lại ổn định.
        </p>
      ) : null}

      {facet.control === 'buckets' ? (
        <NumericBucketEditor
          buckets={facet.buckets ?? []}
          onChange={(buckets) => onChange({ ...facet, buckets })}
        />
      ) : null}
    </div>
  );
}

function NumericBucketEditor({
  buckets,
  onChange,
}: {
  buckets: ListingTypeSearchBucket[];
  onChange: (buckets: ListingTypeSearchBucket[]) => void;
}) {
  const nextRowId = useRef(buckets.length);
  const [rowIds, setRowIds] = useState(() =>
    buckets.map((_, index) => `bucket-editor-row-${index}`),
  );
  const update = (index: number, patch: Partial<ListingTypeSearchBucket>): void =>
    onChange(
      buckets.map((bucket, current) => (current === index ? { ...bucket, ...patch } : bucket)),
    );
  const add = (): void => {
    const rowId = `bucket-editor-row-${nextRowId.current}`;
    nextRowId.current += 1;
    setRowIds((current) => [...current, rowId]);
    onChange([...buckets, newBucket(buckets)]);
  };
  const remove = (index: number): void => {
    setRowIds((current) => current.filter((_, currentIndex) => currentIndex !== index));
    onChange(buckets.filter((_, current) => current !== index));
  };
  const moveBucket = (index: number, direction: -1 | 1): void => {
    setRowIds((current) => move(current, index, direction));
    onChange(move(buckets, index, direction));
  };

  return (
    <div className="space-y-3 border-t pt-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Các khoảng giá trị</p>
          <p className="text-xs text-muted-foreground">Min có tính, max không tính.</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={add}>
          <Plus className="size-3.5" /> Thêm khoảng
        </Button>
      </div>
      <div className="space-y-2">
        {buckets.map((bucket, index) => (
          <div
            key={rowIds[index]}
            className="grid gap-2 rounded-md bg-muted/40 p-3 sm:grid-cols-[1fr_1.4fr_0.8fr_0.8fr_auto]"
          >
            <Input
              value={bucket.id}
              onChange={(event) => update(index, { id: event.target.value })}
              placeholder="duoi-25"
              aria-label={`ID khoảng ${index + 1}`}
            />
            <Input
              value={bucket.label}
              onChange={(event) => update(index, { label: event.target.value })}
              placeholder="Dưới 25 m²"
              aria-label={`Nhãn khoảng ${index + 1}`}
            />
            <Input
              type="number"
              min={0}
              value={bucket.min ?? ''}
              onChange={(event) => update(index, { min: optionalNumber(event.target.value) })}
              placeholder="Min"
              aria-label={`Giá trị nhỏ nhất khoảng ${index + 1}`}
            />
            <Input
              type="number"
              min={0}
              value={bucket.max ?? ''}
              onChange={(event) => update(index, { max: optionalNumber(event.target.value) })}
              placeholder="Max"
              aria-label={`Giá trị lớn nhất khoảng ${index + 1}`}
            />
            <div className="flex items-center justify-end gap-1">
              <OrderButtons
                label={`Khoảng ${bucket.label || index + 1}`}
                index={index}
                length={buckets.length}
                onMove={(direction) => moveBucket(index, direction)}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => remove(index)}
                aria-label={`Xoá khoảng ${index + 1}`}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function OrderButtons({
  label,
  index,
  length,
  onMove,
}: {
  label: string;
  index: number;
  length: number;
  onMove: (direction: -1 | 1) => void;
}) {
  return (
    <div className="flex shrink-0 gap-1">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        disabled={index === 0}
        onClick={() => onMove(-1)}
        aria-label={`Đưa ${label} lên`}
      >
        <ArrowUp className="size-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        disabled={index === length - 1}
        onClick={() => onMove(1)}
        aria-label={`Đưa ${label} xuống`}
      >
        <ArrowDown className="size-4" />
      </Button>
    </div>
  );
}

function newBucket(existing: ListingTypeSearchBucket[]): ListingTypeSearchBucket {
  const ids = new Set(existing.map((bucket) => bucket.id));
  let index = existing.length + 1;
  while (ids.has(`khoang-${index}`)) index += 1;
  return { id: `khoang-${index}`, label: `Khoảng ${index}`, min: 0 };
}

function optionalNumber(value: string): number | undefined {
  if (value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
