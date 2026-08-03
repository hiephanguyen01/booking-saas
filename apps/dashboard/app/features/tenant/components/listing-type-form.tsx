import {
  createListingTypeInputSchema,
  listingTypeIconSchema,
  listingTypeSearchConfigSchema,
  type CreateListingTypeInput,
  type ListingTypeIcon,
  type ListingTypeResponse,
} from '@booking/contracts';
import { GenericForm } from '@booking/ui/components/form/generic-form';
import { Controller } from '@booking/ui/components/form/rhf';
import type { FieldConfig } from '@booking/ui/components/form/types';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@booking/ui/components/ui/select';
import { Label } from '@booking/ui/components/ui/label';
import { CalendarClock, ListChecks, Search, Shapes, Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';
import { useNavigation } from 'react-router';
import { IconPicker } from '~/components/icon-picker';
import {
  fieldNode,
  FORM_ACTIONS_ROW,
  FormSurface,
  Grid,
  Section,
} from '~/components/form-layout';
import {
  FormWizard,
  WizardContextStrip,
  WizardSection,
  WizardStepHint,
} from '~/components/form-wizard';
import { useFormWizard } from '~/hooks/use-form-wizard';
import { withGeneratedAttributeKeys } from '~/features/tenant/lib/listing-type-attribute-key';
import { isChoice, ListingTypeAttributeFields } from './listing-type-attribute-fields';
import {
  listingTypeSectionMap,
  LISTING_TYPE_STEP_FIELDS,
  type ListingTypeFormSectionId,
} from './listing-type-form-progress';
import { ListingTypeModesFields } from './listing-type-modes-fields';
import { ListingTypeSearchConfigFields } from './listing-type-search-config-fields';
import { normalizeSearchConfig } from './listing-type-search-config';

/** Header copy and glyph per section — shared by the wizard and the edit page. */
const SECTION_META: Record<
  ListingTypeFormSectionId,
  { title: string; description: string; icon: ReactNode; hint?: ReactNode; required?: boolean }
> = {
  'type-identity': {
    title: 'Nhận diện loại dịch vụ',
    description:
      'Tên và biểu tượng khách sẽ thấy trên storefront. Đường dẫn được tạo tự động khi lưu.',
    icon: <Sparkles aria-hidden />,
    hint: 'Nhập tên loại dịch vụ. Biểu tượng có thể bổ sung sau.',
  },
  'type-structure': {
    title: 'Cấu trúc và vận hành',
    description: 'Quy định cách loại dịch vụ này được tổ chức và quản lý.',
    icon: <Shapes aria-hidden />,
    hint: 'Chọn cấu trúc tin đăng. Tin đăng nhiều hạng mục cần thêm tên gọi hạng mục.',
  },
  'type-booking': {
    title: 'Cách khách đặt',
    description: 'Chọn luồng đặt chỗ và các đơn vị thời gian được phép.',
    icon: <CalendarClock aria-hidden />,
    hint: 'Giữ ít nhất một đơn vị thời gian được phép.',
  },
  'type-attributes': {
    title: 'Thông tin riêng',
    description: 'Những dữ liệu chỉ loại dịch vụ này mới cần khi đối tác tạo tin đăng.',
    icon: <ListChecks aria-hidden />,
    hint: 'Tùy chọn. Thuộc tính đã thêm phải có nhãn hợp lệ.',
    required: false,
  },
  'type-search': {
    title: 'Tìm kiếm trên storefront',
    description: 'Chọn lịch tìm kiếm và bộ lọc dành cho khách hàng.',
    icon: <Search aria-hidden />,
    hint: 'Có thể giữ nguyên thiết lập mặc định.',
    required: false,
  },
};

/** The scalar block — everything the field config can express. */
const fields: FieldConfig<CreateListingTypeInput>[] = [
  {
    name: 'name',
    type: 'text',
    label: 'Tên loại dịch vụ',
    placeholder: 'Ví dụ: Studio chụp ảnh',
    colSpan: 2,
  },
  {
    name: 'iconImageUrl',
    type: 'file',
    label: 'Biểu tượng (ảnh tải lên)',
    description: 'Ảnh hiển thị cạnh tên loại dịch vụ trên storefront. Nên dùng ảnh vuông, nền trong.',
    target: 'tenants',
    maxSizeMb: 1,
    colSpan: 2,
  },
  { name: 'sortOrder', type: 'number', label: 'Thứ tự hiển thị', colSpan: 1 },
  { name: 'isActive', type: 'switch', label: 'Đang hoạt động', colSpan: 1 },
  {
    name: 'requiresIdentityVerification',
    type: 'switch',
    label: 'Yêu cầu xác minh danh tính',
    colSpan: 1,
  },
  {
    name: 'structure',
    type: 'select',
    label: 'Cấu trúc tin đăng',
    colSpan: 1,
    options: [
      { value: 'standalone', label: 'Một hạng mục độc lập' },
      { value: 'grouped', label: 'Một tin đăng chứa nhiều hạng mục' },
      { value: 'flexible', label: 'Cho đối tác lựa chọn' },
    ],
  },
  {
    name: 'itemLabel',
    type: 'text',
    label: 'Tên gọi hạng mục',
    description: 'Ví dụ: phòng, gói dịch vụ, sân. Mặc định là “hạng mục”.',
    placeholder: 'hạng mục',
    colSpan: 1,
    hidden: (values) => values.structure === 'standalone',
  },
];

export function listingTypeFormDefaultValues(t?: ListingTypeResponse): CreateListingTypeInput {
  const structure = t?.structure ?? 'standalone';

  // The response types `icon` as a plain nullable string (legacy rows), so validate
  // it back into the allowlist before it seeds the picker.
  const parsedIcon = listingTypeIconSchema.safeParse(t?.icon);

  return {
    name: t?.name ?? '',
    icon: parsedIcon.success ? parsedIcon.data : undefined,
    iconImageUrl: t?.iconImageUrl ?? '',
    bookingSelection: t?.bookingSelection ?? 'flexible_duration',
    allowedModes: t?.allowedModes ?? ['hourly'],
    defaultModes: t?.defaultModes ?? [],
    sortOrder: t?.sortOrder ?? 0,
    isActive: t?.isActive ?? true,
    requiresIdentityVerification: t?.requiresIdentityVerification ?? false,
    structure,
    // A standalone type hides this field. Keep it absent so the schema does not
    // reject the hidden empty string before `transform` gets a chance to drop it.
    itemLabel: structure === 'standalone' ? undefined : (t?.itemLabel ?? ''),
    attributeSchema: t?.attributeSchema ?? [],
    searchConfig: t?.searchConfig ?? listingTypeSearchConfigSchema.parse({}),
  };
}

/**
 * Create and edit share one set of section bodies: the create route steps
 * through them with `FormWizard`, the edit route lays them all out on one
 * surface. Only the wrapper differs, so the two can't drift apart.
 */
export function ListingTypeForm({
  listingType,
  serverError,
  fieldErrors,
  mode,
}: {
  listingType?: ListingTypeResponse;
  serverError?: string | null;
  fieldErrors?: Record<string, string[]> | null;
  mode?: 'create-wizard' | 'edit-workspace';
}) {
  const isEdit = Boolean(listingType);
  const isWizard = (mode ?? (isEdit ? 'edit-workspace' : 'create-wizard')) === 'create-wizard';
  const navigation = useNavigation();
  const isSubmitting = navigation.state === 'submitting';
  const submitLabel = isEdit ? 'Lưu thay đổi' : 'Tạo loại dịch vụ';
  const wizard = useFormWizard({
    map: listingTypeSectionMap,
    fieldErrors,
    enabled: isWizard,
  });

  return (
    <GenericForm
      schema={createListingTypeInputSchema}
      fields={fields}
      columns={2}
      defaultValues={listingTypeFormDefaultValues(listingType)}
      submitLabel={submitLabel}
      serverError={serverError}
      fieldErrors={fieldErrors}
      className={isWizard ? 'space-y-4 pb-36 xl:pb-0' : undefined}
      actionsClassName={FORM_ACTIONS_ROW}
      showActions={!isWizard}
      warnOnUnsavedChanges
      onInvalid={wizard.revealInvalid}
      renderFields={(renderedFields, values, form) => {
        // The dynamic block — icon, booking modes, custom attribute schema and the
        // storefront search config. All bound to the same react-hook-form instance,
        // so the shared zod schema validates them and their values ride along in
        // the submitted payload.
        const bodies: Record<ListingTypeFormSectionId, ReactNode> = {
          'type-identity': (
            <>
              {fieldNode(renderedFields, 'name')}
              {fieldNode(renderedFields, 'iconImageUrl')}
              <Controller
                control={form.control}
                name="icon"
                render={({ field }) => (
                  <div className="space-y-2 rounded-lg border bg-muted/15 p-4">
                    <Label className="text-sm font-semibold">Biểu tượng từ thư viện</Label>
                    <IconPicker
                      value={(field.value as ListingTypeIcon | undefined) ?? null}
                      onChange={(icon) => field.onChange(icon)}
                      ariaLabel="Biểu tượng loại dịch vụ"
                    />
                    <p className="text-xs text-muted-foreground">
                      Ảnh tải lên ở trên được ưu tiên; icon này là phương án dự phòng.
                    </p>
                  </div>
                )}
              />
            </>
          ),
          'type-structure': (
            <Grid>
              {fieldNode(renderedFields, 'structure')}
              {fieldNode(renderedFields, 'itemLabel')}
              {fieldNode(renderedFields, 'sortOrder')}
              {fieldNode(renderedFields, 'isActive')}
              {fieldNode(renderedFields, 'requiresIdentityVerification')}
            </Grid>
          ),
          'type-booking': (
            <>
              <Controller
                control={form.control}
                name="bookingSelection"
                render={({ field }) => (
                  <div className="space-y-2">
                    <Label htmlFor="booking-selection">Kiểu chọn thời lượng</Label>
                    <Select
                      value={field.value}
                      disabled={Boolean(listingType?.listingCount)}
                      onValueChange={(value) => {
                        field.onChange(value);
                        if (value === 'fixed_packages') {
                          const allowed = form
                            .getValues('allowedModes')
                            .filter((bookingMode) => bookingMode === 'hourly' || bookingMode === 'daily');
                          form.setValue('allowedModes', allowed.length ? allowed : ['hourly']);
                          form.setValue(
                            'defaultModes',
                            form
                              .getValues('defaultModes')
                              .filter(
                                (bookingMode) => bookingMode === 'hourly' || bookingMode === 'daily',
                              ),
                          );
                        }
                      }}
                    >
                      <SelectTrigger id="booking-selection">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="flexible_duration">Đặt thời lượng linh hoạt</SelectItem>
                        <SelectItem value="fixed_packages">Chọn gói cố định</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      {listingType?.listingCount
                        ? 'Không thể đổi cách đặt vì loại này đã có tin đăng.'
                        : 'Gói cố định bắt buộc khách chọn một gói trước khi chọn lịch.'}
                    </p>
                  </div>
                )}
              />
              <ListingTypeModesFields form={form} />
            </>
          ),
          'type-attributes': <ListingTypeAttributeFields form={form} />,
          'type-search': <ListingTypeSearchConfigFields form={form} />,
        };

        if (!isWizard) {
          return (
            <FormSurface>
              {listingTypeSectionMap.sections.map((section) => (
                <Section
                  key={section.id}
                  title={SECTION_META[section.id].title}
                  description={SECTION_META[section.id].description}
                  icon={SECTION_META[section.id].icon}
                >
                  {bodies[section.id]}
                </Section>
              ))}
            </FormSurface>
          );
        }

        const progress = listingTypeSectionMap.getProgress(values);
        const errorSections = listingTypeSectionMap.getErrorSections(form.formState.errors);
        const complete = (id: ListingTypeFormSectionId) =>
          (progress.items.find((item) => item.id === id)?.complete ?? false) &&
          !errorSections.has(id);

        const sections = Object.fromEntries(
          listingTypeSectionMap.sections.map((section, index) => {
            const meta = SECTION_META[section.id];
            return [
              section.id,
              <WizardSection
                key={section.id}
                id={section.id}
                step={index + 1}
                title={meta.title}
                description={meta.description}
                icon={meta.icon}
                complete={wizard.completed.has(section.id) && complete(section.id)}
                error={errorSections.has(section.id) && wizard.attempted.has(section.id)}
                contentClassName="space-y-4"
              >
                {meta.hint ? (
                  <WizardStepHint required={meta.required}>{meta.hint}</WizardStepHint>
                ) : null}
                {bodies[section.id]}
              </WizardSection>,
            ];
          }),
        ) as Record<ListingTypeFormSectionId, ReactNode>;

        return (
          <FormWizard
            wizard={wizard}
            map={listingTypeSectionMap}
            sections={sections}
            progress={progress}
            errors={form.formState.errors}
            busy={isSubmitting}
            validateStep={(id) =>
              form.trigger(LISTING_TYPE_STEP_FIELDS[id], { shouldFocus: true })
            }
            contextStrip={
              <WizardContextStrip
                label="Loại dịch vụ mới"
                value={values.name?.trim() || 'Chưa đặt tên'}
                dirty={form.formState.isDirty}
              />
            }
            finalLabel={submitLabel}
            navTitle="Tạo loại dịch vụ"
            navDescription="Hoàn thành từng phần. Bạn có thể sửa lại sau khi tạo."
          />
        );
      }}
      transform={(d) => {
        const attributes = withGeneratedAttributeKeys(d.attributeSchema).map((attribute) =>
          isChoice(attribute.type) ? attribute : { ...attribute, options: undefined },
        );

        return {
          name: d.name.trim(),
          icon: d.icon,
          iconImageUrl: d.iconImageUrl || undefined,
          bookingSelection: d.bookingSelection,
          allowedModes: d.allowedModes,
          defaultModes: d.defaultModes,
          sortOrder: Math.max(0, Math.round(Number(d.sortOrder) || 0)),
          isActive: d.isActive,
          requiresIdentityVerification: d.requiresIdentityVerification,
          structure: d.structure,
          itemLabel:
            d.structure === 'standalone' ? undefined : d.itemLabel?.trim() || undefined,
          attributeSchema: attributes,
          searchConfig: normalizeSearchConfig(d.searchConfig, attributes, d.allowedModes),
        };
      }}
    />
  );
}
