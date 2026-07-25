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
        const add = (): void =>
          field.onChange([
            ...rows,
            { key: '', label: '', type: 'text', required: false, filterable: false },
          ]);

        // Per-row errors live at errors.attributeSchema[i].<field>; the
        // array-level refinement (duplicate keys) lands on the root. Neither was
        // rendered before, so an invalid row made submit a silent no-op.
        const schemaErrors = errors.attributeSchema;
        const rootMessage = schemaErrors?.message ?? schemaErrors?.root?.message;
        const rowError = (i: number, key: keyof AttributeField): string | undefined =>
          schemaErrors?.[i]?.[key]?.message;

        return (
          <section className="space-y-3 rounded-lg border p-4">
            <h2 className="text-sm font-semibold">Thuộc tính tuỳ biến</h2>
            <p className="text-xs text-muted-foreground">
              Các trường sẽ hiện khi đối tác tạo tin đăng thuộc loại này. “Lọc được” chỉ làm cho
              thuộc tính đủ điều kiện; hãy bật và chọn kiểu hiển thị ở phần bộ lọc bên dưới.
            </p>
            {rootMessage ? (
              <p className="text-xs text-destructive">{String(rootMessage)}</p>
            ) : null}
            <div className="space-y-3">
              {rows.map((a, i) => (
                <div key={i} className="space-y-3 rounded-md border p-3">
                  <div className="flex items-start gap-2">
                    <div className="grid flex-1 gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label>Khoá (key)</Label>
                        <Input
                          value={a.key}
                          onChange={(e) => update(i, { key: e.target.value })}
                          placeholder="area"
                          aria-invalid={rowError(i, 'key') ? true : undefined}
                        />
                        {rowError(i, 'key') ? (
                          <p className="text-xs text-destructive">{rowError(i, 'key')}</p>
                        ) : null}
                      </div>
                      <div className="space-y-1.5">
                        <Label>Nhãn</Label>
                        <Input
                          value={a.label}
                          onChange={(e) => update(i, { label: e.target.value })}
                          placeholder="Diện tích"
                          aria-invalid={rowError(i, 'label') ? true : undefined}
                        />
                        {rowError(i, 'label') ? (
                          <p className="text-xs text-destructive">{rowError(i, 'label')}</p>
                        ) : null}
                      </div>
                      <div className="space-y-1.5">
                        <Label>Kiểu</Label>
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
                        <div className="space-y-1.5">
                          <Label>Tuỳ chọn (phân tách bằng dấu phẩy)</Label>
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
                            placeholder="Hàn Quốc, Vintage"
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
                        Lọc được
                      </label>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <Button type="button" variant="outline" size="sm" onClick={add}>
              <Plus className="size-4" /> Thêm thuộc tính
            </Button>
          </section>
        );
      }}
    />
  );
}
