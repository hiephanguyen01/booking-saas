import type { ListingPartnerSummary } from '@booking/contracts';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@booking/ui/components/ui/card';
import { DetailGrid } from '@booking/ui/components/detail/detail-grid';
import { DetailField } from '@booking/ui/components/detail/detail-field';
import { EntityRef } from '~/components/entity-ref';
import { PartnerVerificationBadge } from '~/components/status-badge';
import { dashboardPaths } from '~/constants/paths';

/**
 * "Đối tác" card on the moderation review pages: who owns the entity under
 * review, with the identity-verification badge. The group page derives the
 * summary from its first child listing, so `partner` may be null there.
 */
export function PartnerSummaryCard({
  partnerId,
  partner,
  description,
}: {
  partnerId: string;
  partner: ListingPartnerSummary | null;
  description: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Đối tác</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <DetailGrid>
          <DetailField
            label="Tên đối tác"
            value={
              <EntityRef to={dashboardPaths.tenant.partner(partnerId)} name={partner?.name ?? 'Xem đối tác'} />
            }
          />
          <DetailField
            label="Xác minh danh tính"
            value={partner ? <PartnerVerificationBadge status={partner.verificationStatus} /> : null}
          />
        </DetailGrid>
      </CardContent>
    </Card>
  );
}
