import type { FormEvent } from 'react';
import { Form, useNavigation, useSubmit } from 'react-router';
import { Trash2 } from 'lucide-react';
import {
  MAX_PARTNER_DOCUMENT_SIZE_BYTES,
  PARTNER_DOCUMENT_UPLOAD_ACCEPT,
  type PartnerDocumentReadItem,
  type PartnerResponse,
  type UpdatePartnerDocumentsInput,
} from '@booking/contracts';
import { updatePartnerDocumentsInputSchema } from '@booking/contracts';
import { GenericForm } from '@booking/ui/components/form/generic-form';
import { PrivateDocumentUpload } from '@booking/ui/components/form/private-document-upload';
import type { FieldConfig } from '@booking/ui/components/form/types';
import { Button } from '@booking/ui/components/ui/button';
import { SuccessBanner } from '~/components/action-feedback';
import { PhotoStrip } from '~/components/photo-strip';
import { useSubmissionGuard } from '~/hooks/use-submission-guard';
import type { PartnerProfileActionResult } from '~/features/partner/server/profile-actions.server';
import { Section } from '~/components/form-layout';
import { dashboardPaths } from '~/constants/paths';

const logoFields: FieldConfig<UpdatePartnerDocumentsInput>[] = [
  {
    name: 'logoUrl',
    type: 'file',
    target: 'partners',
    label: 'Logo đối tác',
    description: 'Hình đại diện công khai hiển thị với khách sau khi đặt.',
  },
];

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

const DOCUMENT_MAX_SIZE_MB = MAX_PARTNER_DOCUMENT_SIZE_BYTES / (1024 * 1024);

const DOCUMENT_KIND_LABEL: Record<PartnerDocumentReadItem['kind'], string> = {
  identity_card_front: 'CCCD / giấy tờ định danh mặt trước',
  identity_card_back: 'CCCD / giấy tờ định danh mặt sau',
  business_license_front: 'Giấy phép kinh doanh mặt trước',
  business_license_back: 'Giấy phép kinh doanh mặt sau',
  license_document: 'Giấy tờ bổ sung',
};

function displayUrl(document: PartnerDocumentReadItem): string {
  return document.storage === 'private' ? document.downloadUrl : document.url;
}

/** Uploaded logo/license documents inside the shared profile settings surface. */
export function ProfileDocumentsCard({
  partner,
  documents,
  documentLoadError,
  result,
}: {
  partner: PartnerResponse;
  documents: PartnerDocumentReadItem[];
  documentLoadError: string | null;
  result: PartnerProfileActionResult | null;
}) {
  const navigation = useNavigation();
  const submit = useSubmit();
  const { busy, run } = useSubmissionGuard(navigation.state);
  const logoUrl = readString(partner.businessInfo.logoUrl);
  const documentDefaults = { logoUrl };

  const handleDelete = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    run(() => submit(formData, { method: 'post' }));
  };

  const handlePrivateUpload = (key: string): void => {
    if (!key) return;
    run(() =>
      submit(
        { intent: 'documents', licenseDocumentKeys: [key] },
        { method: 'patch', encType: 'application/json' },
      ),
    );
  };

  return (
    <Section title="Logo & giấy tờ" description="Hình ảnh đại diện và hồ sơ pháp lý của đối tác.">
      <div className="space-y-6" aria-busy={busy}>
        {result?.ok ? <SuccessBanner message="Đã lưu giấy tờ." /> : null}

        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Giấy tờ đã tải lên</h3>
          {documentLoadError ? (
            <p className="text-sm text-destructive">{documentLoadError}</p>
          ) : documents.length === 0 ? (
            <p className="text-sm text-muted-foreground">Chưa có giấy tờ nào.</p>
          ) : (
            <div className="flex flex-wrap gap-3">
              {documents.map((document, index) => {
                const url = displayUrl(document);
                const canDelete = document.storage === 'private' && document.kind === 'license_document';
                return (
                  <div
                    key={document.storage === 'private' ? document.key : `${document.url}-${index}`}
                    className="space-y-1.5"
                  >
                    <PhotoStrip photos={[url]} alt={DOCUMENT_KIND_LABEL[document.kind]} />
                    <p className="max-w-40 text-xs text-muted-foreground">
                      {DOCUMENT_KIND_LABEL[document.kind]}
                    </p>
                    {canDelete ? (
                      <Form method="post" onSubmit={handleDelete}>
                        <input type="hidden" name="intent" value="deleteDoc" />
                        <input type="hidden" name="key" value={document.key} />
                        <Button
                          type="submit"
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          className="h-8 w-full gap-1.5 text-destructive hover:text-destructive"
                        >
                          <Trash2 className="size-3.5" aria-hidden /> Xoá
                        </Button>
                      </Form>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <fieldset disabled={busy} className="contents">
          <div className="grid gap-6 border-t border-border pt-6 lg:grid-cols-2">
            <div>
              <h3 className="mb-4 text-sm font-semibold">Logo công khai</h3>
              <GenericForm
                schema={updatePartnerDocumentsInputSchema}
                fields={logoFields}
                defaultValues={documentDefaults}
                submitLabel="Lưu logo"
                method="patch"
                transform={(value) => ({ ...value, intent: 'documents' })}
                serverError={result?.error ?? null}
                fieldErrors={result?.fieldErrors ?? null}
                warnOnUnsavedChanges
              />
            </div>
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold">Tải thêm giấy tờ riêng tư</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Tài liệu được lưu riêng tư và chỉ mở bằng liên kết ngắn hạn có kiểm soát quyền.
                </p>
              </div>
              <PrivateDocumentUpload
                value=""
                onChange={handlePrivateUpload}
                presignEndpoint={dashboardPaths.partnerDocumentUploadPresign}
                accept={PARTNER_DOCUMENT_UPLOAD_ACCEPT}
                maxSizeMb={DOCUMENT_MAX_SIZE_MB}
                disabled={busy}
                label="Giấy tờ bổ sung"
              />
            </div>
          </div>
        </fieldset>
      </div>
    </Section>
  );
}
