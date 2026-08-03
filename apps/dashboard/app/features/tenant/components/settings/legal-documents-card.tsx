import { useState } from 'react';
import { useNavigation, useSubmit } from 'react-router';
import {
  REQUIRED_LEGAL_DOCUMENT_TYPES,
  type LegalDocumentType,
  type LegalTranslation,
  type Locale,
  type TenantLegalDocument,
  type TenantLegalOverview,
} from '@booking/contracts';
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
import { Badge } from '@booking/ui/components/ui/badge';
import { Button } from '@booking/ui/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@booking/ui/components/ui/card';
import { Input } from '@booking/ui/components/ui/input';
import { Textarea } from '@booking/ui/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@booking/ui/components/ui/toggle-group';
import { RestrictedMarkdown } from '@booking/ui/components/markdown/restricted-markdown';
import { CheckCircle2, Clock, Eye, History, ScrollText, Undo2 } from 'lucide-react';
import { ErrorBanner, SuccessBanner } from '~/components/action-feedback';
import { WarningCallout } from '~/components/warning-callout';
import { useSubmissionGuard } from '~/hooks/use-submission-guard';
import { LEGAL_DOCUMENT_HINTS, LEGAL_DOCUMENT_LABELS } from '~/constants/legal';
import { LOCALE_LABELS } from '~/constants/tenancy';
import { formatDate } from '~/lib/format';
import { LegalPublishDialog } from './legal-publish-dialog';
import { LOCALE_PROSE_LABEL } from '~/constants/legal';

const LOCALES: Locale[] = ['vi', 'en'];

/** Prose form ("tiếng Anh") — distinct from the toggle's chrome labels ("English"). */
type TranslationDraft = Record<Locale, { title: string; bodyMd: string }>;

function buildInitialTranslations(doc: TenantLegalDocument): TranslationDraft {
  const draft = {} as TranslationDraft;
  for (const locale of LOCALES) {
    const fromDraft = doc.draftTranslations.find((t) => t.locale === locale);
    const fromCurrent = doc.currentTranslations.find((t) => t.locale === locale);
    const source = fromDraft ?? fromCurrent;
    draft[locale] = { title: source?.title ?? '', bodyMd: source?.bodyMd ?? '' };
  }
  return draft;
}

/**
 * The tenant's "Pháp lý" settings tab (Task 14): one card per required legal
 * document type — customer terms, privacy policy, partner terms, affiliate
 * terms. Each card edits both locales locally, then submits a save-draft /
 * publish / withdraw intent through the settings route's shared action, the
 * same way every other settings card does.
 */
export function LegalDocumentsCard({
  overview,
  loadError,
  readOnly,
  draftError,
  draftFieldErrors,
  draftSaved,
  publishError,
  publishSaved,
  withdrawError,
  withdrawSaved,
}: {
  overview: TenantLegalOverview | null;
  loadError: string | null;
  readOnly: boolean;
  draftError: string | null;
  draftFieldErrors: Record<string, string[]> | null;
  draftSaved: boolean;
  publishError: string | null;
  publishSaved: boolean;
  withdrawError: string | null;
  withdrawSaved: boolean;
}) {
  const submit = useSubmit();
  const navigation = useNavigation();
  const { busy, run } = useSubmissionGuard(navigation.state);

  if (loadError || !overview) {
    return (
      <Card className="shadow-none">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ScrollText className="size-4 text-primary" aria-hidden="true" /> Tài liệu pháp lý
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ErrorBanner error={loadError ?? 'Không có dữ liệu pháp lý.'} />
        </CardContent>
      </Card>
    );
  }

  const submitLegal = (payload: Record<string, unknown>): void => {
    run(() => submit(payload as never, { method: 'post', encType: 'application/json' }));
  };

  const handleSaveDraft = (docType: LegalDocumentType, translations: LegalTranslation[]): void => {
    submitLegal({ intent: 'save-legal-draft', docType, translations });
  };
  const handlePublish = (docType: LegalDocumentType, material: boolean): void => {
    submitLegal({ intent: 'publish-legal-document', docType, material });
  };
  const handleWithdraw = (docType: LegalDocumentType): void => {
    submitLegal({ intent: 'withdraw-legal-document', docType });
  };

  const orderedDocs = REQUIRED_LEGAL_DOCUMENT_TYPES.map((docType) =>
    overview.documents.find((doc) => doc.docType === docType),
  ).filter((doc): doc is TenantLegalDocument => Boolean(doc));

  const actionError = draftError ?? publishError ?? withdrawError;
  const successMessage = draftSaved
    ? 'Đã lưu bản nháp.'
    : publishSaved
      ? 'Đã công bố tài liệu.'
      : withdrawSaved
        ? 'Đã rút công bố tài liệu.'
        : null;

  return (
    <div className="space-y-5">
      <ErrorBanner error={actionError} />
      <SuccessBanner message={successMessage} />

      {!overview.legalReady ? (
        <WarningCallout title="Storefront chưa đủ điều kiện lên sóng">
          <p>
            Đã công bố {overview.publishedCount}/4 tài liệu ở ngôn ngữ mặc định (
            {LOCALE_LABELS[overview.defaultLocale]}). Storefront chỉ hoạt động khi cả bốn tài liệu bên
            dưới đều được công bố.
          </p>
        </WarningCallout>
      ) : null}

      {orderedDocs.map((doc) => (
        <LegalDocumentEditor
          key={doc.docType}
          doc={doc}
          defaultLocale={overview.defaultLocale}
          readOnly={readOnly}
          busy={busy}
          onSaveDraft={handleSaveDraft}
          onPublish={handlePublish}
          onWithdraw={handleWithdraw}
          fieldErrors={draftFieldErrors}
        />
      ))}
    </div>
  );
}

