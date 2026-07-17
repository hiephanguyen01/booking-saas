import { Form, useSubmit } from 'react-router';
import type { PartnerResponse } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@booking/ui/components/ui/card';
import { Textarea } from '@booking/ui/components/ui/textarea';
import { BadgeCheck, Ban, Check } from 'lucide-react';
import { ConfirmButton } from '~/components/confirm-button';
import { useBusy } from '~/hooks/use-busy';

/**
 * The tenant's moderation actions on a partner, gated by state + permission:
 * approve a pending application, verify submitted identity documents, and
 * suspend an approved partner (behind a confirmation dialog).
 *
 * Submits to the containing route's action with `intent` = approve|verify|suspend.
 */
export function PartnerModerationActions({
  partner,
  canApprove,
  canManage,
}: {
  partner: PartnerResponse;
  canApprove: boolean;
  canManage: boolean;
}) {
  const submit = useSubmit();
  const busy = useBusy();

  return (
    <>
      {/* Approve a pending application. */}
      {partner.status === 'pending' && canApprove ? (
        <Card>
          <CardHeader>
            <CardTitle>Duyệt đối tác</CardTitle>
            <CardDescription>
              Chấp thuận đối tác tham gia marketplace — họ sẽ có thể đăng listing.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form method="post">
              <input type="hidden" name="intent" value="approve" />
              <Button type="submit" disabled={busy}>
                <Check className="size-4" /> Duyệt đối tác
              </Button>
            </Form>
          </CardContent>
        </Card>
      ) : null}

      {/* Manual identity review once the partner has submitted documents. */}
      {partner.verificationStatus === 'pending' && canApprove ? (
        <Card>
          <CardHeader>
            <CardTitle>Xác minh danh tính</CardTitle>
            <CardDescription>
              Đối chiếu giấy tờ đã nộp. Hệ thống sẽ từ chối nếu dưới 18 tuổi hoặc tên không khớp.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form method="post" className="space-y-3">
              <input type="hidden" name="intent" value="verify" />
              <Textarea name="note" placeholder="Ghi chú xét duyệt (tuỳ chọn)…" rows={2} />
              <Button type="submit" disabled={busy}>
                <BadgeCheck className="size-4" /> Xác minh danh tính
              </Button>
            </Form>
          </CardContent>
        </Card>
      ) : null}

      {/* Suspend an approved partner — behind a confirmation dialog. */}
      {partner.status === 'approved' && canManage ? (
        <Card>
          <CardHeader>
            <CardTitle>Tạm ngưng đối tác</CardTitle>
            <CardDescription>
              Ẩn listing của đối tác khỏi storefront và chặn nhận đặt chỗ mới.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ConfirmButton
              trigger={
                <Button variant="destructive" disabled={busy}>
                  <Ban className="size-4" /> Tạm ngưng
                </Button>
              }
              title="Tạm ngưng đối tác này?"
              description="Listing của đối tác sẽ bị ẩn khỏi storefront và không nhận đặt chỗ mới cho tới khi được khôi phục."
              confirmLabel="Tạm ngưng"
              busy={busy}
              onConfirm={() => void submit({ intent: 'suspend' }, { method: 'post' })}
            />
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
