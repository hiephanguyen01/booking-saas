import { useNavigation, useSubmit } from 'react-router';
import type { PendingAcceptance } from '@booking/contracts';
import { Button } from '@booking/ui/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@booking/ui/components/ui/card';
import { RestrictedMarkdown } from '@booking/ui/components/markdown/restricted-markdown';
import { ScrollText, ShieldCheck } from 'lucide-react';
import { ErrorBanner } from '~/components/action-feedback';
import { useSubmissionGuard } from '~/hooks/use-submission-guard';
import { LEGAL_DOCUMENT_LABELS } from '~/constants/legal';

/**
 * The re-acceptance interstitial (Task 16), shared by the partner and
 * affiliate portals. One "Tôi đồng ý" action accepts every pending document
 * at once (`versionIds` + a single `acceptedLocale`) — the contract caps this
 * at 4 versions, matching the four required legal document types.
 */
export function LegalReacceptScreen({
  pending,
  error,
}: {
  pending: PendingAcceptance[];
  error: string | null;
}) {
  const submit = useSubmit();
  const navigation = useNavigation();
  const { busy, run } = useSubmissionGuard(navigation.state);

  const handleAccept = (): void => {
    const versionIds = pending.map((doc) => doc.versionId);
    const acceptedLocale = pending[0]?.servedLocale ?? 'vi';
    run(() =>
      submit({ versionIds, acceptedLocale } as never, {
        method: 'post',
        encType: 'application/json',
      }),
    );
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-10">
      <div className="text-center">
        <ShieldCheck className="mx-auto mb-3 size-10 text-primary" aria-hidden="true" />
        <h1 className="text-xl font-semibold">Điều khoản đã được cập nhật</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Vui lòng đọc và đồng ý với nội dung mới trước khi tiếp tục thao tác trên hệ thống.
        </p>
      </div>

      <ErrorBanner error={error} />

      {pending.map((doc) => (
        <Card key={doc.versionId}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ScrollText className="size-4 text-primary" aria-hidden="true" /> {doc.title}
            </CardTitle>
            <CardDescription>
              {LEGAL_DOCUMENT_LABELS[doc.docType]} · Phiên bản v{doc.versionNo}
            </CardDescription>
          </CardHeader>
          <CardContent className="max-h-96 overflow-y-auto rounded-lg border bg-muted/20 p-4">
            <RestrictedMarkdown source={doc.bodyMd} />
          </CardContent>
        </Card>
      ))}

      <Button
        type="button"
        size="control"
        className="w-full"
        disabled={busy || pending.length === 0}
        onClick={handleAccept}
      >
        {busy ? 'Đang ghi nhận...' : 'Tôi đồng ý'}
      </Button>
    </div>
  );
}