function LegalDocumentEditor({
  doc,
  defaultLocale,
  readOnly,
  busy,
  onSaveDraft,
  onPublish,
  onWithdraw,
  fieldErrors,
}: {
  doc: TenantLegalDocument;
  defaultLocale: Locale;
  readOnly: boolean;
  busy: boolean;
  onSaveDraft: (docType: LegalDocumentType, translations: LegalTranslation[]) => void;
  onPublish: (docType: LegalDocumentType, material: boolean) => void;
  onWithdraw: (docType: LegalDocumentType) => void;
  fieldErrors: Record<string, string[]> | null;
}) {
  const [locale, setLocale] = useState<Locale>(defaultLocale);
  // Initialized once from the loader snapshot; a save-draft/publish/withdraw
  // submission never needs to overwrite what's on screen because the screen
  // is already the source of truth for what got submitted (see legal-documents-card.tsx).
  const [values, setValues] = useState<TranslationDraft>(() => buildInitialTranslations(doc));

  const active = values[locale];
  const setActive = (patch: Partial<{ title: string; bodyMd: string }>) => {
    setValues((prev) => ({ ...prev, [locale]: { ...prev[locale], ...patch } }));
  };

  const hasAnyContent = LOCALES.some(
    (l) => values[l].title.trim().length > 0 && values[l].bodyMd.trim().length > 0,
  );
  const canPublish = doc.hasDraft && doc.draftTranslations.some((t) => t.locale === defaultLocale);

  const saveDraft = () => {
    const translations = LOCALES.map((l) => ({ locale: l, ...values[l] })).filter(
      (t) => t.title.trim().length > 0 && t.bodyMd.trim().length > 0,
    );
    if (translations.length === 0) return;
    onSaveDraft(doc.docType, translations);
  };

  const isBlank = active.title.trim().length === 0 && active.bodyMd.trim().length === 0;

  return (
    <Card className="shadow-none" aria-busy={busy}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ScrollText className="size-4 text-primary" aria-hidden="true" />
          {LEGAL_DOCUMENT_LABELS[doc.docType]}
        </CardTitle>
        <CardDescription>{LEGAL_DOCUMENT_HINTS[doc.docType]}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          {doc.currentVersionNo !== null ? (
            <Badge variant="success">
              <CheckCircle2 className="size-3" aria-hidden="true" /> Đã công bố v{doc.currentVersionNo}
            </Badge>
          ) : (
            <Badge variant="outline">Chưa công bố</Badge>
          )}
          {doc.hasDraft ? (
            <Badge variant="secondary">
              <Clock className="size-3" aria-hidden="true" /> Bản nháp đang chờ
            </Badge>
          ) : null}
        </div>

        {doc.currentVersionNo !== null && !doc.readyInDefaultLocale ? (
          <WarningCallout>
            <p>
              Phiên bản đang công bố chưa có bản {LOCALE_LABELS[defaultLocale]} — tài liệu này vẫn tính
              là chưa đủ điều kiện lên sóng.
            </p>
          </WarningCallout>
        ) : null}

        <fieldset disabled={readOnly || busy} className="space-y-4 disabled:opacity-60">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <ToggleGroup
              type="single"
              variant="outline"
              value={locale}
              onValueChange={(value) => {
                if (value) setLocale(value as Locale);
              }}
            >
              {LOCALES.map((l) => (
                <ToggleGroupItem key={l} value={l}>
                  {LOCALE_LABELS[l]}
                  {l === defaultLocale ? ' *' : ''}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <span className="text-xs text-muted-foreground">
              * Ngôn ngữ mặc định của cửa hàng — bắt buộc để công bố.
            </span>
          </div>

          {isBlank ? (
            <p className="text-xs text-muted-foreground">
              {locale === defaultLocale
                ? 'Bắt buộc — đây là ngôn ngữ mặc định của cửa hàng.'
                : `Chưa có bản ${LOCALE_PROSE_LABEL[locale]} — khách xem ${LOCALE_PROSE_LABEL[locale]} sẽ thấy bản ${LOCALE_PROSE_LABEL[defaultLocale]}.`}
            </p>
          ) : null}

          <div className="grid gap-5 lg:grid-cols-2">
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor={`${doc.docType}-${locale}-title`} className="text-sm font-medium">
                  Tiêu đề ({LOCALE_LABELS[locale]})
                </label>
                <Input
                  id={`${doc.docType}-${locale}-title`}
                  value={active.title}
                  onChange={(event) => setActive({ title: event.target.value })}
                  placeholder="Ví dụ: Điều khoản sử dụng"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor={`${doc.docType}-${locale}-body`} className="text-sm font-medium">
                  Nội dung ({LOCALE_LABELS[locale]})
                </label>
                <Textarea
                  id={`${doc.docType}-${locale}-body`}
                  rows={10}
                  value={active.bodyMd}
                  onChange={(event) => setActive({ bodyMd: event.target.value })}
                  placeholder="# Tiêu đề&#10;&#10;Nội dung đoạn văn. Hỗ trợ **in đậm**, *in nghiêng*, danh sách và tiêu đề."
                />
                {fieldErrors?.translations ? (
                  <p className="text-xs text-destructive">{fieldErrors.translations[0]}</p>
                ) : null}
              </div>
            </div>

            <div className="space-y-1.5">
              <p className="flex items-center gap-1.5 text-sm font-medium">
                <Eye className="size-3.5" aria-hidden="true" /> Xem trước
              </p>
              <div className="min-h-[16rem] rounded-lg border bg-muted/20 p-4">
                {active.bodyMd.trim().length > 0 ? (
                  <RestrictedMarkdown source={active.bodyMd} />
                ) : (
                  <p className="text-sm text-muted-foreground">Chưa có nội dung để xem trước.</p>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t pt-4">
            <Button type="button" variant="outline" size="sm" onClick={saveDraft} disabled={!hasAnyContent}>
              Lưu nháp
            </Button>
            <LegalPublishDialog
              docLabel={LEGAL_DOCUMENT_LABELS[doc.docType]}
              disabled={!canPublish}
              busy={busy}
              onConfirm={(material) => onPublish(doc.docType, material)}
            />
            {doc.currentVersionNo !== null ? (
              <WithdrawDialog
                docLabel={LEGAL_DOCUMENT_LABELS[doc.docType]}
                busy={busy}
                onConfirm={() => onWithdraw(doc.docType)}
              />
            ) : null}
            {!canPublish ? (
              <span className="text-xs text-muted-foreground">
                Lưu bản nháp cho {LOCALE_LABELS[defaultLocale]} trước khi công bố.
              </span>
            ) : null}
          </div>
        </fieldset>

        {doc.history.length > 0 ? (
          <div className="space-y-2 border-t pt-4">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <History className="size-3.5" aria-hidden="true" /> Lịch sử công bố
            </p>
            <ul className="space-y-1.5">
              {doc.history.map((version) => (
                <li
                  key={version.versionId}
                  className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground"
                >
                  <span className="font-medium text-foreground">v{version.versionNo}</span>
                  <span>{formatDate(version.publishedAt)}</span>
                  <span>{version.locales.map((l) => LOCALE_LABELS[l]).join(', ')}</span>
                  <Badge variant={version.isMaterialChange ? 'outline' : 'secondary'}>
                    {version.isMaterialChange ? 'Thay đổi điều khoản' : 'Sửa lỗi chính tả'}
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function WithdrawDialog({
  docLabel,
  busy,
  onConfirm,
}: {
  docLabel: string;
  busy: boolean;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm">
          <Undo2 className="size-3.5" /> Rút công bố
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Rút công bố {docLabel}?</AlertDialogTitle>
          <AlertDialogDescription>
            Storefront sẽ không còn phiên bản công khai cho tài liệu này. Nếu đây là một trong bốn
            tài liệu bắt buộc, cửa hàng có thể ngừng hiển thị cho khách cho đến khi bạn công bố lại.
            Bản nháp hiện tại (nếu có) không bị ảnh hưởng.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Giữ lại</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm} disabled={busy}>
            Rút công bố
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
