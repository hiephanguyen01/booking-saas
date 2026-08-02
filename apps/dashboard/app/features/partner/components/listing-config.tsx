import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { CreateListingInput, ListingResponse, ListingTypeResponse } from '@booking/contracts';
import { Checkbox } from '@booking/ui/components/ui/checkbox';
import { Input } from '@booking/ui/components/ui/input';
import { cn } from '@booking/ui/lib/utils';
import { useWatch, type UseFormReturn } from '@booking/ui/components/form/rhf';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@booking/ui/components/ui/select';
import { Field, Grid, Section } from '~/components/form-layout';
import { PackageEditor, type PackageEditorRowError } from './package-editor';
import { AttributeInput } from './attribute-input';
import { CONFIGURABLE, useListingModeState } from './use-listing-mode-state';
import { BOOKING_MODE_LABEL } from '~/constants/booking';
import { INVENTORY_UNIT_LABEL } from '~/constants/listing';
import type { DynamicState } from '../lib/listing-mode-config';
import { formErrorMessageAt, formErrorMessagesAt } from '~/features/partner/lib/form-errors';

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
  const listingTypeId = useWatch({ control: form.control, name: 'listingTypeId' });
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
  const { errors } = form.formState;
  const bookingModeErrors = formErrorMessagesAt(errors, ['bookingModes']);
  const modeConfigErrors = formErrorMessagesAt(errors, ['modeConfig']);

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
                error={formErrorMessageAt(errors, ['attributes', f.key])}
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
                  aria-invalid={bookingModeErrors.length > 0}
                  aria-describedby={
                    bookingModeErrors.length > 0 ? 'listing-booking-modes-error' : undefined
                  }
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
        {bookingModeErrors.length > 0 ? (
          <p id="listing-booking-modes-error" className="text-xs text-destructive" role="alert">
            {bookingModeErrors[0]}
          </p>
        ) : null}
        {modeConfigErrors.length > 0 ? (
          <p className="text-xs text-destructive" role="alert">
            {modeConfigErrors[0]}
          </p>
        ) : null}
      </ConfigSection>

      {state.bookingModes.includes('hourly') ? (
        <HourlyConfigSection
          value={state.hourly}
          fixedPackages={selectedType?.bookingSelection === 'fixed_packages'}
          onChange={(v) => set('hourly', v)}
          errors={errors}
        />
      ) : null}

      {state.bookingModes.includes('daily') ? (
        <DailyConfigSection
          value={state.daily}
          fixedPackages={selectedType?.bookingSelection === 'fixed_packages'}
          onChange={(v) => set('daily', v)}
          errors={errors}
        />
      ) : null}

      {state.bookingModes.includes('inventory') ? (
        <InventoryConfigSection
          value={state.inventory}
          onChange={(v) => set('inventory', v)}
          stockQuantity={state.stockQuantity}
          onStockQuantityChange={(v) => set('stockQuantity', v)}
          stockError={errors.stockQuantity ? [String(errors.stockQuantity.message)] : undefined}
          errors={errors}
        />
      ) : null}
    </ListingConfigLayoutContext.Provider>
  );
}

