import { themeConfigSchema, type TenantThemeResponse } from '@booking/contracts';
import { GenericForm } from '@booking/ui/components/form/generic-form';
import { Alert, AlertDescription } from '@booking/ui/components/ui/alert';
import { FORM_ACTIONS_STICKY, FormSurface, Grid, Section } from '~/components/form-layout';
import {
  CheckCircle2,
  CircleAlert,
  Contact,
  Frame,
  Image,
  LayoutTemplate,
  Palette,
  Search,
} from 'lucide-react';
import { themeFields, toThemeDefaults } from './settings-fields';
import { PwaIconUploader } from './pwa-icon-uploader';
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
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-base font-semibold tracking-tight">
          Thương hiệu và nội dung storefront
        </h2>
        <p className="text-sm text-muted-foreground">
          Quản lý nhận diện, nội dung trang chủ và thông tin giúp khách tìm thấy cửa hàng.
        </p>
      </div>
      <div>
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
            actionsClassName={FORM_ACTIONS_STICKY}
            renderFields={(fields, values, form) => {
              const take = (...names: string[]) =>
                fields.filter((field) => names.includes(field.name)).map((field) => field.node);
              return (
                // 1750px, measured rather than guessed: the settings rail (216px),
                // each `Section`'s label rail (192px) and the preview (352px) all
                // bill to this row, and below that width the inputs drop under
                // ~200px. Until then the preview sits beneath the form, where it
                // costs the fields nothing.
                <div className="grid gap-6 min-[1750px]:grid-cols-[minmax(0,1fr)_22rem] min-[1750px]:items-start">
                  {/* One surface with divided sections — the dashboard's own
                      full-page-form pattern — instead of five bordered cards
                      inside a sixth. `Section`'s label rail also hands the
                      inputs the width the old nested layout wasted. */}
                  <FormSurface>
                    <Section
                      icon={<Image />}
                      title="Nhận diện"
                      description="Logo nhận diện storefront và các bề mặt thương hiệu chính."
                    >
                      <Grid>{take('logoUrl')}</Grid>
                    </Section>

                    <Section
                      icon={<LayoutTemplate />}
                      title="Favicon và biểu tượng ứng dụng"
                      description="Một ảnh nguồn tạo favicon cho tab và bộ icon khi khách cài storefront lên điện thoại."
                    >
                      <PwaIconUploader form={form} />
                    </Section>

                    <Section
                      icon={<Palette />}
                      title="Màu sắc và kiểu chữ"
                      description="Giữ độ tương phản tốt để nút, nội dung và trạng thái luôn dễ đọc."
                    >
                      <Grid>
                        {take(
                          'colors.primary',
                          'colors.accent',
                          'colors.background',
                          'font',
                          'baseSize',
                        )}
                      </Grid>
                    </Section>

                    <Section
                      icon={<Frame />}
                      title="Bo góc và bề mặt"
                      description="Quyết định storefront trông sắc hay mềm, đặc hay thoáng. Mọi giá trị đều được kẹp trong khoảng an toàn khi lưu."
                    >
                      <Grid>
                        {take(
                          'surface.radius',
                          'surface.imageRadius',
                          'surface.borderWidth',
                          'surface.borderColor',
                          'surface.cardPadding',
                          'surface.sectionGap',
                          'surface.shadow',
                        )}
                      </Grid>
                    </Section>

                    <Section
                      icon={<LayoutTemplate />}
                      title="Trang chủ"
                      description="Thiết lập thông điệp đầu trang và thư viện ảnh giới thiệu dịch vụ."
                    >
                      <Grid>
                        {take('hero.title', 'hero.subtitle', 'hero.imageUrl', 'carousel')}
                      </Grid>
                    </Section>

                    <Section
                      icon={<Contact />}
                      title="Liên hệ và mạng xã hội"
                      description="Thông tin công khai giúp khách liên hệ và kiểm tra độ tin cậy của cửa hàng."
                    >
                      <Grid>
                        {take(
                          'contact.email',
                          'contact.phone',
                          'contact.address',
                          'socialLinks.facebook',
                          'socialLinks.instagram',
                          'socialLinks.tiktok',
                          'socialLinks.youtube',
                        )}
                      </Grid>
                    </Section>

                    <Section
                      icon={<Search />}
                      title="Tìm kiếm và chia sẻ"
                      description="Tiêu đề và mô tả được dùng cho công cụ tìm kiếm và thẻ chia sẻ."
                    >
                      <Grid>{take('seo.title', 'seo.description')}</Grid>
                    </Section>
                  </FormSurface>

                  {/* Sticky: the form is taller than the viewport, so a preview
                      pinned to the top of the page is off-screen for most edits. */}
                  <div className="min-[1750px]:sticky min-[1750px]:top-24">
                    <StorefrontThemePreview
                      tenantName={theme.name}
                      value={values}
                      storefrontUrl={storefrontUrl}
                    />
                  </div>
                </div>
              );
            }}
          />
        </fieldset>
      </div>
    </div>
  );
}
