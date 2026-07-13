import { useMemo, useState } from 'react';
import { useNavigation, useSubmit } from 'react-router';
import type {
  AttributeField,
  BookingMode,
  ListingResponse,
  ListingTypeResponse,
} from '@booking/shared';
import { Button } from '@booking/ui/components/ui/button';
import { Checkbox } from '@booking/ui/components/ui/checkbox';
import { Input } from '@booking/ui/components/ui/input';
import { Switch } from '@booking/ui/components/ui/switch';
import { Textarea } from '@booking/ui/components/ui/textarea';
import { ImageUpload } from '@booking/ui/components/form/image-upload';
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

interface FormState {
  listingTypeId: string;
  title: string;
  slug: string;
  description: string;
  photos: string[];
  bookingModes: BookingMode[];
  hourly: { basePrice: string; minDuration: string; maxDuration: string; granularity: string; leadTimeMin: string };
  daily: { basePricePerNight: string; minNights: string; maxNights: string; checkinTime: string; checkoutTime: string; leadTimeMin: string };
  inventory: { unit: 'hour' | 'day'; basePrice: string; securityDeposit: string };
  stockQuantity: string;
  attributes: Record<string, unknown>;
  bufferBefore: string;
  bufferAfter: string;
  approvalRequired: boolean;
  depositPercent: string;
  balanceDue: 'online_before' | 'on_arrival';
}

const num = (v: unknown, fallback = ''): string =>
  v === undefined || v === null ? fallback : String(v);

function initialState(partnerTypes: ListingTypeResponse[], listing?: ListingResponse): FormState {
  const mc = (listing?.modeConfig ?? {}) as Record<string, Record<string, unknown>>;
  const h = mc.hourly ?? {};
  const d = mc.daily ?? {};
  const inv = mc.inventory ?? {};
  return {
    listingTypeId: listing?.listingTypeId ?? partnerTypes[0]?.id ?? '',
    title: listing?.title ?? '',
    slug: listing?.slug ?? '',
    description: listing?.description ?? '',
    photos: listing?.photos ?? [],
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
    bufferBefore: num(listing?.bufferBefore, '0'),
    bufferAfter: num(listing?.bufferAfter, '0'),
    approvalRequired: listing?.approvalRequired ?? false,
    depositPercent: num(listing?.depositPercent, '100'),
    balanceDue: (listing?.balanceDue as 'online_before' | 'on_arrival') ?? 'online_before',
  };
}

