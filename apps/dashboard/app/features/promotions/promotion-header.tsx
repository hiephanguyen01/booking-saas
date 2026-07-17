import type { PromotionResponse } from '@booking/contracts';
import { CopyableCode } from '~/components/copyable-code';
import { PromotionStatusBadge } from '~/components/status-badge';

/** Detail-page header: name, copyable code (or the auto-apply note) and status badge. */
export function PromotionHeader({
  promotion,
}: {
  promotion: Pick<PromotionResponse, 'name' | 'code' | 'status'>;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">{promotion.name}</h1>
        {promotion.code ? (
          <CopyableCode value={promotion.code} label="mã khuyến mãi" />
        ) : (
          <p className="text-sm text-muted-foreground">Tự động áp dụng — không cần mã.</p>
        )}
      </div>
      <PromotionStatusBadge status={promotion.status} />
    </div>
  );
}
