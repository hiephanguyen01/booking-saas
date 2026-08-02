import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { CreateListingInput, ListingResponse, ListingTypeResponse } from '@booking/contracts';
import { Checkbox } from '@booking/ui/components/ui/checkbox';
import { Input } from '@booking/ui/components/ui/input';
import { cn } from '@booking/ui/lib/utils';
import type { UseFormReturn } from '@booking/ui/components/form/rhf';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@booking/ui/components/ui/select';
import { Field, Grid, Section } from '~/components/form-layout';
import { PackageEditor } from './package-editor';
import { AttributeInput } from './attribute-input';
import { CONFIGURABLE, useListingModeState } from './use-listing-mode-state';
import { BOOKING_MODE_LABEL } from '~/constants/booking';
import { INVENTORY_UNIT_LABEL } from '~/constants/listing';
import type { DynamicState } from '../lib/listing-mode-config';

const BOOKING_MODE_HELP = {
  hourly: 'Khách chọn ngày, giờ bắt đầu và thời lượng.',
  daily: 'Khách chọn ngày nhận và ngày trả.',
  inventory: 'Khách chọn số lượng và thời gian thuê.',
} as const;

/**
 * The dynamic block of the listing form: booking-mode selection, per-mode
 * config panels, and type attributes. State + RHF mirroring live in
 * `useListingModeState`; each panel receives only its own slice.
 */