/** Integer VND đồng string ("12000") from a numeric input value. */
const vnd = (v: string): string => String(Math.max(0, Math.round(Number(v) || 0)));
const int = (v: string, fallback: number): number => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? n : fallback;
};

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
  const submit = useSubmit();
  const navigation = useNavigation();
  const saving = navigation.state !== 'idle';
  const isEdit = Boolean(listing);
  const [state, setState] = useState<FormState>(() => initialState(listingTypes, listing));

  const set = <K extends keyof FormState>(key: K, value: FormState[K]): void =>
    setState((s) => ({ ...s, [key]: value }));

  const selectedType = useMemo(
    () => listingTypes.find((t) => t.id === state.listingTypeId),
    [listingTypes, state.listingTypeId],
  );
  const allowedModes = (selectedType?.allowedModes ?? []).filter((m) => CONFIGURABLE.includes(m));

  function onTypeChange(id: string): void {
    const type = listingTypes.find((t) => t.id === id);
    const modes = (type?.defaultModes ?? []).filter((m) => CONFIGURABLE.includes(m));
    setState((s) => ({ ...s, listingTypeId: id, bookingModes: modes, attributes: {} }));
  }

  function toggleMode(mode: BookingMode, on: boolean): void {
    setState((s) => ({
      ...s,
      bookingModes: on ? [...s.bookingModes, mode] : s.bookingModes.filter((m) => m !== mode),
    }));
  }

  function handleSubmit(): void {
    const modes = state.bookingModes;
    const modeConfig: Record<string, unknown> = {};
    if (modes.includes('hourly')) {
      modeConfig.hourly = {
        basePrice: vnd(state.hourly.basePrice),
        blocks: [],
        minDuration: int(state.hourly.minDuration, 1),
        maxDuration: int(state.hourly.maxDuration, 8),
        granularity: int(state.hourly.granularity, 60),
        leadTimeMin: int(state.hourly.leadTimeMin, 0),
      };
    }
    if (modes.includes('daily')) {
      modeConfig.daily = {
        basePricePerNight: vnd(state.daily.basePricePerNight),
        blocks: [],
        minNights: int(state.daily.minNights, 1),
        maxNights: int(state.daily.maxNights, 30),
        checkinTime: state.daily.checkinTime,
        checkoutTime: state.daily.checkoutTime,
        leadTimeMin: int(state.daily.leadTimeMin, 0),
      };
    }
    if (modes.includes('inventory')) {
      modeConfig.inventory = {
        unit: state.inventory.unit,
        basePrice: vnd(state.inventory.basePrice),
        securityDeposit: vnd(state.inventory.securityDeposit),
      };
    }

    const payload: Record<string, unknown> = {
      partnerId,
      listingTypeId: state.listingTypeId,
      title: state.title.trim(),
      slug: state.slug.trim(),
      description: state.description.trim() || undefined,
      photos: state.photos.map((p) => p.trim()).filter(Boolean),
      attributes: state.attributes,
      bookingModes: modes,
      modeConfig,
      stockQuantity: modes.includes('inventory') ? int(state.stockQuantity, 1) : undefined,
      bufferBefore: int(state.bufferBefore, 0),
      bufferAfter: int(state.bufferAfter, 0),
      approvalRequired: state.approvalRequired,
      depositPercent: int(state.depositPercent, 100),
      balanceDue: state.balanceDue,
    };
    // JSON body — the route action reads it with `request.json()` and re-validates.
    submit(payload as never, { method: 'post', encType: 'application/json' });
  }

  return (
    <div className="max-w-2xl space-y-6">
      {serverError ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {serverError}
        </div>
      ) : null}

      <Section title="Loại dịch vụ">
        <Field label="Loại" error={fieldErrors?.listingTypeId}>
          <Select value={state.listingTypeId} onValueChange={onTypeChange} disabled={isEdit}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Chọn loại dịch vụ" />
            </SelectTrigger>
            <SelectContent>
              {listingTypes.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isEdit ? <p className="text-xs text-muted-foreground">Không thể đổi loại sau khi tạo.</p> : null}
        </Field>
      </Section>

      <Section title="Thông tin cơ bản">
        <Field label="Tiêu đề" error={fieldErrors?.title}>
          <Input value={state.title} onChange={(e) => set('title', e.target.value)} />
        </Field>
        <Field label="Slug (đường dẫn)" error={fieldErrors?.slug}>
          <Input
            value={state.slug}
            onChange={(e) => set('slug', e.target.value)}
            placeholder="vd: studio-a-han-quoc"
          />
        </Field>
        <Field label="Mô tả" error={fieldErrors?.description}>
          <Textarea rows={4} value={state.description} onChange={(e) => set('description', e.target.value)} />
        </Field>
      </Section>

      <Section title="Ảnh">
        <ImageUpload
          value={state.photos}
          onChange={(v) => set('photos', Array.isArray(v) ? v : v ? [v] : [])}
          multiple
          target="listings"
          maxFiles={12}
        />
        {fieldErrors?.photos ? <p className="text-xs text-destructive">{fieldErrors.photos[0]}</p> : null}
      </Section>

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
        {fieldErrors?.bookingModes ? (
          <p className="text-xs text-destructive">{fieldErrors.bookingModes[0]}</p>
        ) : null}
        {fieldErrors?.modeConfig ? (
          <p className="text-xs text-destructive">{fieldErrors.modeConfig[0]}</p>
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
            <Field label="Số lượng trong kho" error={fieldErrors?.stockQuantity}>
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

      <Section title="Cài đặt">
        <Grid>
          <Field label="Đệm trước (phút)">
            <Input type="number" min={0} value={state.bufferBefore} onChange={(e) => set('bufferBefore', e.target.value)} />
          </Field>
          <Field label="Đệm sau (phút)">
            <Input type="number" min={0} value={state.bufferAfter} onChange={(e) => set('bufferAfter', e.target.value)} />
          </Field>
          <Field label="Đặt cọc (%)" error={fieldErrors?.depositPercent}>
            <Input type="number" min={0} max={100} value={state.depositPercent} onChange={(e) => set('depositPercent', e.target.value)} />
          </Field>
          <Field label="Thanh toán phần còn lại">
            <Select value={state.balanceDue} onValueChange={(v) => set('balanceDue', v as FormState['balanceDue'])}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="online_before">Trực tuyến trước</SelectItem>
                <SelectItem value="on_arrival">Tại chỗ</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </Grid>
        <label className="mt-2 flex items-center gap-2 text-sm">
          <Switch checked={state.approvalRequired} onCheckedChange={(v) => set('approvalRequired', v)} />
          Yêu cầu duyệt trước khi thanh toán
        </label>
      </Section>

      <div className="flex justify-end gap-2">
        <Button type="button" onClick={handleSubmit} disabled={saving}>
          {saving ? 'Đang lưu…' : isEdit ? 'Lưu thay đổi' : 'Tạo tin đăng'}
        </Button>
      </div>
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

