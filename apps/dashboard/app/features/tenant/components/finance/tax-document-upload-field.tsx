import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { MAX_TAX_DOCUMENT_SIZE_BYTES, taxDocumentUploadResponseSchema } from '@booking/contracts';
import { Input } from '@booking/ui/components/ui/input';
import { Label } from '@booking/ui/components/ui/label';
import { AlertCircle, FileCheck2, LoaderCircle } from 'lucide-react';
import { dashboardPaths } from '~/constants/paths';

interface UploadedTaxDocument {
  fileName: string;
  key: string;
}

export function TaxDocumentUploadField({
  id,
  label,
  required = false,
  disabled = false,
  onUploadingChange,
}: {
  id: string;
  label: string;
  required?: boolean;
  disabled?: boolean;
  onUploadingChange?: (uploading: boolean) => void;
}) {
  const [uploaded, setUploaded] = useState<UploadedTaxDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const sequence = useRef(0);

  useEffect(() => () => controller.current?.abort(), []);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    controller.current?.abort();
    const currentSequence = ++sequence.current;
    setUploaded(null);
    setError(null);
    setUploading(false);
    onUploadingChange?.(false);

    if (!file) return;
    if (file.type !== 'application/pdf') {
      input.value = '';
      setError('Chỉ chấp nhận tệp PDF.');
      return;
    }
    if (file.size <= 0 || file.size > MAX_TAX_DOCUMENT_SIZE_BYTES) {
      input.value = '';
      setError('Tệp PDF phải có dung lượng từ 1 byte đến 10 MB.');
      return;
    }

    const abortController = new AbortController();
    controller.current = abortController;
    setUploading(true);
    onUploadingChange?.(true);

    try {
      const checksum = await sha256Hex(file);
      const presignResponse = await fetch(dashboardPaths.tenant.taxDocumentUpload, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ contentType: file.type, sizeBytes: file.size, checksum }),
        signal: abortController.signal,
      });
      if (!presignResponse.ok) {
        throw new Error(
          (await responseMessage(presignResponse)) ?? 'Không thể tạo liên kết tải chứng từ.',
        );
      }

      const grant = taxDocumentUploadResponseSchema.safeParse(await presignResponse.json());
      if (!grant.success) throw new Error('Phản hồi tải chứng từ không hợp lệ.');

      const uploadResponse = await fetch(grant.data.uploadUrl, {
        method: 'PUT',
        headers: { 'content-type': file.type, 'if-none-match': '*' },
        body: file,
        signal: abortController.signal,
      });
      if (!uploadResponse.ok) {
        throw new Error(`Tải chứng từ lên thất bại (${uploadResponse.status}).`);
      }

      if (sequence.current === currentSequence) {
        setUploaded({ fileName: file.name, key: grant.data.key });
      }
    } catch (caught) {
      if (abortController.signal.aborted) return;
      setError(caught instanceof Error ? caught.message : 'Không thể tải chứng từ.');
      input.value = '';
    } finally {
      if (sequence.current === currentSequence) {
        setUploading(false);
        onUploadingChange?.(false);
      }
    }
  }

  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="file"
        accept="application/pdf,.pdf"
        required={required}
        disabled={disabled || uploading}
        onChange={handleFileChange}
      />
      <input type="hidden" name="fileKey" value={uploaded?.key ?? ''} />
      {uploading ? (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
          <LoaderCircle className="size-3.5 animate-spin" /> Đang tải và kiểm tra tệp…
        </p>
      ) : uploaded ? (
        <p className="flex items-center gap-1.5 text-xs text-emerald-700" role="status">
          <FileCheck2 className="size-3.5" /> {uploaded.fileName} · Đã tải lên an toàn
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          PDF tối đa 10 MB. Hệ thống tự lưu và kiểm tra tính toàn vẹn của tệp.
        </p>
      )}
      {error ? (
        <p className="flex items-center gap-1.5 text-xs text-destructive" role="alert">
          <AlertCircle className="size-3.5" /> {error}
        </p>
      ) : null}
    </div>
  );
}

async function sha256Hex(file: File): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error('Trình duyệt không hỗ trợ kiểm tra SHA-256.');
  }
  const digest = await globalThis.crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join(
    '',
  );
}

async function responseMessage(response: Response): Promise<string | undefined> {
  try {
    const body = (await response.json()) as { message?: unknown };
    return typeof body.message === 'string' && body.message.trim() ? body.message : undefined;
  } catch {
    return undefined;
  }
}
