import type { PromotionDetailResponse, PromotionResponse } from '@booking/contracts';
import { DetailSection } from '@booking/ui/components/detail/detail-section';
import { DetailGrid } from '@booking/ui/components/detail/detail-grid';
import { DetailField } from '@booking/ui/components/detail/detail-field';
import { Money } from '~/components/money';
import { DateTimeValue } from '~/components/date-time-value';
import { EnumValue } from '~/components/enum-value';
import { formatDiscount, formatNumber } from '~/lib/format';
import { SCOPE_LABELS } from '~/constants/promotion';
import { TimeWindowsSummary } from './time-windows';

/**
 * The read-only "Tóm tắt" section shared verbatim by the tenant and partner
 * promotion detail pages. Accepts the list shape; the detail shape's resolved
 * `appliesToLabel` renders alongside the scope when present.
 */
export function PromotionSummarySection({
  promotion,
}: {
  promotion: PromotionResponse & Partial<Pick<PromotionDetailResponse, 'appliesToLabel'>>;
}) {
  return (
    <DetailSection title="Tóm tắt" description="Điều kiện áp dụng của khuyến mãi.">
      <DetailGrid>
        <DetailField
          label="Giảm giá"
          emphasis="strong"
          value={formatDiscount(promotion.discountType, promotion.discountValue)}
          hint={
            promotion.discountType === 'percent'
              ? promotion.maxDiscount
                ? <>Tối đa <Money value={promotion.maxDiscount} /></>
                : 'Không giới hạn mức giảm'
              : undefined
          }
        />
        <DetailField
          label="Phạm vi"
          value={
            <span>
              <EnumValue map={SCOPE_LABELS} value={promotion.appliesTo} />
              {promotion.appliesToLabel ? (
                <span className="text-muted-foreground"> · {promotion.appliesToLabel}</span>
              ) : null}
            </span>
          }
        />
        <DetailField
          label="Thời gian áp dụng"
          value={
            promotion.startsAt || promotion.endsAt ? (
              <span className="inline-flex items-center gap-1.5">
                <DateTimeValue iso={promotion.startsAt} />
                <span className="text-muted-foreground">→</span>
                <DateTimeValue iso={promotion.endsAt} />
              </span>
            ) : (
              'Không giới hạn thời gian'
            )
          }
        />
        <DetailField
          label="Đơn tối thiểu"
          value={promotion.minOrderAmount ? <Money value={promotion.minOrderAmount} /> : 'Không yêu cầu'}
        />
        <DetailField
          label="Giới hạn tổng lượt"
          value={promotion.usageLimitTotal != null ? formatNumber(promotion.usageLimitTotal) : 'Không giới hạn'}
        />
        <DetailField
          label="Giới hạn mỗi khách"
          value={promotion.usageLimitPerCustomer != null ? formatNumber(promotion.usageLimitPerCustomer) : 'Không giới hạn'}
        />
        <DetailField label="Chỉ lần đặt đầu tiên" value={promotion.firstBookingOnly ? 'Có' : 'Không'} />
        <DetailField
          label="Hiển thị trên storefront"
          value={promotion.code && promotion.storefrontVisible ? 'Có' : 'Không'}
        />
        <DetailField label="Ngày tạo" value={<DateTimeValue iso={promotion.createdAt} relative />} />
        <DetailField
          label="Khung giờ ưu đãi (off-peak)"
          span={2}
          value={<TimeWindowsSummary windows={promotion.timeWindows} />}
        />
      </DetailGrid>
    </DetailSection>
  );
}
