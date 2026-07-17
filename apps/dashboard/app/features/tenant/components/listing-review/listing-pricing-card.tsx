import type { BookingMode, ListingResponse } from '@booking/contracts';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@booking/ui/components/ui/card';
import { DetailSection } from '@booking/ui/components/detail/detail-section';
import { DetailGrid } from '@booking/ui/components/detail/detail-grid';
import { DetailField } from '@booking/ui/components/detail/detail-field';
import { DetailRow } from '@booking/ui/components/detail/detail-row';
import { BOOKING_MODE_LABEL } from '~/constants/booking';
import { INVENTORY_UNIT_LABEL } from '~/constants/listing';
import { asRecord, readNumber } from '~/lib/records';
import { Money } from '~/components/money';
import { EnumValue } from '~/components/enum-value';

// ── mode_config readers (the stored config is free-form JSON) ─────────────────
// `readStr` deliberately stays local: unlike `readString` in ~/lib/records it
// also stringifies finite numbers (a price may be stored either way).

function readStr(value: unknown): string | null {
  if (typeof value === 'string' && value !== '') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

function numUnit(value: unknown, unit: string): string | null {
  const n = readNumber(value);
  return n === null ? null : `${n} ${unit}`;
}

function readInventoryUnit(value: unknown): 'hour' | 'day' | null {
  return value === 'hour' || value === 'day' ? value : null;
}

/** "Giá & hình thức đặt" — every priced mode_config a reviewer must approve. */
export function ListingPricingCard({ listing }: { listing: ListingResponse }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Giá &amp; hình thức đặt</CardTitle>
        <CardDescription>Toàn bộ cấu hình giá mà khách sẽ bị tính.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {listing.bookingModes.map((mode) => (
          <ModeBlock key={mode} mode={mode} config={asRecord(listing.modeConfig[mode])} />
        ))}
      </CardContent>
    </Card>
  );
}

function ModeBlock({
  mode,
  config,
}: {
  mode: BookingMode;
  config: Record<string, unknown> | null;
}) {
  return (
    <DetailSection title={BOOKING_MODE_LABEL[mode]} emptyMessage="Chưa cấu hình giá cho hình thức này.">
      {config ? <ModeFields mode={mode} config={config} /> : null}
    </DetailSection>
  );
}

function ModeFields({ mode, config }: { mode: BookingMode; config: Record<string, unknown> }) {
  if (mode === 'hourly') {
    return (
      <div className="space-y-3">
        <DetailGrid columns={3}>
          <DetailField
            label="Giá cơ bản"
            emphasis="strong"
            hint="mỗi giờ"
            value={<Money value={readStr(config.basePrice)} />}
          />
          <DetailField label="Thời lượng tối thiểu" value={numUnit(config.minDuration, 'giờ')} />
          <DetailField label="Thời lượng tối đa" value={numUnit(config.maxDuration, 'giờ')} />
          <DetailField label="Bước đặt" value={numUnit(config.granularity, 'phút')} />
          <DetailField label="Đặt trước tối thiểu" value={numUnit(config.leadTimeMin, 'phút')} />
        </DetailGrid>
        <PriceBlocks blocks={config.blocks} unitKey="hours" unitLabel="giờ" />
      </div>
    );
  }
  if (mode === 'daily') {
    return (
      <div className="space-y-3">
        <DetailGrid columns={3}>
          <DetailField
            label="Giá mỗi đêm"
            emphasis="strong"
            value={<Money value={readStr(config.basePricePerNight)} />}
          />
          <DetailField label="Số đêm tối thiểu" value={numUnit(config.minNights, 'đêm')} />
          <DetailField label="Số đêm tối đa" value={numUnit(config.maxNights, 'đêm')} />
          <DetailField label="Giờ nhận phòng" value={readStr(config.checkinTime)} />
          <DetailField label="Giờ trả phòng" value={readStr(config.checkoutTime)} />
          <DetailField label="Đặt trước tối thiểu" value={numUnit(config.leadTimeMin, 'phút')} />
        </DetailGrid>
        <PriceBlocks blocks={config.blocks} unitKey="days" unitLabel="đêm" />
      </div>
    );
  }
  if (mode === 'inventory') {
    const unit = readInventoryUnit(config.unit);
    const unitWord = unit === 'day' ? 'ngày' : 'giờ';
    const lateFee = readStr(config.lateFeePerUnit) ?? readStr(config.basePrice);
    return (
      <DetailGrid columns={3}>
        <DetailField
          label="Đơn vị thuê"
          value={unit ? <EnumValue map={INVENTORY_UNIT_LABEL} value={unit} /> : null}
        />
        <DetailField
          label="Giá thuê"
          emphasis="strong"
          hint={`mỗi ${unitWord}`}
          value={<Money value={readStr(config.basePrice)} />}
        />
        <DetailField label="Tiền cọc" value={<Money value={readStr(config.securityDeposit)} />} />
        <DetailField label="Tối thiểu" value={numUnit(config.minDuration, unitWord)} omitWhenEmpty />
        <DetailField label="Tối đa" value={numUnit(config.maxDuration, unitWord)} omitWhenEmpty />
        <DetailField
          label="Phí trả trễ"
          hint={`mỗi ${unitWord} quá hạn`}
          value={lateFee ? <Money value={lateFee} /> : null}
        />
      </DetailGrid>
    );
  }
  // appointment / class carry no priced mode_config in Phase 1.
  return <p className="text-sm text-muted-foreground">Hình thức này chưa có cấu hình giá riêng.</p>;
}

function PriceBlocks({
  blocks,
  unitKey,
  unitLabel,
}: {
  blocks: unknown;
  unitKey: 'hours' | 'days';
  unitLabel: string;
}) {
  const rows = (Array.isArray(blocks) ? blocks : [])
    .map(asRecord)
    .map((r) => (r ? { n: readNumber(r[unitKey]), price: readStr(r.price) } : null))
    .filter((r): r is { n: number; price: string } => r !== null && r.n !== null && r.price !== null);
  if (rows.length === 0) return null;
  return (
    <div className="space-y-1.5 pt-1">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Gói ưu đãi</p>
      {rows.map((r, i) => (
        <DetailRow key={i} label={`${r.n} ${unitLabel}`} value={<Money value={r.price} />} />
      ))}
    </div>
  );
}