function HourlyConfigSection({
  value,
  fixedPackages,
  onChange,
  errors,
}: {
  value: DynamicState['hourly'];
  fixedPackages: boolean;
  onChange: (value: DynamicState['hourly']) => void;
  errors: unknown;
}) {
  const fieldError = (field: string) => formErrorMessageAt(errors, ['modeConfig', 'hourly', field]);
  const packageErrors: PackageEditorRowError[] = value.packages.map((_, index) => ({
    name: formErrorMessageAt(errors, ['modeConfig', 'hourly', 'packages', index, 'name']),
    duration: formErrorMessageAt(errors, [
      'modeConfig',
      'hourly',
      'packages',
      index,
      'durationMinutes',
    ]),
    price: formErrorMessageAt(errors, ['modeConfig', 'hourly', 'packages', index, 'price']),
  }));
  return (
    <ConfigSection title="Cấu hình — theo giờ">
      <Grid>
        {!fixedPackages ? (
          <Field
            label="Giá / giờ (VND)"
            htmlFor="listing-hourly-base-price"
            error={fieldError('basePrice') ? [fieldError('basePrice')!] : undefined}
            errorId="listing-hourly-base-price-error"
          >
            <Input
              id="listing-hourly-base-price"
              type="number"
              min={0}
              value={value.basePrice}
              onChange={(e) => onChange({ ...value, basePrice: e.target.value })}
              aria-invalid={Boolean(fieldError('basePrice'))}
              aria-describedby={
                fieldError('basePrice') ? 'listing-hourly-base-price-error' : undefined
              }
            />
          </Field>
        ) : null}
        <Field
          label="Bước (phút)"
          htmlFor="listing-hourly-granularity"
          error={fieldError('granularity') ? [fieldError('granularity')!] : undefined}
          errorId="listing-hourly-granularity-error"
        >
          <Input
            id="listing-hourly-granularity"
            type="number"
            min={1}
            value={value.granularity}
            onChange={(e) => onChange({ ...value, granularity: e.target.value })}
            aria-invalid={Boolean(fieldError('granularity'))}
            aria-describedby={
              fieldError('granularity') ? 'listing-hourly-granularity-error' : undefined
            }
          />
        </Field>
        {!fixedPackages ? (
          <Field
            label="Tối thiểu (giờ)"
            htmlFor="listing-hourly-min-duration"
            error={fieldError('minDuration') ? [fieldError('minDuration')!] : undefined}
            errorId="listing-hourly-min-duration-error"
          >
            <Input
              id="listing-hourly-min-duration"
              type="number"
              min={1}
              value={value.minDuration}
              onChange={(e) => onChange({ ...value, minDuration: e.target.value })}
              aria-invalid={Boolean(fieldError('minDuration'))}
              aria-describedby={
                fieldError('minDuration') ? 'listing-hourly-min-duration-error' : undefined
              }
            />
          </Field>
        ) : null}
        {!fixedPackages ? (
          <Field
            label="Tối đa (giờ)"
            htmlFor="listing-hourly-max-duration"
            error={fieldError('maxDuration') ? [fieldError('maxDuration')!] : undefined}
            errorId="listing-hourly-max-duration-error"
          >
            <Input
              id="listing-hourly-max-duration"
              type="number"
              min={1}
              value={value.maxDuration}
              onChange={(e) => onChange({ ...value, maxDuration: e.target.value })}
              aria-invalid={Boolean(fieldError('maxDuration'))}
              aria-describedby={
                fieldError('maxDuration') ? 'listing-hourly-max-duration-error' : undefined
              }
            />
          </Field>
        ) : null}
        <Field
          label="Đặt trước tối thiểu (phút)"
          htmlFor="listing-hourly-lead-time"
          error={fieldError('leadTimeMin') ? [fieldError('leadTimeMin')!] : undefined}
          errorId="listing-hourly-lead-time-error"
        >
          <Input
            id="listing-hourly-lead-time"
            type="number"
            min={0}
            value={value.leadTimeMin}
            onChange={(e) => onChange({ ...value, leadTimeMin: e.target.value })}
            aria-invalid={Boolean(fieldError('leadTimeMin'))}
            aria-describedby={
              fieldError('leadTimeMin') ? 'listing-hourly-lead-time-error' : undefined
            }
          />
        </Field>
      </Grid>
      {fixedPackages ? (
        <PackageEditor
          rows={value.packages}
          durationLabel="Thời lượng (phút)"
          durationStep={Math.max(1, Number(value.granularity) || 1)}
          onChange={(packages) => onChange({ ...value, packages })}
          errors={packageErrors}
        />
      ) : null}
    </ConfigSection>
  );
}

