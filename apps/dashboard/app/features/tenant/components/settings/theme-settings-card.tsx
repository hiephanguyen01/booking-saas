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
import {
  CheckCircle2,
  CircleAlert,
  Contact,
  Image,
  LayoutTemplate,
  Palette,
  Search,
} from 'lucide-react';
import { themeFields, toThemeDefaults } from './settings-fields';
import { StorefrontThemePreview } from './storefront-theme-preview';

/** Storefront theme editor: brand config persisted into the tenant's `theme_config`. */
export function ThemeSettingsCard({
  theme,
  readOnly,
  saved,
  error,
  fieldErrors,
  storefrontUrl,
}: {
  theme: TenantThemeResponse;
  readOnly: boolean;
  saved: boolean;
  error: string | null;
  fieldErrors: Record<string, string[]> | null;
  storefrontUrl: string | null;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Thương hiệu và nội dung storefront</CardTitle>
        <CardDescription>
          Quản lý nhận diện, nội dung trang chủ và thông tin giúp khách tìm thấy cửa hàng.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {saved ? (
          <Alert className="mb-4 border-success/40 text-success">
            <CheckCircle2 className="size-4" />
            <AlertDescription>Đã lưu giao diện.</AlertDescription>
          </Alert>
        ) : null}
        {readOnly ? (
          <Alert className="mb-4 border-warning/40 bg-warning/10 text-warning-foreground dark:bg-warning/15 dark:text-warning [&>svg]:text-warning">
            <CircleAlert className="size-4" />
            <AlertDescription>
              Chế độ chỉ đọc. Gia hạn gói dịch vụ để chỉnh sửa giao diện.
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
            submitPendingLabel="Đang lưu giao diện..."
            method="patch"
            serverError={error}
            fieldErrors={fieldErrors}
            warnOnUnsavedChanges
            resetDirtyOnSuccess={saved}
            renderFields={(fields, values) => {
              const take = (...names: string[]) =>
                fields.filter((field) => names.includes(field.name)).map((field) => field.node);
              return (
                <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start">
                  <div className="space-y-5">
                    <ThemeGroup
                      icon={Image}
                      title="Nhận diện"
                      description="Logo và favicon xuất hiện trên storefront, tab trình duyệt và dashboard."
                    >
                      <div className="grid gap-5 sm:grid-cols-2">
                        {take('logoUrl', 'faviconUrl')}
                      </div>
                    </ThemeGroup>

                    <ThemeGroup
                      icon={Palette}
                      title="Màu sắc và kiểu chữ"
                      description="Giữ độ tương phản tốt để nút, nội dung và trạng thái luôn dễ đọc."
                    >
                      <div className="grid gap-5 sm:grid-cols-2">
                        {take('colors.primary', 'colors.accent', 'colors.background', 'font')}
                      </div>
                    </ThemeGroup>

                    <ThemeGroup
                      icon={LayoutTemplate}
                      title="Trang chủ"
                      description="Thiết lập thông điệp đầu trang và thư viện ảnh giới thiệu dịch vụ."
                    >
                      <div className="grid gap-5 sm:grid-cols-2">
                        {take('hero.title', 'hero.subtitle', 'hero.imageUrl', 'carousel')}
                      </div>
                    </ThemeGroup>

                    <ThemeGroup
                      icon={Contact}
                      title="Liên hệ và mạng xã hội"
                      description="Thông tin công khai giúp khách liên hệ và kiểm tra độ tin cậy của cửa hàng."
                    >
                      <div className="grid gap-5 sm:grid-cols-2">
                        {take(
                          'contact.email',
                          'contact.phone',
                          'contact.address',
                          'socialLinks.facebook',
                          'socialLinks.instagram',
                          'socialLinks.tiktok',
                          'socialLinks.youtube',
                        )}
                      </div>
                    </ThemeGroup>

                    <ThemeGroup
                      icon={Search}
                      title="Tìm kiếm và chia sẻ"
                      description="Tiêu đề và mô tả được dùng cho công cụ tìm kiếm và thẻ chia sẻ."
                    >
                      <div className="grid gap-5 sm:grid-cols-2">
                        {take('seo.title', 'seo.description')}
                      </div>
                    </ThemeGroup>
                  </div>

                  <StorefrontThemePreview
                    tenantName={theme.name}
                    value={values}
                    storefrontUrl={storefrontUrl}
                  />
                </div>
              );
            }}
          />
        </fieldset>
      </CardContent>
    </Card>
  );
}

function ThemeGroup({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof Palette;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border bg-background p-4 sm:p-5">
      <div className="mb-5 flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}
