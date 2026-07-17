import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import {
  createListingInputSchema,
  type AttributeField,
  type BookingMode,
  type CreateListingInput,
  type CancellationPolicySummary,
  type ListingResponse,
  type ListingTypeResponse,
} from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import { Checkbox } from '@booking/ui/components/ui/checkbox';
import { Input } from '@booking/ui/components/ui/input';
import { Switch } from '@booking/ui/components/ui/switch';
import { GenericForm } from '@booking/ui/components/form/generic-form';
import type { UseFormReturn } from '@booking/ui/components/form/rhf';
import type { FieldConfig } from '@booking/ui/components/form/types';
import { Section, Grid, Field } from './form-layout';
import { BOOKING_MODE_LABEL } from '~/lib/format';
import {
  buildModeConfig,
  initialDynamic,
  int,
  savedModeConfig,
  type BlockRow,
  type DynamicState,
} from '../lib/listing-mode-config';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@booking/ui/components/ui/select';
import { AdministrativeAddressFields } from './administrative-address-fields';


/** Only these modes are bookable in Phase 1 and have a config panel here. */
const CONFIGURABLE: BookingMode[] = ['hourly', 'daily', 'inventory'];

const INVENTORY_UNIT_LABEL: Record<'hour' | 'day', string> = { hour: 'giờ', day: 'ngày' };

/**
 * The mode-config round-trip (read → edit → write) lives in `listing-mode-config`
 * — it is pure, load-bearing (a dropped key is destroyed on save), and specced.
 */

export function ListingForm({
  listingTypes,
  partnerId,
  listing,
  serverError,
  fieldErrors,
  groupId,
  lockedListingTypeId,
  cancellationPolicies = [],
}: {
  listingTypes: ListingTypeResponse[];
  partnerId: string;
  listing?: ListingResponse;
  serverError?: string | null;
  fieldErrors?: Record<string, string[]> | null;
  groupId?: string;
  lockedListingTypeId?: string;
  cancellationPolicies?: CancellationPolicySummary[];
}) {
  const isEdit = Boolean(listing);

  const fields: FieldConfig<CreateListingInput>[] = [
    {
      name: 'listingTypeId',
      type: 'select',
      label: 'Loại dịch vụ',
      placeholder: 'Chọn loại dịch vụ',
      disabled: isEdit || Boolean(lockedListingTypeId),
      colSpan: 2,
      options: listingTypes.map((t) => ({ label: t.name, value: t.id })),
    },
    { name: 'title', type: 'text', label: 'Tiêu đề', colSpan: 1 },
    {
      name: 'slug',
      type: 'text',
      label: 'Slug (đường dẫn)',
      placeholder: 'vd: studio-a-han-quoc',
      colSpan: 1,
    },
    { name: 'description', type: 'textarea', label: 'Mô tả', colSpan: 2 },
    {
      name: 'photos',
      type: 'file',
      label: 'Ảnh',
      target: 'listings',
      multiple: true,
      maxFiles: 12,
      colSpan: 2,
    },
    { name: 'bufferBefore', type: 'number', label: 'Đệm trước (phút)', colSpan: 1 },
    { name: 'bufferAfter', type: 'number', label: 'Đệm sau (phút)', colSpan: 1 },
    {
      name: 'capacity',
      type: 'number',
      label: 'Sức chứa (số khách tối đa)',
      description: 'Để trống nếu không giới hạn.',
      colSpan: 1,
    },
    { name: 'depositPercent', type: 'number', label: 'Đặt cọc (%)', colSpan: 1 },
    {
      name: 'balanceDue',
      type: 'select',
      label: 'Thanh toán phần còn lại',
      colSpan: 1,
      options: [
        { label: 'Trực tuyến trước', value: 'online_before' },
        { label: 'Tại chỗ', value: 'on_arrival' },
      ],
    },
    {
      name: 'approvalRequired',
      type: 'switch',
      label: 'Yêu cầu duyệt trước khi thanh toán',
      colSpan: 2,
    },
    ...(cancellationPolicies.length
      ? [
          {
            name: 'cancellationPolicyId' as const,
            type: 'select' as const,
            label: 'Chính sách hủy',
            colSpan: 2,
            placeholder: 'Chọn chính sách hủy',
            options: cancellationPolicies.map((policy) => ({
              label: policy.name,
              value: policy.id,
            })),
          },
        ]
      : []),
  ];

  const defaults: CreateListingInput = {
    partnerId,
    listingTypeId: listing?.listingTypeId ?? lockedListingTypeId ?? listingTypes[0]?.id ?? '',
    groupId: listing?.groupId ?? groupId,
    title: listing?.title ?? '',
    slug: listing?.slug ?? '',
    description: listing?.description ?? '',
    provinceCode: listing?.provinceCode ?? '',
    wardCode: listing?.wardCode ?? '',
    address: listing?.address ?? '',
    photos: listing?.photos ?? [],
    bookingModes: (listing?.bookingModes ?? []) as BookingMode[],
    modeConfig: {},
    attributes: listing?.attributes ?? {},
    stockQuantity: listing?.stockQuantity ?? undefined,
    capacity: listing?.capacity ?? undefined,
    bufferBefore: listing?.bufferBefore ?? 0,
    bufferAfter: listing?.bufferAfter ?? 0,
    approvalRequired: listing?.approvalRequired ?? false,
    depositPercent: listing?.depositPercent ?? 100,
    balanceDue: (listing?.balanceDue as 'online_before' | 'on_arrival') ?? 'online_before',
    // Without this the edit form submits an empty policy and CLEARS the listing's
    // cancellation policy — a required checklist row for the reviewer.
    cancellationPolicyId: listing?.cancellationPolicyId ?? undefined,
  };

  return (
    <GenericForm
      schema={createListingInputSchema}
      fields={fields}
      columns={2}
      defaultValues={defaults}
      submitLabel={isEdit ? 'Lưu thay đổi' : 'Tạo tin đăng'}
      serverError={serverError}
      fieldErrors={fieldErrors}
      extraFields={(form) => (
        <div className="space-y-6">
          <AdministrativeAddressFields form={form} />
          <ListingConfig form={form} listingTypes={listingTypes} listing={listing} />
        </div>
      )}
      transform={(d) => ({
        ...d,
        description: d.description?.trim() || undefined,
        address: d.address.trim(),
        photos: (d.photos ?? []).filter(Boolean),
      })}
    />
  );
}

