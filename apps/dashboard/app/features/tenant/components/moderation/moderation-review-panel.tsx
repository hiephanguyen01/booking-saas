import type { ChecklistItem, ContactFlag } from '@booking/contracts';
import { Alert, AlertDescription, AlertTitle } from '@booking/ui/components/ui/alert';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@booking/ui/components/ui/card';
import { Check, CircleAlert, CircleCheck, ShieldCheck, X } from 'lucide-react';
import { CONTACT_FLAG_LABEL } from '~/features/tenant/constants';

/**
 * The "Checklist duyệt" + "Quét thông tin liên hệ" card pair shared by the
 * listing and listing-group review pages. The pages differ only in their
 * checklist label map and in how a flagged field name is rendered (the group
 * review namespaces child fields as `listings[0].description`), so both come
 * in as props.
 */
export function ModerationReviewPanel({
  checklist,
  checklistPassed,
  contactFlags,
  checklistLabels,
  fieldLabel,
  scanDescription,
}: {
  checklist: ChecklistItem[];
  checklistPassed: boolean;
  contactFlags: ContactFlag[];
  /** Backend checklist key → Vietnamese label (LISTING_ / GROUP_CHECKLIST_LABEL). */
  checklistLabels: Record<string, string>;
  /** Flagged field name → display label (the group page namespaces child fields). */
  fieldLabel: (field: string) => string;
  /** Sub-caption of the contact-scan card (per-page wording). */
  scanDescription: string;
}) {
  const hasContactLeak = contactFlags.length > 0;
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Checklist duyệt</CardTitle>
          <CardDescription>
            {checklistPassed
              ? 'Tất cả tiêu chí bắt buộc đã đạt.'
              : 'Còn tiêu chí chưa đạt — cần ghi đè để xuất bản.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-border">
            {checklist.map((item) => (
              <li key={item.key} className="flex items-center gap-3 py-3">
                <span
                  className={
                    item.passed
                      ? 'flex size-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                      : 'flex size-6 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive'
                  }
                >
                  {item.passed ? <Check className="size-4" /> : <X className="size-4" />}
                </span>
                <span className="text-sm">{checklistLabels[item.key] ?? item.label}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-4" /> Quét thông tin liên hệ
          </CardTitle>
          <CardDescription>{scanDescription}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {hasContactLeak ? (
            <>
              <Alert variant="destructive">
                <CircleAlert className="size-4" />
                <AlertTitle>Phát hiện {contactFlags.length} dấu hiệu</AlertTitle>
                <AlertDescription>Xuất bản bị chặn cho tới khi được gỡ bỏ.</AlertDescription>
              </Alert>
              <ul className="space-y-2">
                {contactFlags.map((flag, i) => (
                  <li
                    key={i}
                    className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive"
                  >
                    <span className="font-medium">{CONTACT_FLAG_LABEL[flag.type]}</span> trong{' '}
                    <span className="font-medium">{fieldLabel(flag.field)}</span>: “{flag.match}”
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
              <CircleCheck className="size-4 shrink-0" /> Không phát hiện thông tin liên hệ bị lộ.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
