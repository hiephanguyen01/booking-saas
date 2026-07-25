import type { FormEvent } from 'react';
import { Form, useNavigation, useSubmit } from 'react-router';
import { Trash2 } from 'lucide-react';
import type { PartnerResponse, UpdatePartnerDocumentsInput } from '@booking/contracts';
import { updatePartnerDocumentsInputSchema } from '@booking/contracts';
import { GenericForm } from '@booking/ui/components/form/generic-form';
import type { FieldConfig } from '@booking/ui/components/form/types';
import { Button } from '@booking/ui/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@booking/ui/components/ui/card';
import { SuccessBanner } from '~/components/action-feedback';
import { PhotoStrip } from '~/components/photo-strip';
import { useSubmissionGuard } from '~/hooks/use-submission-guard';
import type { PartnerProfileActionResult } from '../../server/profile-actions.server';

const documentFields: FieldConfig<UpdatePartnerDocumentsInput>[] = [
  {
    name: 'logoUrl',
    type: 'file',
    target: 'partners',
    label: 'Logo đối tác',
    description: 'Hình đại diện hiển thị với khách sau khi đặt.',
  },
  {
    name: 'licenseDocs',
    type: 'file',
    target: 'partners',
    multiple: true,
    maxFiles: 10,
    label: 'Tải thêm giấy tờ',
    description: 'Ảnh mới sẽ được thêm vào danh sách giấy tờ hiện có.',
  },
];

// `businessInfo` is untrusted jsonb; defaults need `''`/`[]` (never null).
function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === 'string' && v.length > 0)
    : [];
}

/** "Logo & giấy tờ" — uploaded license docs (with delete) + the upload form. */
export function ProfileDocumentsCard({
  partner,
  result,
}: {
  partner: PartnerResponse;
  result: PartnerProfileActionResult | null;
}) {
  const navigation = useNavigation();
  const submit = useSubmit();
  const { busy, run } = useSubmissionGuard(navigation.state);
  const logoUrl = readString(partner.businessInfo.logoUrl);
  const licenseDocs = readStringArray(partner.businessInfo.licenseDocs);
  const documentDefaults = { logoUrl, licenseDocs: [] as string[] };

  const handleDelete = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    run(() => submit(formData, { method: 'post' }));
  };

  return (
    <Card aria-busy={busy}>
      <CardHeader>
        <CardTitle>Logo & giấy tờ</CardTitle>
        <CardDescription>
          Hình ảnh được tải trực tiếp lên kho lưu trữ; chỉ đường dẫn được lưu vào hồ sơ.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {result?.ok ? <SuccessBanner message="Đã lưu giấy tờ." /> : null}

        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Giấy tờ đã tải lên</h3>
          {licenseDocs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Chưa có giấy tờ nào.</p>
          ) : (
            <div className="flex flex-wrap gap-3">
              {licenseDocs.map((url, i) => (
                <div key={`${url}-${i}`} className="space-y-1.5">
                  <PhotoStrip photos={[url]} alt="Giấy tờ" />
                  <Form method="post" onSubmit={handleDelete}>
                    <input type="hidden" name="intent" value="deleteDoc" />
                    <input type="hidden" name="url" value={url} />
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
                </div>
              ))}
            </div>
          )}
        </div>

        <fieldset disabled={busy} className="contents">
          <div className="border-t border-border pt-6">
            <h3 className="mb-4 text-sm font-semibold">Tải lên</h3>
            <GenericForm
              schema={updatePartnerDocumentsInputSchema}
              fields={documentFields}
              defaultValues={documentDefaults}
              submitLabel="Lưu giấy tờ"
              method="patch"
              transform={(v) => ({ ...v, intent: 'documents' })}
              serverError={result?.error ?? null}
              fieldErrors={result?.fieldErrors ?? null}
            />
          </div>
        </fieldset>
      </CardContent>
    </Card>
  );
}