/**
 * The dynamic block: booking-mode selection, per-mode config panels, and type
 * attributes. Kept in local string state (for controlled number inputs) and
 * mirrored into react-hook-form via `setValue`, so the shared schema validates
 * `bookingModes`/`modeConfig`/`stockQuantity`/`attributes` on the client too.
 */
function ListingConfig({
  form,
  listingTypes,
  listing,
}: {
  form: UseFormReturn<CreateListingInput>;
  listingTypes: ListingTypeResponse[];
  listing?: ListingResponse;
}) {
  const listingTypeId = form.watch('listingTypeId');
  const selectedType = useMemo(
    () => listingTypes.find((t) => t.id === listingTypeId),
    [listingTypes, listingTypeId],
  );
  const allowedModes = (selectedType?.allowedModes ?? []).filter((m) => CONFIGURABLE.includes(m));

  const [state, setState] = useState<DynamicState>(() => initialDynamic(listing));
  const set = <K extends keyof DynamicState>(key: K, value: DynamicState[K]): void =>
    setState((s) => ({ ...s, [key]: value }));
  // The listing's stored mode_config — the base every rebuild spreads over, so a
  // key this form doesn't render survives the wholesale PATCH replace.
  const saved = useMemo(() => savedModeConfig(listing), [listing]);

  // Reset modes/attributes when the user switches type (skip the initial mount so
  // an edit form keeps the listing's saved values).
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    const modes = (selectedType?.defaultModes ?? []).filter((m) => CONFIGURABLE.includes(m));
    setState((s) => ({ ...s, bookingModes: modes, attributes: {} }));
  }, [listingTypeId, selectedType]);

  // Mirror the dynamic values into RHF so the schema can validate them.
  useEffect(() => {
    form.setValue('bookingModes', state.bookingModes);
    form.setValue('modeConfig', buildModeConfig(state, saved) as CreateListingInput['modeConfig']);
    form.setValue('attributes', state.attributes);
    form.setValue(
      'stockQuantity',
      state.bookingModes.includes('inventory') ? int(state.stockQuantity, 1) : undefined,
    );
  }, [state, form, saved]);

  const errors = form.formState.errors;
  const toggleMode = (mode: BookingMode, on: boolean): void =>
    set(
      'bookingModes',
      on ? [...state.bookingModes, mode] : state.bookingModes.filter((m) => m !== mode),
    );

  return (
    <div className="space-y-6">
      <Section title="Hình thức đặt">
        {allowedModes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Chọn loại dịch vụ để xem hình thức khả dụng.
          </p>
        ) : (
          <div className="flex flex-wrap gap-4">
            {allowedModes.map((m) => (
              <label key={m} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={state.bookingModes.includes(m)}
                  onCheckedChange={(v) => toggleMode(m, v === true)}
                />
                {BOOKING_MODE_LABEL[m]}
              </label>
            ))}
          </div>
        )}
        {errors.bookingModes ? (
          <p className="text-xs text-destructive">{String(errors.bookingModes.message)}</p>
        ) : null}
        {errors.modeConfig ? (
          <p className="text-xs text-destructive">{String(errors.modeConfig.message)}</p>
        ) : null}
      </Section>

      {state.bookingModes.includes('hourly') ? (
        <Section title="Cấu hình — theo giờ">
          <Grid>
            <Field label="Giá / giờ (VND)">
              <Input
                type="number"
                min={0}
                value={state.hourly.basePrice}
                onChange={(e) => set('hourly', { ...state.hourly, basePrice: e.target.value })}
              />
            </Field>
            <Field label="Bước (phút)">
              <Input
                type="number"
                min={1}
                value={state.hourly.granularity}
                onChange={(e) => set('hourly', { ...state.hourly, granularity: e.target.value })}
              />
            </Field>
            <Field label="Tối thiểu (giờ)">
              <Input
                type="number"
                min={1}
                value={state.hourly.minDuration}
                onChange={(e) => set('hourly', { ...state.hourly, minDuration: e.target.value })}
              />
            </Field>
            <Field label="Tối đa (giờ)">
              <Input
                type="number"
                min={1}
                value={state.hourly.maxDuration}
                onChange={(e) => set('hourly', { ...state.hourly, maxDuration: e.target.value })}
              />
            </Field>
            <Field label="Đặt trước tối thiểu (phút)">
              <Input
                type="number"
                min={0}
                value={state.hourly.leadTimeMin}
                onChange={(e) => set('hourly', { ...state.hourly, leadTimeMin: e.target.value })}
              />
            </Field>
          </Grid>
          <BlockEditor
            rows={state.hourly.blocks}
            unitLabel="giờ"
            onChange={(blocks) => set('hourly', { ...state.hourly, blocks })}
          />
        </Section>
      ) : null}

      {state.bookingModes.includes('daily') ? (
        <Section title="Cấu hình — theo ngày">
          <Grid>
            <Field label="Giá / đêm (VND)">
              <Input
                type="number"
                min={0}
                value={state.daily.basePricePerNight}
                onChange={(e) =>
                  set('daily', { ...state.daily, basePricePerNight: e.target.value })
                }
              />
            </Field>
            <Field label="Tối thiểu (đêm)">
              <Input
                type="number"
                min={1}
                value={state.daily.minNights}
                onChange={(e) => set('daily', { ...state.daily, minNights: e.target.value })}
              />
            </Field>
            <Field label="Tối đa (đêm)">
              <Input
                type="number"
                min={1}
                value={state.daily.maxNights}
                onChange={(e) => set('daily', { ...state.daily, maxNights: e.target.value })}
              />
            </Field>
            <Field label="Giờ nhận">
              <Input
                type="time"
                value={state.daily.checkinTime}
                onChange={(e) => set('daily', { ...state.daily, checkinTime: e.target.value })}
              />
            </Field>
            <Field label="Giờ trả">
              <Input
                type="time"
                value={state.daily.checkoutTime}
                onChange={(e) => set('daily', { ...state.daily, checkoutTime: e.target.value })}
              />
            </Field>
            <Field label="Đặt trước tối thiểu (phút)">
              <Input
                type="number"
                min={0}
                value={state.daily.leadTimeMin}
                onChange={(e) => set('daily', { ...state.daily, leadTimeMin: e.target.value })}
              />
            </Field>
          </Grid>
          <BlockEditor
            rows={state.daily.blocks}
            unitLabel="đêm"
            onChange={(blocks) => set('daily', { ...state.daily, blocks })}
          />
        </Section>
      ) : null}

      {state.bookingModes.includes('inventory') ? (
        <Section title="Cấu hình — theo kho">
          <Grid>
            <Field label="Đơn vị">
              <Select
                value={state.inventory.unit}
                onValueChange={(v) =>
                  set('inventory', { ...state.inventory, unit: v as 'hour' | 'day' })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">Ngày</SelectItem>
                  <SelectItem value="hour">Giờ</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Giá / đơn vị (VND)">
              <Input
                type="number"
                min={0}
                value={state.inventory.basePrice}
                onChange={(e) =>
                  set('inventory', { ...state.inventory, basePrice: e.target.value })
                }
              />
            </Field>
            <Field label="Tiền cọc thiết bị (VND)">
              <Input
                type="number"
                min={0}
                value={state.inventory.securityDeposit}
                onChange={(e) =>
                  set('inventory', { ...state.inventory, securityDeposit: e.target.value })
                }
              />
            </Field>
            <Field
              label="Số lượng trong kho"
              error={errors.stockQuantity ? [String(errors.stockQuantity.message)] : undefined}
            >
              <Input
                type="number"
                min={1}
                value={state.stockQuantity}
                onChange={(e) => set('stockQuantity', e.target.value)}
              />
            </Field>
            <Field label={`Thuê tối thiểu (${INVENTORY_UNIT_LABEL[state.inventory.unit]})`}>
              <Input
                type="number"
                min={1}
                placeholder="Không giới hạn"
                value={state.inventory.minDuration}
                onChange={(e) =>
                  set('inventory', { ...state.inventory, minDuration: e.target.value })
                }
              />
            </Field>
            <Field label={`Thuê tối đa (${INVENTORY_UNIT_LABEL[state.inventory.unit]})`}>
              <Input
                type="number"
                min={1}
                placeholder="Không giới hạn"
                value={state.inventory.maxDuration}
                onChange={(e) =>
                  set('inventory', { ...state.inventory, maxDuration: e.target.value })
                }
              />
            </Field>
            <Field label={`Phí trả trễ / ${INVENTORY_UNIT_LABEL[state.inventory.unit]} (VND)`}>
              <Input
                type="number"
                min={0}
                placeholder="Mặc định: bằng giá thuê"
                value={state.inventory.lateFeePerUnit}
                onChange={(e) =>
                  set('inventory', { ...state.inventory, lateFeePerUnit: e.target.value })
                }
              />
            </Field>
          </Grid>
        </Section>
      ) : null}

      {selectedType && selectedType.attributeSchema.length > 0 ? (
        <Section title="Thuộc tính">
          <div className="space-y-3">
            {selectedType.attributeSchema.map((f) => (
              <AttributeInput
                key={f.key}
                field={f}
                value={state.attributes[f.key]}
                onChange={(v) => set('attributes', { ...state.attributes, [f.key]: v })}
              />
            ))}
          </div>
        </Section>
      ) : null}
    </div>
  );
}

