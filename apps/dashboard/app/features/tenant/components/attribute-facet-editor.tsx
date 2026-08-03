import type {
  AttributeField,
  ListingTypeSearchAttributeFacet,
  ListingTypeSearchConfig,
  ListingTypeSearchFacetControl,
} from '@booking/contracts';
import { Badge } from '@booking/ui/components/ui/badge';
import { Button } from '@booking/ui/components/ui/button';
import { Label } from '@booking/ui/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@booking/ui/components/ui/select';
import { Switch } from '@booking/ui/components/ui/switch';
import { Plus, Trash2 } from 'lucide-react';
import { move, OrderButtons } from '~/components/order-buttons';
import { ATTRIBUTE_FIELD_TYPE_LABEL } from '~/features/tenant/constants';
import { controlsFor, defaultControl } from './listing-type-search-config';
import { FACET_CONTROL_LABEL } from '~/constants/listing';
import { newBucket, NumericBucketEditor } from './numeric-bucket-editor';

/** Enable, configure and reorder facets built from the type's filterable attributes. */
export function AttributeFacetEditor({
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
            <Badge variant="outline">{ATTRIBUTE_FIELD_TYPE_LABEL[field.type]}</Badge>
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
                  {FACET_CONTROL_LABEL[control]}
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
        <p className="text-xs text-warning">
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
