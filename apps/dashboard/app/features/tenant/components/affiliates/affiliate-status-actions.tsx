import { useFetcher } from 'react-router';
import type { AffiliateDetailResponse } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import { Ban, Check } from 'lucide-react';
import type { AffiliateDetailActionData } from './types';

/** Approve/suspend toggle — posts `intent=status` to the detail route's action. */
export function AffiliateStatusActions({
  affiliate,
}: {
  affiliate: AffiliateDetailResponse['affiliate'];
}) {
  const fetcher = useFetcher<AffiliateDetailActionData>();
  const busy = fetcher.state !== 'idle';
  const next = affiliate.status === 'approved' ? 'suspended' : 'approved';

  return (
    <fetcher.Form method="post">
      <input type="hidden" name="intent" value="status" />
      <input type="hidden" name="status" value={next} />
      {next === 'approved' ? (
        <Button type="submit" size="sm" disabled={busy}>
          <Check className="size-4" /> Duyệt
        </Button>
      ) : (
        <Button type="submit" variant="outline" size="sm" disabled={busy}>
          <Ban className="size-4" /> Tạm ngưng
        </Button>
      )}
    </fetcher.Form>
  );
}
