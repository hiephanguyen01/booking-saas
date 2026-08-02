import { useEffect, useRef } from 'react';
import { useFetcher } from 'react-router';
import type { AdministrativeProvince, AdministrativeWard } from '@booking/contracts';
import { FieldRenderer } from '@booking/ui/components/form/field-renderer';
import type { FieldValues, Path, UseFormReturn } from '@booking/ui/components/form/rhf';
import { Grid, Section } from '~/components/form-layout';

type AddressValues = FieldValues & {
  provinceCode: string;
  wardCode: string;
  address: string;
};

export function AdministrativeAddressFields<T extends AddressValues>({
  form,
  embedded = false,
  disabled = false,
}: {
  form: UseFormReturn<T>;
  embedded?: boolean;
  disabled?: boolean;
}) {
  const provincesFetcher = useFetcher<{ provinces: AdministrativeProvince[] }>();
  const wardsFetcher = useFetcher<{ provinceCode: string; wards: AdministrativeWard[] }>();
  const provinceCode = form.watch('provinceCode' as Path<T>) as string;
  const previousProvinceCode = useRef(provinceCode);
  const loadProvinces = provincesFetcher.load;
  const loadWards = wardsFetcher.load;

  useEffect(() => {
    void loadProvinces('/administrative-divisions/provinces');
  }, [loadProvinces]);

  useEffect(() => {
    if (previousProvinceCode.current !== provinceCode) {
      form.setValue('wardCode' as Path<T>, '' as never, {
        shouldDirty: true,
        shouldValidate: false,
      });
      previousProvinceCode.current = provinceCode;
    }
    if (provinceCode) {
      void loadWards(
        `/administrative-divisions/wards?provinceCode=${encodeURIComponent(provinceCode)}`,
      );
    }
  }, [form, loadWards, provinceCode]);

  const provinces = provincesFetcher.data?.provinces ?? [];
  const wards = wardsFetcher.data?.provinceCode === provinceCode ? wardsFetcher.data.wards : [];

  const fields = (
    <>
      <Grid>
        <FieldRenderer<T>
          field={{
            name: 'provinceCode' as Path<T>,
            type: 'combobox',
            label: 'Tỉnh / Thành phố',
            required: true,
            disabled,
            placeholder:
              provincesFetcher.state !== 'idle' ? 'Đang tải...' : 'Chọn tỉnh / thành phố',
            searchPlaceholder: 'Tìm tỉnh / thành phố...',
            options: provinces.map((province) => ({
              label: province.name,
              value: province.code,
            })),
          }}
        />
        <FieldRenderer<T>
          field={{
            name: 'wardCode' as Path<T>,
            type: 'combobox',
            label: 'Phường / Xã / Đặc khu',
            required: true,
            disabled: disabled || !provinceCode || wardsFetcher.state !== 'idle',
            placeholder:
              wardsFetcher.state !== 'idle'
                ? 'Đang tải phường / xã...'
                : provinceCode
                  ? 'Chọn phường / xã / đặc khu'
                  : 'Chọn tỉnh / thành phố trước',
            searchPlaceholder: 'Tìm phường / xã...',
            options: wards.map((ward) => ({ label: ward.name, value: ward.code })),
          }}
        />
        <div className="sm:col-span-2">
          <FieldRenderer<T>
            field={{
              name: 'address' as Path<T>,
              type: 'text',
              label: 'Địa chỉ cụ thể',
              required: true,
              disabled,
              placeholder: 'Số nhà, tên đường...',
            }}
          />
        </div>
      </Grid>
    </>
  );

  if (embedded) return fields;

  return (
    <Section
      title="Địa chỉ"
      description="Địa chỉ này được dùng để hiển thị khu vực hoạt động và giúp khách tìm đúng địa điểm."
    >
      {fields}
    </Section>
  );
}
