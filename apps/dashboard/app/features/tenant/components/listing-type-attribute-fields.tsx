import { useRef } from 'react';
import type {
  AttributeField,
  AttributeFieldType,
  CreateListingTypeInput,
} from '@booking/contracts';
import { Controller, type UseFormReturn } from '@booking/ui/components/form/rhf';
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
import { Plus, X } from 'lucide-react';
import { IconPicker } from '~/components/icon-picker';
import { uniqueAttributeKey } from '~/features/tenant/lib/listing-type-attribute-key';
import { ATTRIBUTE_FIELD_TYPE_LABEL } from '../constants';
import { normalizeSearchConfig } from './listing-type-search-config';

/** Only `select`/`multiselect` attributes carry an `options` list. */
export const isChoice = (type: AttributeFieldType): boolean =>
  type === 'select' || type === 'multiselect';

/** `list` attributes are descriptive bullet lists — display-only, never filterable. */
export const isDisplayOnly = (type: AttributeFieldType): boolean => type === 'list';

const FIELD_TYPES: { value: AttributeFieldType; label: string }[] = (
  ['text', 'number', 'select', 'multiselect', 'boolean', 'list'] as const
).map((value) => ({ value, label: ATTRIBUTE_FIELD_TYPE_LABEL[value] }));

/**
 * The custom attribute-schema row editor, bound via `Controller`. Every edit that
 * can invalidate a search facet (renaming a key, turning off "Lọc được", removing
 * an attribute) confirms with the user where destructive, then re-normalizes
 * `searchConfig` so the facets never point at a dead attribute.
 */
