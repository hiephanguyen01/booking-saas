import { Link } from 'react-router';
import { Button } from '@booking/ui/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@booking/ui/components/ui/card';
import { ScrollText } from 'lucide-react';
import { dashboardPaths } from '~/constants/paths';
import { WarningCallout } from '~/components/warning-callout';

/**
 * A dark storefront outranks a subscription snapshot (Task 15): rendered above
 * `SubscriptionStatusCard` whenever the tenant hasn't published all four
 * required legal documents in its default language. No fetch of its own — the
 * loader already reads `legalReady`/`legalDocumentsReady` off
 * `/tenant/subscription/status` for the subscription card.
 */
export function LegalReadinessCard({
  published,
  required,
}: {
  published: number;
  required: number;
}) {
  const missing = Math.max(required - published, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ScrollText className="size-4 text-warning" aria-hidden="true" /> Storefront chưa lên sóng
        </CardTitle>
        <CardDescription>
          Cần công bố đủ {required} tài liệu pháp lý bắt buộc ở ngôn ngữ mặc định trước khi khách truy
          cập được cửa hàng.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <WarningCallout>
          <p>{`Storefront chưa lên sóng — còn thiếu ${missing}/${required} tài liệu.`}</p>
        </WarningCallout>
        <Button asChild size="sm" className="w-full">
          <Link to={dashboardPaths.tenant.settingsSection('legal')}>
            <ScrollText className="size-4" /> Soạn tài liệu pháp lý
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
