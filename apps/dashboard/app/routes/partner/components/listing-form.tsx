import { useEffect, useMemo, useRef, useState } from 'react';
import {
  createListingInputSchema,
  type AttributeField,
  type BookingMode,
  type CreateListingInput,
  type ListingResponse,
  type ListingTypeResponse,
} from '@booking/contracts';
import { Checkbox } from '@booking/ui/components/ui/checkbox';
import { Input } from '@booking/ui/components/ui/input';
import { Switch } from '@booking/ui/components/ui/switch';
import { GenericForm } from '@booking/ui/components/form/generic-form';
import type { UseFormReturn } from '@booking/ui/components/form/rhf';
import type { FieldConfig } from '@booking/ui/components/form/types';
import { Section, Grid, Field } from '~/components/form-layout';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@booking/ui/components/ui/select';

const MODE_LABEL: Record<BookingMode, string> = {
  hourly: 'Theo giờ',
  daily: 'Theo ngày',
  inventory: 'Theo kho (thuê thiết bị)',
  appointment: 'Lịch hẹn',
  class: 'Lớp học',
};

/** Only these modes are bookable in Phase 1 and have a config panel here. */
const CONFIGURABLE: BookingMode[] = ['hourly', 'daily', 'inventory'];

/** Integer VND đồng string ("12000") from a numeric input value. */
const vnd = (v: string): string => String(Math.max(0, Math.round(Number(v) || 0)));
const int = (v: string, fallback: number): number => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? n : fallback;
};
const num = (v: unknown, fallback = ''): string =>
  v === undefined || v === null ? fallback : String(v);

/** Local state for the dynamic (mode config + attribute) block, kept as strings. */
interface DynamicState {
  bookingModes: BookingMode[];
  hourly: { basePrice: string; minDuration: string; maxDuration: string; granularity: string; leadTimeMin: string };
  daily: { basePricePerNight: string; minNights: string; maxNights: string; checkinTime: string; checkoutTime: string; leadTimeMin: string };
  inventory: { unit: 'hour' | 'day'; basePrice: string; securityDeposit: string };
  stockQuantity: string;
  attributes: Record<string, unknown>;
}

function initialDynamic(listing?: ListingResponse): DynamicState {
  const mc = (listing?.modeConfig ?? {}) as Record<string, Record<string, unknown>>;
  const h = mc.hourly ?? {};
  const d = mc.daily ?? {};
  const inv = mc.inventory ?? {};
  return {
    bookingModes: (listing?.bookingModes ?? []) as BookingMode[],
    hourly: {
      basePrice: num(h.basePrice, '0'),
      minDuration: num(h.minDuration, '1'),
      maxDuration: num(h.maxDuration, '8'),
      granularity: num(h.granularity, '60'),
      leadTimeMin: num(h.leadTimeMin, '0'),
    },
    daily: {
      basePricePerNight: num(d.basePricePerNight, '0'),
      minNights: num(d.minNights, '1'),
      maxNights: num(d.maxNights, '30'),
      checkinTime: num(d.checkinTime, '14:00'),
      checkoutTime: num(d.checkoutTime, '12:00'),
      leadTimeMin: num(d.leadTimeMin, '0'),
    },
    inventory: {
      unit: (inv.unit as 'hour' | 'day') ?? 'day',
      basePrice: num(inv.basePrice, '0'),
      securityDeposit: num(inv.securityDeposit, '0'),
    },
    stockQuantity: num(listing?.stockQuantity, '1'),
    attributes: listing?.attributes ?? {},
  };
}

