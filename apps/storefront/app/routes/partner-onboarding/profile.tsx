import {
  partnerOnboardingProfileSchema,
  type AdministrativeWard,
  type PartnerOnboardingProfileInput,
} from '@booking/contracts';
import { FieldRenderer } from '@booking/ui/components/form/field-renderer';
import type { FieldConfig } from '@booking/ui/components/form/types';
import { Form } from '@booking/ui/components/ui/form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useRef } from 'react';
import { useForm, useWatch, type Path } from 'react-hook-form';
import { useActionData, useFetcher, useLoaderData, useNavigation, useSubmit } from 'react-router';
import {
  loadPartnerProfile,
  submitPartnerProfile,
  type PartnerOnboardingActionData,
} from '../../lib/partner-onboarding.server';
import { FormAlert } from './shared';
import type { Route } from './+types/profile';

export const meta = () => [
  { title: 'Hồ sơ đối tác · Booking Studio' },
  { name: 'robots', content: 'noindex,nofollow' },
];
export const loader = ({ request, params }: Route.LoaderArgs) =>
  loadPartnerProfile(request, params.locale);
export const action = ({ request, params }: Route.ActionArgs) =>
  submitPartnerProfile(request, params.locale);

const BANKS = [
  'Vietcombank',
  'BIDV',
  'VietinBank',
  'Agribank',
  'Techcombank',
  'MB Bank',
  'ACB',
  'VPBank',
  'Sacombank',
].map((value) => ({ label: value, value }));
const DEFAULTS: PartnerOnboardingProfileInput = {
  name: '',
  partnerType: 'company',
  representativeName: '',
  companyName: '',
  businessRegistrationNo: '',
  identityNumber: '',
  provinceCode: '',
  wardCode: '',
  address: '',
  phone: '',
  bank: '',
  bankAccountNumber: '',
  bankAccountHolder: '',
  businessLicenseFrontUrl: '',
  businessLicenseBackUrl: '',
  identityCardFrontUrl: '',
  identityCardBackUrl: '',
  acceptedTerms: false,
};

const field = (
  name: Path<PartnerOnboardingProfileInput>,
  label: string,
  type: 'text' | 'select' | 'file' = 'text',
  required = true,
): FieldConfig<PartnerOnboardingProfileInput> => {
  if (type === 'select')
    return { name, label, type, required, placeholder: 'Chọn', options: BANKS };
  if (type === 'file')
    return {
      name,
      label,
      type,
      required,
      target: 'partners',
      presignEndpoint: '/uploads/presign',
      variant: 'document',
    };
  return { name, label, type, required, placeholder: type === 'text' ? 'Nhập' : undefined };
};

const partnerTypeField: FieldConfig<PartnerOnboardingProfileInput> = {
  name: 'partnerType',
  label: 'Đối tượng kinh doanh',
  type: 'radio',
  variant: 'segmented',
  required: true,
  options: [
    { label: 'Tổ chức', value: 'company' },
    { label: 'Cá nhân', value: 'individual' },
  ],
};

function DocumentPair({ company }: { company: boolean }) {
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
      <FieldRenderer
        field={field(
          company ? 'businessLicenseFrontUrl' : 'identityCardFrontUrl',
          company ? 'Mặt trước GPKD' : 'Mặt trước CMND/CCCD',
          'file',
        )}
        appearance="partner"
      />
      <FieldRenderer
        field={field(
          company ? 'businessLicenseBackUrl' : 'identityCardBackUrl',
          company ? 'Mặt sau GPKD' : 'Mặt sau CMND/CCCD',
          'file',
        )}
        appearance="partner"
      />
    </div>
  );
}

