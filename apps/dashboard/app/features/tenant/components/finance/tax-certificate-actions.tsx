import type { TaxWithholdingCertificateResponse } from '@booking/contracts';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@booking/ui/components/ui/alert-dialog';
import { Button } from '@booking/ui/components/ui/button';
import { Label } from '@booking/ui/components/ui/label';
import { Textarea } from '@booking/ui/components/ui/textarea';
import { Ban, ExternalLink } from 'lucide-react';
import { useState } from 'react';
import { Link, useFetcher } from 'react-router';
import { ErrorBanner, SuccessBanner } from '~/components/action-feedback';
import { dashboardPaths } from '~/constants/paths';

interface ActionResult {
  error?: string;
  message?: string;
}

export function TaxCertificateActions({
  certificate,
  canManage,
}: {
  certificate: TaxWithholdingCertificateResponse;
  canManage: boolean;
}) {
  const fetcher = useFetcher<ActionResult>();
  const [reason, setReason] = useState('');
  const busy = fetcher.state !== 'idle';
  const canView = certificate.status === 'issued' || certificate.status === 'voided';

  return (
    <div className="space-y-2">
      <div className="flex justify-end gap-2">
        {canView ? (
          <Button asChild size="sm" variant="outline">
            <Link
              to={dashboardPaths.tenant.taxCertificateDownload(certificate.id)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink className="size-4" /> PDF
            </Link>
          </Button>
        ) : null}
        {canManage && certificate.status === 'issued' ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="destructive">
                <Ban className="size-4" /> Huỷ
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Huỷ chứng từ {certificate.certificateNumber}</AlertDialogTitle>
                <AlertDialogDescription>
                  Bản PDF và checksum cũ vẫn được giữ để kiểm toán. Sau khi huỷ, hãy tải tệp mới để
                  phát hành phiên bản thay thế.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="grid gap-2">
                <Label htmlFor={`void-reason-${certificate.id}`}>Lý do huỷ</Label>
                <Textarea
                  id={`void-reason-${certificate.id}`}
                  value={reason}
                  onChange={(event) => setReason(event.currentTarget.value)}
                  minLength={10}
                  maxLength={500}
                  rows={3}
                  placeholder="Ví dụ: Sai số chứng từ, cần phát hành lại bản đã điều chỉnh."
                />
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel>Đóng</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  disabled={busy || reason.trim().length < 10}
                  onClick={() =>
                    fetcher.submit(
                      { intent: 'void-certificate', certificateId: certificate.id, reason },
                      { method: 'post' },
                    )
                  }
                >
                  {busy ? 'Đang huỷ…' : 'Xác nhận huỷ'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : null}
      </div>
      <ErrorBanner error={fetcher.data?.error} />
      <SuccessBanner message={fetcher.data?.message} />
    </div>
  );
}
