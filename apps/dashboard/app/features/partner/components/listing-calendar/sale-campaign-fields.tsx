import { Input } from '@booking/ui/components/ui/input';
import { Label } from '@booking/ui/components/ui/label';

interface Props {
  /** Distinguishes ids on a page that can render more than one of these. */
  idPrefix: string;
  /** Campaign fields only mean something alongside a sale price. */
  enabled: boolean;
  initial?: { startDate?: string; endDate?: string; label?: string };
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
export function SaleCampaignFields({ idPrefix, enabled, initial }: Props) {
  if (!enabled) return null;
  return (
    <div className="space-y-3 rounded-lg border border-dashed p-3">
      <div>
        <p className="text-sm font-medium">Thời hạn khuyến mãi</p>
        <p className="text-xs text-muted-foreground">
          Tính theo lúc khách đặt. Để trống là áp mãi. Hết hạn thì quay lại giá thường của quy tắc
          này, không phải giá gốc của tin đăng.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-sale-start`}>Bắt đầu</Label>
          <Input
            id={`${idPrefix}-sale-start`}
            name="saleStartDate"
            type="date"
            defaultValue={initial?.startDate ?? ''}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-sale-end`}>Kết thúc (hết ngày này)</Label>
          <Input
            id={`${idPrefix}-sale-end`}
            name="saleEndDate"
            type="date"
            defaultValue={initial?.endDate ?? ''}
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor={`${idPrefix}-campaign-label`}>Tên đợt khuyến mãi</Label>
          <Input
            id={`${idPrefix}-campaign-label`}
            name="campaignLabel"
            maxLength={80}
            placeholder="Ví dụ: Khuyến mãi Tết"
            defaultValue={initial?.label ?? ''}
          />
        </div>
      </div>
    </div>
  );
}
