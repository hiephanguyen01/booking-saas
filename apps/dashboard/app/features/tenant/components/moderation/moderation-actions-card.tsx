import { useState } from 'react';
import { useSubmit } from 'react-router';
import type { ModerationActor, PublishStatus } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@booking/ui/components/ui/card';
import { Checkbox } from '@booking/ui/components/ui/checkbox';
import { Separator } from '@booking/ui/components/ui/separator';
import { Textarea } from '@booking/ui/components/ui/textarea';
import { Check, EyeOff } from 'lucide-react';
import { ConfirmButton } from '~/components/confirm-button';
import { EntityRef } from '~/components/entity-ref';
import { WarningCallout } from '~/components/warning-callout';

export interface ModerationActionsCardProps {
  /** Drives the generated moderation copy — the noun interpolated into confirm/label text (e.g. 'tin đăng'). */
  entityLabel: 'tin đăng';
  /** Card sub-caption (per-page wording). */
  cardDescription: string;
  status: PublishStatus;
  hiddenBy: ModerationActor | null;
  /** All review gates passed — publish needs no override. */
  canPublish: boolean;
  hasContactLeak: boolean;
  /**
   * The checklist itself could not be loaded (group page only) — the override
   * copy then reads "chưa xác minh được checklist" instead of "checklist chưa đạt".
   */
  reviewUnverified?: boolean;
  /**
   * Whether this page exposes the republish (re-open) action for an archived
   * entity. The listing review page does; the group review page does not — an
   * archived group is reopened from the list page instead, and its route action
   * rejects the intent, so no button is rendered here.
   */
  supportsRepublish: boolean;
  /** Publish confirm-dialog body when publishing cleanly (no override). */
  publishDescription: string;
  /** Hide confirm-dialog body when hiding a `published` entity. */
  hidePublishedDescription: string;
  /**
   * Set for a grouped child listing: the review page of its parent post. The
   * card then only links there — the backend rejects direct moderation of a
   * group-managed child (GROUP_MANAGED_LISTING).
   */
  managedByGroupHref?: string | null;
  busy: boolean;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * The moderation decision card shared by the listing and listing-group review
 * pages. Submits `{ intent, force?, reason? }` as a POST navigation to the
 * hosting route's own `action` (see `runModerationAction`) — no coupling to a
 * route module's `typeof action`.
 */
export function ModerationActionsCard({
  entityLabel,
  cardDescription,
  status,
  hiddenBy,
  canPublish,
  hasContactLeak,
  reviewUnverified = false,
  supportsRepublish,
  publishDescription,
  hidePublishedDescription,
  managedByGroupHref = null,
  busy,
}: ModerationActionsCardProps) {
  const submit = useSubmit();
  const [force, setForce] = useState(false);
  const [reason, setReason] = useState('');
  const entity = capitalize(entityLabel);
  const canHide = status === 'published' || status === 'pending_review';

  // A grouped listing is moderated as part of its parent post — the backend
  // rejects publish/hide/republish on the child (GROUP_MANAGED_LISTING).
  if (managedByGroupHref) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Hành động kiểm duyệt</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Tin đăng này thuộc một tin đăng nhiều hạng mục và được kiểm duyệt cùng tin đăng đó.{' '}
            <EntityRef to={managedByGroupHref} name="Kiểm duyệt tin đăng nhiều hạng mục" />.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Hành động kiểm duyệt</CardTitle>
        <CardDescription>{cardDescription}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {status === 'draft' ? (
          <p className="text-sm text-muted-foreground">
            {entity} đang ở trạng thái nháp — đối tác chưa gửi duyệt nên chưa thể xuất bản.
          </p>
        ) : null}

        {status === 'pending_review' ? (
          <div className="space-y-3">
            {!canPublish ? (
              <WarningCallout>
                <label className="flex items-start gap-2.5">
                  <Checkbox
                    checked={force}
                    onCheckedChange={(v) => setForce(v === true)}
                    className="mt-0.5"
                  />
                  <span className="text-foreground">
                    <span className="font-medium">Bỏ qua kiểm tra &amp; xuất bản</span> — xuất bản dù
                    {reviewUnverified ? ' chưa xác minh được checklist' : ' checklist chưa đạt'}
                    {hasContactLeak ? ' hoặc còn lộ thông tin liên hệ' : ''}. Hành động ghi đè này
                    được lưu vào nhật ký kiểm duyệt.
                  </span>
                </label>
              </WarningCallout>
            ) : null}
            <ConfirmButton
              trigger={
                <Button disabled={busy || (!canPublish && !force)}>
                  <Check className="size-4" /> {canPublish ? 'Duyệt & xuất bản' : 'Ghi đè & xuất bản'}
                </Button>
              }
              title={`Xuất bản ${entityLabel} này?`}
              description={
                canPublish
                  ? publishDescription
                  : `Bạn đang ghi đè kết quả kiểm duyệt — ${entityLabel} sẽ hiển thị công khai và quyết định được lưu vào nhật ký.`
              }
              confirmLabel="Xuất bản"
              busy={busy}
              onConfirm={() => submit({ intent: 'publish', force: force ? '1' : '' }, { method: 'post' })}
            />
          </div>
        ) : null}

        {status === 'archived' ? (
          <div className="space-y-3">
            {hiddenBy === 'admin' ? (
              <p className="text-sm text-muted-foreground">
                {entity} bị ẩn ở cấp quản trị. Mở lại sẽ hiển thị lại trên storefront.
              </p>
            ) : null}
            {supportsRepublish ? (
              <ConfirmButton
                trigger={
                  <Button variant="outline" disabled={busy}>
                    <Check className="size-4" /> Hiển thị lại
                  </Button>
                }
                title={`Hiển thị lại ${entityLabel}?`}
                description={`${entity} sẽ được đăng lại lên storefront và tiếp tục nhận đặt chỗ.`}
                confirmLabel="Hiển thị lại"
                busy={busy}
                onConfirm={() => submit({ intent: 'republish' }, { method: 'post' })}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                Mở lại {entityLabel} từ trang danh sách.
              </p>
            )}
          </div>
        ) : null}

        {canHide ? (
          <>
            {status === 'pending_review' ? <Separator /> : null}
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label htmlFor="moderation-reason" className="text-sm font-medium">
                  Lý do ẩn / từ chối (tuỳ chọn)
                </label>
                <Textarea
                  id="moderation-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                  placeholder="VD: Ảnh không rõ, thiếu mô tả, lộ số điện thoại…"
                />
              </div>
              <ConfirmButton
                trigger={
                  <Button variant="destructive" disabled={busy}>
                    <EyeOff className="size-4" />{' '}
                    {status === 'pending_review' ? 'Từ chối & ẩn' : `Ẩn ${entityLabel}`}
                  </Button>
                }
                title={
                  status === 'published'
                    ? `Ẩn ${entityLabel} đang hiển thị?`
                    : `Từ chối ${entityLabel} này?`
                }
                description={
                  status === 'published'
                    ? hidePublishedDescription
                    : `${entity} sẽ chuyển sang trạng thái đã ẩn; đối tác có thể chỉnh sửa và gửi lại. Lý do được lưu vào nhật ký kiểm duyệt.`
                }
                confirmLabel={status === 'published' ? `Ẩn ${entityLabel}` : 'Từ chối'}
                destructive
                busy={busy}
                onConfirm={() => submit({ intent: 'hide', reason }, { method: 'post' })}
              />
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