/** Assemble the typed `modeConfig` the schema expects from the string editor state. */
function buildModeConfig(s: DynamicState): Record<string, unknown> {
  const modes = s.bookingModes;
  const modeConfig: Record<string, unknown> = {};
  if (modes.includes('hourly')) {
    modeConfig.hourly = {
      basePrice: vnd(s.hourly.basePrice),
      blocks: [],
      minDuration: int(s.hourly.minDuration, 1),
      maxDuration: int(s.hourly.maxDuration, 8),
      granularity: int(s.hourly.granularity, 60),
      leadTimeMin: int(s.hourly.leadTimeMin, 0),
    };
  }
  if (modes.includes('daily')) {
    modeConfig.daily = {
      basePricePerNight: vnd(s.daily.basePricePerNight),
      blocks: [],
      minNights: int(s.daily.minNights, 1),
      maxNights: int(s.daily.maxNights, 30),
      checkinTime: s.daily.checkinTime,
      checkoutTime: s.daily.checkoutTime,
      leadTimeMin: int(s.daily.leadTimeMin, 0),
    };
  }
  if (modes.includes('inventory')) {
    modeConfig.inventory = {
      unit: s.inventory.unit,
      basePrice: vnd(s.inventory.basePrice),
      securityDeposit: vnd(s.inventory.securityDeposit),
    };
  }
  return modeConfig;
}

