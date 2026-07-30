import { Button } from '@booking/ui/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@booking/ui/components/ui/card';
import { Checkbox } from '@booking/ui/components/ui/checkbox';
import { Textarea } from '@booking/ui/components/ui/textarea';
import { Check, X } from 'lucide-react';
import { useState } from 'react';
import { Form } from 'react-router';

/**
 * The reviewer's verdict on a parked edit. Approving writes the change onto the
 * live listing; turning it down leaves the listing exactly as customers see it
 * and sends the note back to the partner, who keeps their edited content.
 */
export function RevisionDecisionCard({
  entityLabel,
  hasContactLeak,
  busy,
}: {
  entityLabel: string;
  /** The scan runs on the edited content, so a leak blocks approval unless forced. */
  hasContactLeak: boolean;
  busy: boolean;
}) {
  const [note, setNote] = useState('');
  return (
    <Card>
      <CardHeader>
        <CardTitle>Duyệt thay đổi</CardTitle>
        <CardDescription>
          Duyệt sẽ cập nhật {entityLabel} đang hiển thị. Từ chối giữ nguyên bản đang hiển thị và gửi
          lý do cho đối tác.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <Form method="post" className="space-y-3">
          <input type="hidden" name="intent" value="approve-change" />
          {hasContactLeak ? (
            <label className="flex items-start gap-2 text-sm">
              <Checkbox name="force" value="1" className="mt-0.5" />
              <span>
                Bỏ qua cảnh báo lộ thông tin liên hệ và duyệt thay đổi này. Quyết định được ghi vào
                nhật ký kiểm duyệt.
              </span>
            </label>
          ) : null}
          <Button type="submit" size="control" disabled={busy}>
            <Check data-icon="inline-start" /> Duyệt thay đổi
          </Button>
        </Form>

        <Form method="post" className="space-y-3 border-t pt-5">
          <input type="hidden" name="intent" value="reject-change" />
          <div className="space-y-1.5">
            <label htmlFor="revision-note" className="text-sm font-medium">
              Lý do từ chối
            </label>
            <Textarea
              id="revision-note"
              name="note"
              rows={3}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Ví dụ: ảnh mới bị mờ, mô tả chứa số điện thoại…"
            />
            <p className="text-xs text-muted-foreground">
              Bắt buộc — đối tác đọc lý do này để sửa lại.
            </p>
          </div>
          <Button
            type="submit"
            variant="destructive"
            size="control"
            disabled={busy || !note.trim()}
          >
            <X data-icon="inline-start" /> Từ chối thay đổi
          </Button>
        </Form>
      </CardContent>
    </Card>
  );
}