function DailyConfigSection({
  value,
  fixedPackages,
  onChange,
  errors,
}: {
  value: DynamicState['daily'];
  fixedPackages: boolean;
  onChange: (value: DynamicState['daily']) => void;
  errors: unknown;
}) {
  const fieldError = (field: string) => formErrorMessageAt(errors, ['modeConfig', 'daily', field]);
  const packageErrors: PackageEditorRowError[] = value.packages.map((_, index) => ({
    name: formErrorMessageAt(errors, ['modeConfig', 'daily', 'packages', index, 'name']),
    duration: formErrorMessageAt(errors, [
      'modeConfig',
      'daily',
      'packages',
      index,
      'durationDays',
    ]),
    price: formErrorMessageAt(errors, ['modeConfig', 'daily', 'packages', index, 'price']),
  }));
  return (
    <ConfigSection title="Cấu hình — theo ngày">
      <Grid>
        {!fixedPackages ? (
          <Field
            label="Giá / đêm (VND)"
            htmlFor="listing-daily-base-price"
            error={fieldError('basePricePerNight') ? [fieldError('basePricePerNight')!] : undefined}
            errorId="listing-daily-base-price-error"
          >
            <Input
              id="listing-daily-base-price"
              type="number"
              min={0}
              value={value.basePricePerNight}
              onChange={(e) => onChange({ ...value, basePricePerNight: e.target.value })}
              aria-invalid={Boolean(fieldError('basePricePerNight'))}
              aria-describedby={
                fieldError('basePricePerNight') ? 'listing-daily-base-price-error' : undefined
              }
            />
          </Field>
        ) : null}
        {!fixedPackages ? (
          <Field
            label="Tối thiểu (đêm)"
            htmlFor="listing-daily-min-nights"
            error={fieldError('minNights') ? [fieldError('minNights')!] : undefined}
            errorId="listing-daily-min-nights-error"
          >
            <Input
              id="listing-daily-min-nights"
              type="number"
              min={1}
              value={value.minNights}
              onChange={(e) => onChange({ ...value, minNights: e.target.value })}
              aria-invalid={Boolean(fieldError('minNights'))}
              aria-describedby={
                fieldError('minNights') ? 'listing-daily-min-nights-error' : undefined
              }
            />
          </Field>
        ) : null}
        {!fixedPackages ? (
          <Field
            label="Tối đa (đêm)"
            htmlFor="listing-daily-max-nights"
            error={fieldError('maxNights') ? [fieldError('maxNights')!] : undefined}
            errorId="listing-daily-max-nights-error"
          >
            <Input
              id="listing-daily-max-nights"
              type="number"
              min={1}
              value={value.maxNights}
              onChange={(e) => onChange({ ...value, maxNights: e.target.value })}
              aria-invalid={Boolean(fieldError('maxNights'))}
              aria-describedby={
                fieldError('maxNights') ? 'listing-daily-max-nights-error' : undefined
              }
            />
          </Field>
        ) : null}
        <Field
          label="Giờ nhận"
          htmlFor="listing-daily-checkin"
          error={fieldError('checkinTime') ? [fieldError('checkinTime')!] : undefined}
          errorId="listing-daily-checkin-error"
        >
          <Input
            id="listing-daily-checkin"
            type="time"
            value={value.checkinTime}
            onChange={(e) => onChange({ ...value, checkinTime: e.target.value })}
            aria-invalid={Boolean(fieldError('checkinTime'))}
            aria-describedby={fieldError('checkinTime') ? 'listing-daily-checkin-error' : undefined}
          />
        </Field>
        <Field
          label="Giờ trả"
          htmlFor="listing-daily-checkout"
          error={fieldError('checkoutTime') ? [fieldError('checkoutTime')!] : undefined}
          errorId="listing-daily-checkout-error"
        >
          <Input
            id="listing-daily-checkout"
            type="time"
            value={value.checkoutTime}
            onChange={(e) => onChange({ ...value, checkoutTime: e.target.value })}
            aria-invalid={Boolean(fieldError('checkoutTime'))}
            aria-describedby={
              fieldError('checkoutTime') ? 'listing-daily-checkout-error' : undefined
            }
          />
        </Field>
        <Field
          label="Đặt trước tối thiểu (phút)"
          htmlFor="listing-daily-lead-time"
          error={fieldError('leadTimeMin') ? [fieldError('leadTimeMin')!] : undefined}
          errorId="listing-daily-lead-time-error"
        >
          <Input
            id="listing-daily-lead-time"
            type="number"
            min={0}
            value={value.leadTimeMin}
            onChange={(e) => onChange({ ...value, leadTimeMin: e.target.value })}
            aria-invalid={Boolean(fieldError('leadTimeMin'))}
            aria-describedby={
              fieldError('leadTimeMin') ? 'listing-daily-lead-time-error' : undefined
            }
          />
        </Field>
      </Grid>
      {fixedPackages ? (
        <PackageEditor
          rows={value.packages}
          durationLabel="Thời lượng (ngày)"
          onChange={(packages) => onChange({ ...value, packages })}
          errors={packageErrors}
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
  errors,
}: {
  value: DynamicState['inventory'];
  onChange: (value: DynamicState['inventory']) => void;
  stockQuantity: string;
  onStockQuantityChange: (value: string) => void;
  stockError?: string[];
  errors: unknown;
}) {
  const unitLower = INVENTORY_UNIT_LABEL[value.unit].toLowerCase();
  const fieldError = (field: string) =>
    formErrorMessageAt(errors, ['modeConfig', 'inventory', field]);
  return (
    <ConfigSection
      title="Giá và số lượng cho thuê"
      description="Thiết lập đơn vị tính, giá thuê, tồn kho và các khoản bảo đảm."
    >
      <Grid>
        <Field label="Đơn vị" htmlFor="listing-inventory-unit">
          <Select
            value={value.unit}
            onValueChange={(v) => onChange({ ...value, unit: v as 'hour' | 'day' })}
          >
            <SelectTrigger id="listing-inventory-unit" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="day">Ngày</SelectItem>
              <SelectItem value="hour">Giờ</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field
          label="Giá / đơn vị (VND)"
          htmlFor="listing-inventory-base-price"
          error={fieldError('basePrice') ? [fieldError('basePrice')!] : undefined}
          errorId="listing-inventory-base-price-error"
        >
          <Input
            id="listing-inventory-base-price"
            type="number"
            min={0}
            value={value.basePrice}
            onChange={(e) => onChange({ ...value, basePrice: e.target.value })}
            aria-invalid={Boolean(fieldError('basePrice'))}
            aria-describedby={
              fieldError('basePrice') ? 'listing-inventory-base-price-error' : undefined
            }
          />
        </Field>
        <Field
          label="Tiền cọc cho thuê (VND)"
          htmlFor="listing-inventory-security-deposit"
          error={fieldError('securityDeposit') ? [fieldError('securityDeposit')!] : undefined}
          errorId="listing-inventory-security-deposit-error"
        >
          <Input
            id="listing-inventory-security-deposit"
            type="number"
            min={0}
            value={value.securityDeposit}
            onChange={(e) => onChange({ ...value, securityDeposit: e.target.value })}
            aria-invalid={Boolean(fieldError('securityDeposit'))}
            aria-describedby={
              fieldError('securityDeposit') ? 'listing-inventory-security-deposit-error' : undefined
            }
          />
        </Field>
        <Field
          label="Số lượng trong kho"
          htmlFor="listing-inventory-stock"
          error={stockError}
          errorId="listing-inventory-stock-error"
        >
          <Input
            id="listing-inventory-stock"
            type="number"
            min={1}
            value={stockQuantity}
            onChange={(e) => onStockQuantityChange(e.target.value)}
            aria-invalid={Boolean(stockError?.length)}
            aria-describedby={stockError?.length ? 'listing-inventory-stock-error' : undefined}
          />
        </Field>
        <Field
          label={`Thuê tối thiểu (${unitLower})`}
          htmlFor="listing-inventory-min-duration"
          error={fieldError('minDuration') ? [fieldError('minDuration')!] : undefined}
          errorId="listing-inventory-min-duration-error"
        >
          <Input
            id="listing-inventory-min-duration"
            type="number"
            min={1}
            placeholder="Không giới hạn"
            value={value.minDuration}
            onChange={(e) => onChange({ ...value, minDuration: e.target.value })}
            aria-invalid={Boolean(fieldError('minDuration'))}
            aria-describedby={
              fieldError('minDuration') ? 'listing-inventory-min-duration-error' : undefined
            }
          />
        </Field>
        <Field
          label={`Thuê tối đa (${unitLower})`}
          htmlFor="listing-inventory-max-duration"
          error={fieldError('maxDuration') ? [fieldError('maxDuration')!] : undefined}
          errorId="listing-inventory-max-duration-error"
        >
          <Input
            id="listing-inventory-max-duration"
            type="number"
            min={1}
            placeholder="Không giới hạn"
            value={value.maxDuration}
            onChange={(e) => onChange({ ...value, maxDuration: e.target.value })}
            aria-invalid={Boolean(fieldError('maxDuration'))}
            aria-describedby={
              fieldError('maxDuration') ? 'listing-inventory-max-duration-error' : undefined
            }
          />
        </Field>
        <Field
          label={`Phí trả trễ / ${unitLower} (VND)`}
          htmlFor="listing-inventory-late-fee"
          error={fieldError('lateFeePerUnit') ? [fieldError('lateFeePerUnit')!] : undefined}
          errorId="listing-inventory-late-fee-error"
        >
          <Input
            id="listing-inventory-late-fee"
            type="number"
            min={0}
            placeholder="Mặc định: bằng giá thuê"
            value={value.lateFeePerUnit}
            onChange={(e) => onChange({ ...value, lateFeePerUnit: e.target.value })}
            aria-invalid={Boolean(fieldError('lateFeePerUnit'))}
            aria-describedby={
              fieldError('lateFeePerUnit') ? 'listing-inventory-late-fee-error' : undefined
            }
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