/**
 * Bundle pricing (§9.1): "N hours/nights for a flat price". A booking whose
 * duration matches a block is charged the block price and pricing rules never
 * override it — so these rows are real money, and losing them (as this form used
 * to, by hardcoding `blocks: []`) silently re-prices the listing.
 */
function BlockEditor({
  rows,
  unitLabel,
  onChange,
}: {
  rows: BlockRow[];
  unitLabel: string;
  onChange: (rows: BlockRow[]) => void;
}) {
  const update = (i: number, patch: Partial<BlockRow>): void =>
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-medium">Giá theo gói</h3>
        <p className="text-xs text-muted-foreground">
          Đặt đúng số {unitLabel} của gói sẽ được tính giá trọn gói thay vì giá lẻ.
        </p>
      </div>
      {rows.length > 0 ? (
        <div className="space-y-2">
          {rows.map((row, i) => (
            <div key={i} className="flex items-end gap-2">
              <div className="flex-1">
                <Field label={`Số ${unitLabel}`}>
                  <Input
                    type="number"
                    min={1}
                    value={row.count}
                    onChange={(e) => update(i, { count: e.target.value })}
                  />
                </Field>
              </div>
              <div className="flex-1">
                <Field label="Giá trọn gói (VND)">
                  <Input
                    type="number"
                    min={0}
                    value={row.price}
                    onChange={(e) => update(i, { price: e.target.value })}
                  />
                </Field>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="mb-0.5"
                onClick={() => onChange(rows.filter((_, idx) => idx !== i))}
                aria-label={`Xoá gói ${i + 1}`}
              >
                <X className="size-4" aria-hidden />
              </Button>
            </div>
          ))}
        </div>
      ) : null}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onChange([...rows, { count: '', price: '' }])}
      >
        <Plus className="size-4" aria-hidden /> Thêm gói
      </Button>
    </div>
  );
}

