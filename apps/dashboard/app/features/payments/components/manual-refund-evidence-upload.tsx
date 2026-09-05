import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import {
  MAX_MANUAL_REFUND_EVIDENCE_SIZE_BYTES,
  manualRefundEvidenceUploadResponseSchema,
} from '@booking/contracts';
import { Input } from '@booking/ui/components/ui/input';
import { Label } from '@booking/ui/components/ui/label';
import { CircleAlert, FileCheck2, LoaderCircle } from 'lucide-react';
import { dashboardPaths } from '~/constants/paths';

const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png'] as const;

export function ManualRefundEvidenceUpload({
  operationId,
  version,
  value,
  onChange,
  disabled,
}: {
  operationId: string;
  version: number;
  value: string;
  onChange: (key: string) => void;
  disabled?: boolean;
}) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => () => controller.current?.abort(), []);

  async function upload(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const input = event.currentTarget;
    const file = input.files?.[0];
    controller.current?.abort();
    setError(null);
    setFileName(null);
    onChange('');
    if (!file) return;
    if (!ALLOWED_TYPES.includes(file.type as (typeof ALLOWED_TYPES)[number])) {
      input.value = '';
      setError('Chỉ chấp nhận PDF, JPEG hoặc PNG.');
      return;
    }
    if (file.size <= 0 || file.size > MAX_MANUAL_REFUND_EVIDENCE_SIZE_BYTES) {
      input.value = '';
      setError('Biên lai phải có dung lượng từ 1 byte đến 10 MB.');
      return;
    }

    const abortController = new AbortController();
    controller.current = abortController;
    setUploading(true);
    try {
      const checksum = await sha256Hex(file);
      const response = await fetch(
        dashboardPaths.tenant.manualRefundEvidencePresign(operationId, version),
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({ contentType: file.type, sizeBytes: file.size, checksum }),
          signal: abortController.signal,
        },
      );
      if (!response.ok) {
        throw new Error((await responseMessage(response)) ?? 'Không thể tạo liên kết tải biên lai.');
      }
      const grant = manualRefundEvidenceUploadResponseSchema.safeParse(await response.json());
      if (!grant.success) throw new Error('Phản hồi tải biên lai không hợp lệ.');
      const put = await fetch(grant.data.uploadUrl, {
        method: 'PUT',
        headers: grant.data.requiredHeaders,
        body: file,
        signal: abortController.signal,
      });
      if (!put.ok) throw new Error(`Tải biên lai thất bại (${put.status}).`);
      onChange(grant.data.key);
      setFileName(file.name);
    } catch (caught) {
      if (!abortController.signal.aborted) {
        setError(caught instanceof Error ? caught.message : 'Không thể tải biên lai.');
      }
    } finally {
      setUploading(false);
      input.value = '';
    }
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor={`manual-refund-evidence-${operationId}`}>Biên lai chuyển khoản</Label>
      <Input
        id={`manual-refund-evidence-${operationId}`}
        type="file"
        accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png"
        disabled={disabled || uploading}
        onChange={(event) => void upload(event)}
      />
      {uploading ? (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
          <LoaderCircle className="size-3.5 animate-spin" /> Đang mã hoá checksum và tải biên lai…
        </p>
      ) : value && fileName ? (
        <p className="flex items-center gap-1.5 text-xs text-success" role="status">
          <FileCheck2 className="size-3.5" /> {fileName} · Đã tải lên vùng riêng tư
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">PDF, JPEG hoặc PNG; tối đa 10 MB.</p>
      )}
      {error ? (
        <p className="flex items-center gap-1.5 text-xs text-destructive" role="alert">
          <CircleAlert className="size-3.5" /> {error}
        </p>
      ) : null}
    </div>
  );
}

async function sha256Hex(file: File): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('Trình duyệt không hỗ trợ SHA-256.');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
}

async function responseMessage(response: Response): Promise<string | undefined> {
  try {
    const body = (await response.json()) as { message?: unknown };
    return typeof body.message === 'string' && body.message.trim() ? body.message : undefined;
  } catch {
    return undefined;
  }
}