export function ListingTypeAttributeFields({
  form,
}: {
  form: UseFormReturn<CreateListingTypeInput>;
}) {
  const errors = form.formState.errors;
  const autoKeyRows = useRef(new Set<number>());

  return (
    <Controller
      control={form.control}
      name="attributeSchema"
      render={({ field }) => {
        const rows: AttributeField[] = field.value ?? [];
        const update = (i: number, patch: Partial<AttributeField>): void => {
          const current = rows[i];
          if (!current) return;
          const activeFacet = form
            .getValues('searchConfig.attributeFacets')
            .some((facet) => facet.key === current.key);
          if (
            patch.filterable === false &&
            current.filterable &&
            activeFacet &&
            globalThis.confirm &&
            !globalThis.confirm(
              `Tắt “Lọc được” sẽ xoá cấu hình bộ lọc “${current.label || current.key}”. Tiếp tục?`,
            )
          )
            return;

          const nextRows = rows.map((attribute, index) =>
            index === i ? { ...attribute, ...patch } : attribute,
          );
          let searchConfig = form.getValues('searchConfig');
          if (patch.key !== undefined && patch.key !== current.key) {
            searchConfig = {
              ...searchConfig,
              attributeFacets: searchConfig.attributeFacets.map((facet) =>
                facet.key === current.key ? { ...facet, key: patch.key! } : facet,
              ),
            };
          }
          if (patch.filterable === false) {
            searchConfig = {
              ...searchConfig,
              attributeFacets: searchConfig.attributeFacets.filter(
                (facet) => facet.key !== current.key,
              ),
            };
          }
          field.onChange(nextRows);
          form.setValue(
            'searchConfig',
            normalizeSearchConfig(searchConfig, nextRows, form.getValues('allowedModes')),
            { shouldDirty: true, shouldValidate: true },
          );
        };
        const remove = (i: number): void => {
          const current = rows[i];
          if (!current) return;
          const activeFacet = form
            .getValues('searchConfig.attributeFacets')
            .some((facet) => facet.key === current.key);
          if (
            activeFacet &&
            globalThis.confirm &&
            !globalThis.confirm(
              `Xoá thuộc tính sẽ xoá luôn bộ lọc “${current.label || current.key}”. Tiếp tục?`,
            )
          )
            return;
          const nextRows = rows.filter((_, index) => index !== i);
          autoKeyRows.current = new Set(
            [...autoKeyRows.current]
              .filter((index) => index !== i)
              .map((index) => (index > i ? index - 1 : index)),
          );
          field.onChange(nextRows);
          form.setValue(
            'searchConfig',
            normalizeSearchConfig(
              {
                ...form.getValues('searchConfig'),
                attributeFacets: form
                  .getValues('searchConfig.attributeFacets')
                  .filter((facet) => facet.key !== current.key),
              },
              nextRows,
              form.getValues('allowedModes'),
            ),
            { shouldDirty: true, shouldValidate: true },
          );
        };
        const add = (): void => {
          autoKeyRows.current.add(rows.length);
          field.onChange([
            ...rows,
            { key: '', label: '', type: 'text', required: false, filterable: false },
          ]);
        };

        // Per-row errors live at errors.attributeSchema[i].<field>; the
        // array-level refinement (duplicate keys) lands on the root. Neither was
        // rendered before, so an invalid row made submit a silent no-op.
        const schemaErrors = errors.attributeSchema;
        const rootMessage = schemaErrors?.message ?? schemaErrors?.root?.message;
        const rowError = (i: number, key: keyof AttributeField): string | undefined =>
          schemaErrors?.[i]?.[key]?.message;

        return (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Ví dụ với studio, bạn có thể yêu cầu đối tác khai báo diện tích, phong cách hoặc thiết
              bị đi kèm. Hệ thống tự tạo mã nội bộ từ tên trường.
            </p>
            {rootMessage ? (
              <p className="text-xs text-destructive">
                Có thông tin bị trùng tên hoặc chưa được điền đầy đủ.
              </p>
            ) : null}
            <div className="space-y-3">
              {rows.length === 0 ? (
                <div className="rounded-lg border border-dashed px-4 py-5 text-sm text-muted-foreground">
                  Chưa cần khai báo thông tin bổ sung. Bạn có thể bỏ qua phần này.
                </div>
              ) : null}
              {rows.map((a, i) => (
                <div key={i} className="space-y-3 rounded-md border p-3">
                  <div className="flex items-start gap-2">
                    <div className="grid flex-1 gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5 sm:col-span-2">
                        <Label>Tên thông tin</Label>
                        <Input
                          value={a.label}
                          onChange={(event) => {
                            const label = event.target.value;
                            const shouldGenerateKey = autoKeyRows.current.has(i) || !a.key;
                            update(i, {
                              label,
                              ...(shouldGenerateKey
                                ? { key: uniqueAttributeKey(label, rows, i) }
                                : {}),
                            });
                          }}
                          onBlur={() => autoKeyRows.current.delete(i)}
                          placeholder="Ví dụ: Diện tích, Phong cách, Có ánh sáng tự nhiên"
                          aria-invalid={
                            rowError(i, 'label') || rowError(i, 'key') ? true : undefined
                          }
                        />
                        {rowError(i, 'label') ? (
                          <p className="text-xs text-destructive">{rowError(i, 'label')}</p>
                        ) : rowError(i, 'key') ? (
                          <p className="text-xs text-destructive">
                            Hãy nhập tên để hệ thống tạo mã nội bộ.
                          </p>
                        ) : null}
                      </div>
                      <div className="space-y-1.5">
                        <Label>Loại dữ liệu</Label>
                        <Select
                          value={a.type}
                          onValueChange={(v) =>
                            update(i, {
                              type: v as AttributeFieldType,
                              // Reset options when leaving a choice type.
                              ...(isChoice(v as AttributeFieldType)
                                ? {}
                                : { options: undefined }),
                              // Display-only types can never be filtered — drop it
                              // (update() also strips any facet pointing here).
                              ...(isDisplayOnly(v as AttributeFieldType)
                                ? { filterable: false }
                                : {}),
                            })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {FIELD_TYPES.map((t) => (
                              <SelectItem key={t.value} value={t.value}>
                                {t.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Biểu tượng</Label>
                        <IconPicker
                          value={a.icon ?? null}
                          onChange={(icon) => update(i, { icon })}
                          ariaLabel={`Biểu tượng cho ${a.label || a.key || 'thuộc tính'}`}
                        />
                      </div>
                      {isChoice(a.type) ? (
                        <div className="space-y-1.5 sm:col-span-2">
                          <Label>Các lựa chọn</Label>
                          <Input
                            value={(a.options ?? []).join(', ')}
                            onChange={(e) =>
                              update(i, {
                                options: e.target.value
                                  .split(',')
                                  .map((o) => o.trim())
                                  .filter(Boolean),
                              })
                            }
                            placeholder="Nhập cách nhau bằng dấu phẩy, ví dụ: Hàn Quốc, Vintage"
                            aria-invalid={rowError(i, 'options') ? true : undefined}
                          />
                          {rowError(i, 'options') ? (
                            <p className="text-xs text-destructive">{rowError(i, 'options')}</p>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => remove(i)}
                      aria-label="Xoá trường"
                    >
                      <X className="size-4" />
                    </Button>
                  </div>
                  <div className="flex gap-6">
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={a.required}
                        onCheckedChange={(v) => update(i, { required: v === true })}
                      />
                      Bắt buộc
                    </label>
                    {isDisplayOnly(a.type) ? (
                      <span className="text-sm text-muted-foreground">
                        Danh sách chỉ để hiển thị (không lọc được)
                      </span>
                    ) : (
                      <label className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={a.filterable}
                          onCheckedChange={(v) => update(i, { filterable: v === true })}
                        />
                        Cho phép dùng làm bộ lọc
                      </label>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <Button type="button" variant="outline" size="sm" onClick={add}>
              <Plus className="size-4" /> Thêm thông tin cần khai báo
            </Button>
          </div>
        );
      }}
    />
  );
}