function AttributeInput({
  field,
  value,
  onChange,
}: {
  field: AttributeField;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  if (field.type === 'boolean') {
    return (
      <label className="flex items-center gap-2 text-sm">
        <Switch checked={value === true} onCheckedChange={(v) => onChange(v)} />
        {field.label}
      </label>
    );
  }
  if (field.type === 'select') {
    return (
      <Field label={field.label}>
        <Select value={typeof value === 'string' ? value : ''} onValueChange={onChange}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            {(field.options ?? []).map((o) => (
              <SelectItem key={o} value={o}>
                {o}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
    );
  }
  if (field.type === 'multiselect') {
    const selected = Array.isArray(value) ? (value as string[]) : [];
    return (
      <Field label={field.label}>
        <div className="flex flex-wrap gap-3">
          {(field.options ?? []).map((o) => (
            <label key={o} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={selected.includes(o)}
                onCheckedChange={(v) =>
                  onChange(v === true ? [...selected, o] : selected.filter((x) => x !== o))
                }
              />
              {o}
            </label>
          ))}
        </div>
      </Field>
    );
  }
  return (
    <Field label={field.label}>
      <Input
        type={field.type === 'number' ? 'number' : 'text'}
        value={value === undefined || value === null ? '' : String(value)}
        onChange={(e) =>
          onChange(field.type === 'number' ? Number(e.target.value) : e.target.value)
        }
      />
    </Field>
  );
}
