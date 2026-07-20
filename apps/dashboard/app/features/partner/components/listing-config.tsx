import { useMemo } from 'react';
import type { CreateListingInput, ListingResponse, ListingTypeResponse } from '@booking/contracts';
import { Checkbox } from '@booking/ui/components/ui/checkbox';
import { Input } from '@booking/ui/components/ui/input';
import type { UseFormReturn } from '@booking/ui/components/form/rhf';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@booking/ui/components/ui/select';
import { Section, Grid, Field } from './form-layout';
import { PackageEditor } from './package-editor';
import { AttributeInput } from './attribute-input';
import { CONFIGURABLE, useListingModeState } from './use-listing-mode-state';
import { BOOKING_MODE_LABEL } from '~/constants/booking';
import { INVENTORY_UNIT_LABEL } from '~/constants/listing';
import type { DynamicState } from '../lib/listing-mode-config';

/**
 * The dynamic block of the listing form: booking-mode selection, per-mode
 * config panels, and type attributes. State + RHF mirroring live in
 * `useListingModeState`; each panel receives only its own slice.
 */
export function ListingConfig({
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

  const { state, set, toggleMode } = useListingModeState({
    form,
    listing,
    listingTypeId,
    selectedType,
  });
  const errors = form.formState.errors;

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
    <Section title="Cấu hình — theo giờ">
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
    </Section>
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
    <Section title="Cấu hình — theo ngày">
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
    </Section>
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
    <Section title="Cấu hình — theo kho">
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
    </Section>
  );
}
