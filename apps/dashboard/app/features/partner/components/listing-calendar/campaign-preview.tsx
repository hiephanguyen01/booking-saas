import { Badge } from '@booking/ui/components/ui/badge';
import { cn } from '@booking/ui/lib/utils';
import { CalendarClock, Flame, Tag, Timer } from 'lucide-react';
import { Money } from '~/components/money';

interface Props {
  regularPrice: string;
  salePrice: string;
  campaignLabel: string;
  ruleScopeDescription: string;
  startDate: string;
  endDate: string;
}

function discountPercent(regularValue: string, saleValue: string): number | null {
  if (!/^\d+$/.test(regularValue) || !/^\d+$/.test(saleValue)) return null;
  const regular = BigInt(regularValue);
  const sale = BigInt(saleValue);
  if (regular <= 0n || sale <= 0n || sale >= regular) return null;
  return Math.max(1, Number(((regular - sale) * 100n + regular / 2n) / regular));
}

function dayLabel(value: string): string {
  if (!value) return '';
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

/** Customer-facing C3 campaign card, shown to the partner before saving. */
export function CampaignPreview({
  regularPrice,
  salePrice,
  campaignLabel,
  ruleScopeDescription,
  startDate,
  endDate,
}: Props) {
  const percent = discountPercent(regularPrice, salePrice);

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">Khách hàng sẽ thấy</p>
      {percent === null ? (
        <div className="flex items-center gap-2 rounded-lg border border-dashed bg-muted/20 px-3 py-4 text-sm text-muted-foreground">
          <Tag className="size-4 shrink-0" aria-hidden />
          Nhập giá ưu đãi để xem trước
        </div>
      ) : (
        <div className="relative overflow-hidden rounded-lg border border-warning/40 bg-warning/10 text-warning-foreground">
          <div className="flex min-h-9 w-fit items-center bg-warning py-1 pr-5 pl-3 text-xs font-bold [clip-path:polygon(0_0,100%_0,86%_50%,100%_100%,0_100%)]">
            Giảm đến {percent}%
          </div>
          <div className="flex items-start gap-3 px-3 pt-3 pb-4">
            <Flame className="mt-0.5 size-5 shrink-0" aria-hidden />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant="outline"
                  className="max-w-full rounded-sm border-warning/40 bg-warning/15 text-warning-foreground"
                >
                  <span className="truncate">{campaignLabel.trim() || 'Đang giảm giá'}</span>
                </Badge>
                <span className="text-xs text-muted-foreground">
                  <Money value={regularPrice} className="line-through" />{' '}
                  <Money value={salePrice} className="font-semibold text-warning-foreground" />
                </span>
              </div>
              <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <CalendarClock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                {ruleScopeDescription}
              </p>
              <p
                className={cn(
                  'flex items-start gap-1.5 text-xs',
                  endDate ? 'font-medium text-warning-foreground' : 'text-muted-foreground',
                )}
              >
                <Timer className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                {startDate && endDate
                  ? `Đặt từ ${dayLabel(startDate)} đến hết ${dayLabel(endDate)}`
                  : startDate
                    ? `Bắt đầu nhận giá ưu đãi từ ${dayLabel(startDate)}`
                    : endDate
                      ? `Đặt trước hết ngày ${dayLabel(endDate)}`
                      : 'Không giới hạn thời gian đặt'}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
