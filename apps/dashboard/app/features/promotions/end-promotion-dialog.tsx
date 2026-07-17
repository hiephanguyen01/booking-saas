import { useSubmit } from 'react-router';
import { Ban } from 'lucide-react';
import { Button } from '@booking/ui/components/ui/button';
import { ConfirmButton } from '~/components/confirm-button';

/**
 * "Kết thúc khuyến mãi" gated behind the shared confirm dialog, submitting the
 * `end` intent to the surrounding route's action. One component for both the
 * tenant and partner detail pages (the two copies had drifted-in-waiting).
 */
export function EndPromotionDialog({ busy }: { busy: boolean }) {
  const submit = useSubmit();
  return (
    <ConfirmButton
      trigger={
        <Button variant="destructive" disabled={busy}>
          <Ban className="size-4" /> Kết thúc khuyến mãi
        </Button>
      }
      title="Kết thúc khuyến mãi?"
      description="Thao tác này không thể hoàn tác — mã sẽ ngừng vĩnh viễn và khách hàng không thể dùng nữa."
      confirmLabel="Kết thúc"
      busy={busy}
      onConfirm={() => void submit({ intent: 'end' }, { method: 'post' })}
    />
  );
}