export default function PartnerProfile() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<PartnerOnboardingActionData>();
  const navigation = useNavigation();
  const submit = useSubmit();
  const wardsFetcher = useFetcher<{
    provinceCode: string;
    wards: AdministrativeWard[];
  }>();
  const form = useForm<PartnerOnboardingProfileInput>({
    resolver: zodResolver(partnerOnboardingProfileSchema),
    defaultValues: DEFAULTS,
    mode: 'onSubmit',
    reValidateMode: 'onBlur',
    shouldUnregister: true,
  });
  const partnerType = useWatch({
    control: form.control,
    name: 'partnerType',
    defaultValue: 'company',
  });
  const provinceCode = useWatch({
    control: form.control,
    name: 'provinceCode',
    defaultValue: '',
  });
  const previousProvinceCode = useRef(provinceCode);
  const loadWards = wardsFetcher.load;
  useEffect(() => {
    if (previousProvinceCode.current !== provinceCode) {
      form.setValue('wardCode', '', { shouldDirty: true, shouldValidate: false });
      previousProvinceCode.current = provinceCode;
    }
    if (provinceCode) {
      void loadWards(
        `/administrative-divisions/wards?provinceCode=${encodeURIComponent(provinceCode)}`,
      );
    }
  }, [form, loadWards, provinceCode]);
  useEffect(() => {
    if (!actionData?.fieldErrors) return;
    for (const [name, messages] of Object.entries(actionData.fieldErrors)) {
      if (messages?.[0])
        form.setError(name as Path<PartnerOnboardingProfileInput>, {
          type: 'server',
          message: messages[0],
        });
    }
  }, [actionData?.fieldErrors, form]);
  const errorMessage =
    actionData?.error === 'slugTaken'
      ? 'Tên đối tác này đã được sử dụng. Vui lòng thử tên khác.'
      : actionData?.error === 'planLimit'
        ? 'Cửa hàng đã đạt giới hạn số đối tác.'
        : actionData?.error === 'tenantInactive'
          ? 'Cửa hàng hiện không nhận thêm hồ sơ đối tác.'
          : actionData?.error === 'invalidLocation'
            ? 'Địa chỉ hành chính không hợp lệ. Vui lòng chọn lại tỉnh và phường / xã.'
            : actionData?.error
              ? 'Không thể hoàn tất đăng ký. Vui lòng thử lại.'
              : undefined;
  const provinceOptions = loaderData.provinces.map((province) => ({
    label: province.name,
    value: province.code,
  }));
  const wardsData = wardsFetcher.data;
  const wards = wardsData?.provinceCode === provinceCode ? wardsData.wards : [];
  const wardOptions = wards.map((ward) => ({ label: ward.name, value: ward.code }));
  return (
    <main className="mx-auto w-full max-w-[1170px] px-4 pb-16 sm:px-6 lg:px-0">
      <section className="bg-white p-6 shadow-[0_4px_7.5px_rgba(0,0,0,0.07)] sm:p-10">
        <h1 className="mb-6 text-2xl font-semibold uppercase leading-9">
          Đăng ký trở thành đối tác
        </h1>
        <FormAlert>{errorMessage}</FormAlert>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((values) =>
              submit(values as never, { method: 'post', encType: 'application/json' }),
            )}
            noValidate
          >
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-x-10">
              <label className="block text-sm font-medium text-[#344054]">
                Email
                <span className="mt-2 flex h-14 items-center rounded-sm border border-[#d0d5dd] bg-[#f2f4f7] px-4 text-base font-medium text-[#667085]">
                  {loaderData.email}
                </span>
              </label>
              <FieldRenderer field={field('name', 'Tên đối tác')} appearance="partner" />
            </div>
            <div className="mt-6">
              <FieldRenderer field={partnerTypeField} appearance="partner" />
            </div>
            <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-x-10">
              <div className="space-y-4">
                {partnerType === 'company' ? (
                  <>
                    <FieldRenderer
                      field={field('companyName', 'Tên doanh nghiệp')}
                      appearance="partner"
                    />
                    <FieldRenderer
                      field={field('businessRegistrationNo', 'Số GPKD')}
                      appearance="partner"
                    />
                  </>
                ) : null}
                <FieldRenderer
                  field={field('representativeName', 'Người đại diện')}
                  appearance="partner"
                />
                <FieldRenderer
                  field={field('identityNumber', 'Số CMND/CCCD')}
                  appearance="partner"
                />
                <FieldRenderer
                  field={{
                    name: 'provinceCode',
                    label: 'Tỉnh / Thành phố',
                    type: 'combobox',
                    required: true,
                    placeholder: 'Chọn tỉnh / thành phố',
                    searchPlaceholder: 'Tìm tỉnh / thành phố...',
                    options: provinceOptions,
                  }}
                  appearance="partner"
                />
                <FieldRenderer
                  field={{
                    name: 'wardCode',
                    label: 'Phường / Xã / Đặc khu',
                    type: 'combobox',
                    required: true,
                    disabled: !provinceCode || wardsFetcher.state !== 'idle',
                    placeholder:
                      wardsFetcher.state !== 'idle'
                        ? 'Đang tải phường / xã...'
                        : provinceCode
                          ? 'Chọn phường / xã / đặc khu'
                          : 'Chọn tỉnh / thành phố trước',
                    searchPlaceholder: 'Tìm phường / xã...',
                    options: wardOptions,
                  }}
                  appearance="partner"
                />
                <FieldRenderer field={field('address', 'Địa chỉ cụ thể')} appearance="partner" />
                <div className="space-y-4 pt-1 text-base leading-6 text-[#1d2939]">
                  <p>
                    Bằng việc nhấn vào nút đăng ký, anh/chị đồng ý rằng Booking Studio có thể thu
                    thập, sử dụng và tiết lộ thông tin do anh/chị cung cấp. Theo Phụ lục 1 trong{' '}
                    <span className="text-primary">Hợp đồng đối tác</span>.
                  </p>
                  <FieldRenderer
                    field={{
                      name: 'acceptedTerms',
                      type: 'checkbox',
                      label: 'Tôi đồng ý với Hợp đồng đối tác của Booking Studio',
                      required: true,
                    }}
                    appearance="partner"
                  />
                </div>
              </div>
              <div className="space-y-4">
                <DocumentPair company={partnerType === 'company'} />
                {partnerType === 'company' ? <DocumentPair company={false} /> : null}
                <FieldRenderer field={field('phone', 'Số điện thoại')} appearance="partner" />
                <FieldRenderer field={field('bank', 'Ngân hàng', 'select')} appearance="partner" />
                <FieldRenderer
                  field={field('bankAccountNumber', 'Số tài khoản')}
                  appearance="partner"
                />
                <FieldRenderer
                  field={field('bankAccountHolder', 'Tên người thụ hưởng')}
                  appearance="partner"
                />
              </div>
            </div>
            <div className="mt-10 flex justify-center">
              <button
                type="submit"
                disabled={navigation.state === 'submitting'}
                className="h-14 w-full max-w-[400px] rounded-sm bg-primary text-base font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
              >
                {navigation.state === 'submitting' ? 'Đang đăng ký…' : 'Đăng ký'}
              </button>
            </div>
          </form>
        </Form>
      </section>
    </main>
  );
}
