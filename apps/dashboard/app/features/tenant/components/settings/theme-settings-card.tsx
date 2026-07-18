import { themeConfigSchema, type TenantThemeResponse } from '@booking/contracts';
import { GenericForm } from '@booking/ui/components/form/generic-form';
import { Alert, AlertDescription } from '@booking/ui/components/ui/alert';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@booking/ui/components/ui/card';
import { CheckCircle2, CircleAlert } from 'lucide-react';
import { themeFields, toThemeDefaults } from './settings-fields';

/** Storefront theme editor — brand config persisted into the tenant's `theme_config`. */
export function ThemeSettingsCard({
  theme,
  readOnly,
  saved,
  error,
  fieldErrors,
}: {
  theme: TenantThemeResponse;
  readOnly: boolean;
  saved: boolean;
  error: string | null;
  fieldErrors: Record<string, string[]> | null;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Giao diện storefront</CardTitle>
        <CardDescription>
          Thương hiệu hiển thị trên trang đặt chỗ công khai ({theme.name} · {theme.vertical}).
        </CardDescription>
      </CardHeader>
      <CardContent>
        {saved ? (
          <Alert className="mb-4 border-emerald-500/40 text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="size-4" />
            <AlertDescription>Đã lưu giao diện.</AlertDescription>
          </Alert>
        ) : null}
        {readOnly ? (
          <Alert className="mb-4 border-warning/40 bg-warning/10 text-warning-foreground dark:bg-warning/15 dark:text-warning [&>svg]:text-warning">
            <CircleAlert className="size-4" />
            <AlertDescription>
              Chế độ chỉ đọc — gia hạn gói dịch vụ để chỉnh sửa giao diện.
            </AlertDescription>
          </Alert>
        ) : null}
        <fieldset disabled={readOnly} className="min-w-0 disabled:opacity-60">
          <GenericForm
            schema={themeConfigSchema}
            fields={themeFields}
            columns={2}
            defaultValues={toThemeDefaults(theme.themeConfig ?? {})}
            submitLabel="Lưu giao diện"
            method="patch"
            serverError={error}
            fieldErrors={fieldErrors}
          />
        </fieldset>
      </CardContent>
    </Card>
  );
}
