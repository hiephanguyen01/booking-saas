import { Alert, AlertDescription } from '@booking/ui/components/ui/alert';
import { Info } from 'lucide-react';

const COPY = {
  listings:
    'Mỗi "Loại dịch vụ" định nghĩa mẫu (VD: Studio, Model). Đối tác tạo "Tin đăng" theo loại đó — một tin đăng có thể đứng riêng hoặc gồm nhiều hạng mục (phòng/gói).',
  types:
    'Loại dịch vụ là mẫu cho tin đăng: quyết định hình thức đặt, thuộc tính, và tin đăng thuộc loại này đứng riêng hay gồm nhiều hạng mục.',
} as const;

export function RelationshipHint({ variant }: { variant: keyof typeof COPY }) {
  return (
    <Alert>
      <Info className="h-4 w-4" />
      <AlertDescription>{COPY[variant]}</AlertDescription>
    </Alert>
  );
}