export function ListingConfig({
  form,
  listingTypes,
  listing,
  embedded = false,
}: {
  form: UseFormReturn<CreateListingInput>;
  listingTypes: ListingTypeResponse[];
  listing?: ListingResponse;
  embedded?: boolean;
}) {
  const listingTypeId = form.watch('listingTypeId');
  const selectedType = useMemo(
    () => listingTypes.find((t) => t.id === listingTypeId),
    [listingTypes, listingTypeId],
  );
  const allowedModes = (selectedType?.allowedModes ?? []).filter((m) => CONFIGURABLE.includes(m));

  const { state, set, toggleMode } = useListingModeState({
    form,
    listing,
    listingTypeId,
    selectedType,
  });
  const errors = form.formState.errors;

  return (
    <ListingConfigLayoutContext.Provider value={embedded}>
      {selectedType && selectedType.attributeSchema.length > 0 ? (
        <ConfigSection
          title="Thông tin hạng mục"
          description={`Điền các đặc điểm giúp khách hiểu và so sánh ${selectedType.itemLabel || 'hạng mục'} này.`}
        >
          <div className="space-y-6">
            {selectedType.attributeSchema.map((f) => (
              <AttributeInput
                key={f.key}
                field={f}
                value={state.attributes[f.key]}
                onChange={(v) => set('attributes', { ...state.attributes, [f.key]: v })}
              />
            ))}
          </div>
        </ConfigSection>
      ) : null}

      <ConfigSection
        title="Cách khách đặt chỗ"
        description="Chọn một hoặc nhiều hình thức. Phần giá tương ứng sẽ xuất hiện ngay bên dưới."
      >
        {allowedModes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Chọn loại dịch vụ để xem hình thức khả dụng.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {allowedModes.map((m) => (
              <label
                key={m}
                className={cn(
                  'flex min-h-20 cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors',
                  state.bookingModes.includes(m)
                    ? 'border-primary/40 bg-primary/5'
                    : 'bg-background hover:bg-muted/30',
                  allowedModes.length === 1 && 'cursor-default',
                )}
              >
                <Checkbox
                  checked={state.bookingModes.includes(m)}
                  disabled={allowedModes.length === 1}
                  onCheckedChange={(v) => toggleMode(m, v === true)}
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{BOOKING_MODE_LABEL[m]}</span>
                  <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                    {BOOKING_MODE_HELP[m as keyof typeof BOOKING_MODE_HELP]}
                  </span>
                </span>
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
      </ConfigSection>

      {state.bookingModes.includes('hourly') ? (
        <HourlyConfigSection
          value={state.hourly}
          fixedPackages={selectedType?.bookingSelection === 'fixed_packages'}
          onChange={(v) => set('hourly', v)}
        />
      ) : null}

      {state.bookingModes.includes('daily') ? (
        <DailyConfigSection
          value={state.daily}
          fixedPackages={selectedType?.bookingSelection === 'fixed_packages'}
          onChange={(v) => set('daily', v)}
        />
      ) : null}

      {state.bookingModes.includes('inventory') ? (
        <InventoryConfigSection
          value={state.inventory}
          onChange={(v) => set('inventory', v)}
          stockQuantity={state.stockQuantity}
          onStockQuantityChange={(v) => set('stockQuantity', v)}
          stockError={errors.stockQuantity ? [String(errors.stockQuantity.message)] : undefined}
        />
      ) : null}
    </ListingConfigLayoutContext.Provider>
  );
}

function HourlyConfigSection({
  value,
  fixedPackages,
  onChange,
}: {
  value: DynamicState['hourly'];
  fixedPackages: boolean;
  onChange: (value: DynamicState['hourly']) => void;
}) {
  return (
    <ConfigSection title="Cấu hình — theo giờ">
      <Grid>
        {!fixedPackages ? (
          <Field label="Giá / giờ (VND)">
            <Input
              type="number"
              min={0}
              value={value.basePrice}
              onChange={(e) => onChange({ ...value, basePrice: e.target.value })}
            />
          </Field>
        ) : null}
        <Field label="Bước (phút)">
          <Input
            type="number"
            min={1}
            value={value.granularity}
            onChange={(e) => onChange({ ...value, granularity: e.target.value })}
          />
        </Field>
        {!fixedPackages ? (
          <Field label="Tối thiểu (giờ)">
            <Input
              type="number"
              min={1}
              value={value.minDuration}
              onChange={(e) => onChange({ ...value, minDuration: e.target.value })}
            />
          </Field>
        ) : null}
        {!fixedPackages ? (
          <Field label="Tối đa (giờ)">
            <Input
              type="number"
              min={1}
              value={value.maxDuration}
              onChange={(e) => onChange({ ...value, maxDuration: e.target.value })}
            />
          </Field>
        ) : null}
        <Field label="Đặt trước tối thiểu (phút)">
          <Input
            type="number"
            min={0}
            value={value.leadTimeMin}
            onChange={(e) => onChange({ ...value, leadTimeMin: e.target.value })}
          />
        </Field>
      </Grid>
      {fixedPackages ? (
        <PackageEditor
          rows={value.packages}
          durationLabel="Thời lượng (phút)"
          durationStep={Math.max(1, Number(value.granularity) || 1)}
          onChange={(packages) => onChange({ ...value, packages })}
        />
      ) : null}
    </ConfigSection>
  );
}

function DailyConfigSection({
  value,
  fixedPackages,
  onChange,
}: {
  value: DynamicState['daily'];
  fixedPackages: boolean;
  onChange: (value: DynamicState['daily']) => void;
}) {
  return (
    <ConfigSection title="Cấu hình — theo ngày">
      <Grid>
        {!fixedPackages ? (
          <Field label="Giá / đêm (VND)">
            <Input
              type="number"
              min={0}
              value={value.basePricePerNight}
              onChange={(e) => onChange({ ...value, basePricePerNight: e.target.value })}
            />
          </Field>
        ) : null}
        {!fixedPackages ? (
          <Field label="Tối thiểu (đêm)">
            <Input
              type="number"
              min={1}
              value={value.minNights}
              onChange={(e) => onChange({ ...value, minNights: e.target.value })}
            />
          </Field>
        ) : null}
        {!fixedPackages ? (
          <Field label="Tối đa (đêm)">
            <Input
              type="number"
              min={1}
              value={value.maxNights}
              onChange={(e) => onChange({ ...value, maxNights: e.target.value })}
            />
          </Field>
        ) : null}
        <Field label="Giờ nhận">
          <Input
            type="time"
            value={value.checkinTime}
            onChange={(e) => onChange({ ...value, checkinTime: e.target.value })}
          />
        </Field>
        <Field label="Giờ trả">
          <Input
            type="time"
            value={value.checkoutTime}
            onChange={(e) => onChange({ ...value, checkoutTime: e.target.value })}
          />
        </Field>
        <Field label="Đặt trước tối thiểu (phút)">
          <Input
            type="number"
            min={0}
            value={value.leadTimeMin}
            onChange={(e) => onChange({ ...value, leadTimeMin: e.target.value })}
          />
        </Field>
      </Grid>
      {fixedPackages ? (
        <PackageEditor
          rows={value.packages}
          durationLabel="Thời lượng (ngày)"
          onChange={(packages) => onChange({ ...value, packages })}
        />
      ) : null}
    </ConfigSection>
  );
}

function InventoryConfigSection({
  value,
  onChange,
  stockQuantity,
  onStockQuantityChange,
  stockError,
}: {
  value: DynamicState['inventory'];
  onChange: (value: DynamicState['inventory']) => void;
  stockQuantity: string;
  onStockQuantityChange: (value: string) => void;
  stockError?: string[];
}) {
  const unitLower = INVENTORY_UNIT_LABEL[value.unit].toLowerCase();
  return (
    <ConfigSection
      title="Giá và số lượng cho thuê"
      description="Thiết lập đơn vị tính, giá thuê, tồn kho và các khoản bảo đảm."
    >
      <Grid>
        <Field label="Đơn vị">
          <Select
            value={value.unit}
            onValueChange={(v) => onChange({ ...value, unit: v as 'hour' | 'day' })}
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
            value={value.basePrice}
            onChange={(e) => onChange({ ...value, basePrice: e.target.value })}
          />
        </Field>
        <Field label="Tiền cọc thiết bị (VND)">
          <Input
            type="number"
            min={0}
            value={value.securityDeposit}
            onChange={(e) => onChange({ ...value, securityDeposit: e.target.value })}
          />
        </Field>
        <Field label="Số lượng trong kho" error={stockError}>
          <Input
            type="number"
            min={1}
            value={stockQuantity}
            onChange={(e) => onStockQuantityChange(e.target.value)}
          />
        </Field>
        <Field label={`Thuê tối thiểu (${unitLower})`}>
          <Input
            type="number"
            min={1}
            placeholder="Không giới hạn"
            value={value.minDuration}
            onChange={(e) => onChange({ ...value, minDuration: e.target.value })}
          />
        </Field>
        <Field label={`Thuê tối đa (${unitLower})`}>
          <Input
            type="number"
            min={1}
            placeholder="Không giới hạn"
            value={value.maxDuration}
            onChange={(e) => onChange({ ...value, maxDuration: e.target.value })}
          />
        </Field>
        <Field label={`Phí trả trễ / ${unitLower} (VND)`}>
          <Input
            type="number"
            min={0}
            placeholder="Mặc định: bằng giá thuê"
            value={value.lateFeePerUnit}
            onChange={(e) => onChange({ ...value, lateFeePerUnit: e.target.value })}
          />
        </Field>
      </Grid>
    </ConfigSection>
  );
}

const ListingConfigLayoutContext = createContext(false);

function ConfigSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const embedded = useContext(ListingConfigLayoutContext);

  if (!embedded) {
    return (
      <Section title={title} description={description}>
        {children}
      </Section>
    );
  }

  return (
    <div className="rounded-xl border bg-muted/10 p-4 sm:p-5">
      <div className="mb-4">
        <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
        {description ? (
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}