export function ListingForm({
  listingTypes,
  partnerId,
  listing,
  serverError,
  fieldErrors,
}: {
  listingTypes: ListingTypeResponse[];
  partnerId: string;
  listing?: ListingResponse;
  serverError?: string | null;
  fieldErrors?: Record<string, string[]> | null;
}) {
  const isEdit = Boolean(listing);

  const fields: FieldConfig<CreateListingInput>[] = [
    {
      name: 'listingTypeId',
      type: 'select',
      label: 'Loại dịch vụ',
      placeholder: 'Chọn loại dịch vụ',
      disabled: isEdit,
      colSpan: 2,
      options: listingTypes.map((t) => ({ label: t.name, value: t.id })),
    },
    { name: 'title', type: 'text', label: 'Tiêu đề', colSpan: 1 },
    { name: 'slug', type: 'text', label: 'Slug (đường dẫn)', placeholder: 'vd: studio-a-han-quoc', colSpan: 1 },
    { name: 'description', type: 'textarea', label: 'Mô tả', colSpan: 2 },
    { name: 'photos', type: 'file', label: 'Ảnh', target: 'listings', multiple: true, maxFiles: 12, colSpan: 2 },
    { name: 'bufferBefore', type: 'number', label: 'Đệm trước (phút)', colSpan: 1 },
    { name: 'bufferAfter', type: 'number', label: 'Đệm sau (phút)', colSpan: 1 },
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
    { name: 'approvalRequired', type: 'switch', label: 'Yêu cầu duyệt trước khi thanh toán', colSpan: 2 },
  ];

  const defaults: CreateListingInput = {
    partnerId,
    listingTypeId: listing?.listingTypeId ?? listingTypes[0]?.id ?? '',
    title: listing?.title ?? '',
    slug: listing?.slug ?? '',
    description: listing?.description ?? '',
    photos: listing?.photos ?? [],
    bookingModes: (listing?.bookingModes ?? []) as BookingMode[],
    modeConfig: {},
    attributes: listing?.attributes ?? {},
    stockQuantity: listing?.stockQuantity ?? undefined,
    bufferBefore: listing?.bufferBefore ?? 0,
    bufferAfter: listing?.bufferAfter ?? 0,
    approvalRequired: listing?.approvalRequired ?? false,
    depositPercent: listing?.depositPercent ?? 100,
    balanceDue: (listing?.balanceDue as 'online_before' | 'on_arrival') ?? 'online_before',
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
        <ListingConfig form={form} listingTypes={listingTypes} listing={listing} />
      )}
      transform={(d) => ({
        ...d,
        description: d.description?.trim() || undefined,
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
    form.setValue('modeConfig', buildModeConfig(state) as CreateListingInput['modeConfig']);
    form.setValue('attributes', state.attributes);
    form.setValue(
      'stockQuantity',
      state.bookingModes.includes('inventory') ? int(state.stockQuantity, 1) : undefined,
    );
  }, [state, form]);

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
          <p className="text-sm text-muted-foreground">Chọn loại dịch vụ để xem hình thức khả dụng.</p>
        ) : (
          <div className="flex flex-wrap gap-4">
            {allowedModes.map((m) => (
              <label key={m} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={state.bookingModes.includes(m)}
                  onCheckedChange={(v) => toggleMode(m, v === true)}
                />
                {MODE_LABEL[m]}
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
              <Input type="number" min={0} value={state.hourly.basePrice} onChange={(e) => set('hourly', { ...state.hourly, basePrice: e.target.value })} />
            </Field>
            <Field label="Bước (phút)">
              <Input type="number" min={1} value={state.hourly.granularity} onChange={(e) => set('hourly', { ...state.hourly, granularity: e.target.value })} />
            </Field>
            <Field label="Tối thiểu (giờ)">
              <Input type="number" min={1} value={state.hourly.minDuration} onChange={(e) => set('hourly', { ...state.hourly, minDuration: e.target.value })} />
            </Field>
            <Field label="Tối đa (giờ)">
              <Input type="number" min={1} value={state.hourly.maxDuration} onChange={(e) => set('hourly', { ...state.hourly, maxDuration: e.target.value })} />
            </Field>
            <Field label="Đặt trước tối thiểu (phút)">
              <Input type="number" min={0} value={state.hourly.leadTimeMin} onChange={(e) => set('hourly', { ...state.hourly, leadTimeMin: e.target.value })} />
            </Field>
          </Grid>
        </Section>
      ) : null}

      {state.bookingModes.includes('daily') ? (
        <Section title="Cấu hình — theo ngày">
          <Grid>
            <Field label="Giá / đêm (VND)">
              <Input type="number" min={0} value={state.daily.basePricePerNight} onChange={(e) => set('daily', { ...state.daily, basePricePerNight: e.target.value })} />
            </Field>
            <Field label="Tối thiểu (đêm)">
              <Input type="number" min={1} value={state.daily.minNights} onChange={(e) => set('daily', { ...state.daily, minNights: e.target.value })} />
            </Field>
            <Field label="Tối đa (đêm)">
              <Input type="number" min={1} value={state.daily.maxNights} onChange={(e) => set('daily', { ...state.daily, maxNights: e.target.value })} />
            </Field>
            <Field label="Giờ nhận">
              <Input type="time" value={state.daily.checkinTime} onChange={(e) => set('daily', { ...state.daily, checkinTime: e.target.value })} />
            </Field>
            <Field label="Giờ trả">
              <Input type="time" value={state.daily.checkoutTime} onChange={(e) => set('daily', { ...state.daily, checkoutTime: e.target.value })} />
            </Field>
          </Grid>
        </Section>
      ) : null}

      {state.bookingModes.includes('inventory') ? (
        <Section title="Cấu hình — theo kho">
          <Grid>
            <Field label="Đơn vị">
              <Select value={state.inventory.unit} onValueChange={(v) => set('inventory', { ...state.inventory, unit: v as 'hour' | 'day' })}>
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
              <Input type="number" min={0} value={state.inventory.basePrice} onChange={(e) => set('inventory', { ...state.inventory, basePrice: e.target.value })} />
            </Field>
            <Field label="Tiền cọc thiết bị (VND)">
              <Input type="number" min={0} value={state.inventory.securityDeposit} onChange={(e) => set('inventory', { ...state.inventory, securityDeposit: e.target.value })} />
            </Field>
            <Field label="Số lượng trong kho" error={errors.stockQuantity ? [String(errors.stockQuantity.message)] : undefined}>
              <Input type="number" min={1} value={state.stockQuantity} onChange={(e) => set('stockQuantity', e.target.value)} />
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
        onChange={(e) => onChange(field.type === 'number' ? Number(e.target.value) : e.target.value)}
      />
    </Field>
  );
}
