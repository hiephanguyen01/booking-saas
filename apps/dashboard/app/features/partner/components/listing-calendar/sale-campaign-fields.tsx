import { Input } from '@booking/ui/components/ui/input';
import { Label } from '@booking/ui/components/ui/label';

interface Props {
  /** Distinguishes ids on a page that can render more than one of these. */
  idPrefix: string;
  /** Campaign fields only mean something alongside a sale price. */
  enabled: boolean;
  value: SaleCampaignValue;
  onChange: (value: SaleCampaignValue) => void;
}

export interface SaleCampaignValue {
  startDate: string;
  endDate: string;
  label: string;
}

/**
 * Optional window and name for a sale price.
 *
 * The window is judged at BOOKING time — "book before 31/12 for this price" —
 * which is what makes it a campaign rather than a discount on particular stay
 * dates (that is already a `date_range` rule). Outside the window the rule keeps
 * charging its regular price, so ending a campaign never drops a listing back to
 * its base rate unexpectedly.
 *
 * Hidden until a sale price is entered: a window bounding nothing is noise.
 */
export function SaleCampaignFields({ idPrefix, enabled, value, onChange }: Props) {
  if (!enabled) {
    return (
      <>
        <input type="hidden" name="saleStartDate" value="" />
        <input type="hidden" name="saleEndDate" value="" />
        <input type="hidden" name="campaignLabel" value="" />
      </>
    );
  }
  return (
    <div className="space-y-3 rounded-lg border border-warning/30 bg-warning/5 p-3">
      <div>
        <p className="text-sm font-medium">Chiến dịch giá ưu đãi</p>
        <p className="text-xs text-muted-foreground">
          Thời hạn được xét theo lúc khách hoàn tất đặt chỗ, không phải ngày sử dụng dịch vụ. Để
          trống là áp dụng không giới hạn.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-sale-start`}>Bắt đầu</Label>
          <Input
            id={`${idPrefix}-sale-start`}
            name="saleStartDate"
            type="date"
            value={value.startDate}
            onChange={(event) => onChange({ ...value, startDate: event.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-sale-end`}>Kết thúc (hết ngày này)</Label>
          <Input
            id={`${idPrefix}-sale-end`}
            name="saleEndDate"
            type="date"
            min={value.startDate || undefined}
            value={value.endDate}
            onChange={(event) => onChange({ ...value, endDate: event.target.value })}
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor={`${idPrefix}-campaign-label`}>Tên chiến dịch</Label>
          <Input
            id={`${idPrefix}-campaign-label`}
            name="campaignLabel"
            maxLength={80}
            placeholder="Ví dụ: Giá tốt mùa hè"
            value={value.label}
            onChange={(event) => onChange({ ...value, label: event.target.value })}
          />
        </div>
      </div>
    </div>
  );
}
