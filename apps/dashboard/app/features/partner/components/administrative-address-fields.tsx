import { useEffect, useRef, useState } from 'react';
import { useFetcher } from 'react-router';
import type { AdministrativeProvince, AdministrativeWard } from '@booking/contracts';
import { FieldRenderer } from '@booking/ui/components/form/field-renderer';
import type { FieldValues, Path, UseFormReturn } from '@booking/ui/components/form/rhf';
import { Button } from '@booking/ui/components/ui/button';
import { LocateFixed, MapPin, Search } from 'lucide-react';
import { Grid, Section } from '~/components/form-layout';
import { dashboardPaths } from '~/constants/paths';
import type { GeocodeActionResult } from '~/features/partner/lib/geocoding';

type AddressValues = FieldValues & {
  provinceCode: string;
  wardCode: string;
  address: string;
  latitude: number;
  longitude: number;
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
  const geocodeFetcher = useFetcher<GeocodeActionResult>();
  const provinceCode = form.watch('provinceCode' as Path<T>) as string;
  const wardCode = form.watch('wardCode' as Path<T>) as string;
  const address = form.watch('address' as Path<T>) as string;
  const latitude = form.watch('latitude' as Path<T>) as number;
  const longitude = form.watch('longitude' as Path<T>) as number;
  const addressKey = `${provinceCode}:${wardCode}:${address.trim()}`;
  const previousProvinceCode = useRef(provinceCode);
  const previousAddressKey = useRef(addressKey);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
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

  useEffect(() => {
    if (previousAddressKey.current === addressKey) return;
    previousAddressKey.current = addressKey;
    form.setValue('latitude' as Path<T>, Number.NaN as never, {
      shouldDirty: true,
      shouldValidate: false,
    });
    form.setValue('longitude' as Path<T>, Number.NaN as never, {
      shouldDirty: true,
      shouldValidate: false,
    });
  }, [addressKey, form]);

  const provinces = provincesFetcher.data?.provinces ?? [];
  const wards = wardsFetcher.data?.provinceCode === provinceCode ? wardsFetcher.data.wards : [];
  const currentQueryKey = addressKey;
  const responseQueryKey = geocodeFetcher.data?.query
    ? `${geocodeFetcher.data.query.provinceCode}:${geocodeFetcher.data.query.wardCode}:${geocodeFetcher.data.query.address}`
    : null;
  const currentGeocodeResult = responseQueryKey === currentQueryKey ? geocodeFetcher.data : null;
  const selectedCandidate =
    Number.isFinite(latitude) && Number.isFinite(longitude) ? `${latitude}:${longitude}` : null;
  const selectedGeocodeCandidate = currentGeocodeResult?.candidates.find(
    (candidate) => `${candidate.latitude}:${candidate.longitude}` === selectedCandidate,
  );
  const geocoding = geocodeFetcher.state !== 'idle';

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
        <FieldRenderer<T>
          field={{
            name: 'latitude' as Path<T>,
            type: 'number',
            label: 'Vĩ độ',
            required: true,
            disabled,
            placeholder: '10.7756',
          }}
        />
        <FieldRenderer<T>
          field={{
            name: 'longitude' as Path<T>,
            type: 'number',
            label: 'Kinh độ',
            required: true,
            disabled,
            placeholder: '106.7039',
          }}
        />
        <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="control"
            disabled={
              disabled || geocoding || !provinceCode || !wardCode || address.trim().length < 3
            }
            onClick={() => {
              setLocationError(null);
              void geocodeFetcher.submit(
                { provinceCode, wardCode, address: address.trim() },
                {
                  method: 'post',
                  action: dashboardPaths.partner.geocode,
                  encType: 'application/json',
                },
              );
            }}
          >
            <Search aria-hidden />
            {geocoding ? 'Đang tìm tọa độ...' : 'Tìm theo địa chỉ'}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="control"
            disabled={disabled || locating}
            onClick={() => {
              if (!navigator.geolocation) {
                setLocationError('Thiết bị này không hỗ trợ lấy vị trí.');
                return;
              }
              setLocating(true);
              setLocationError(null);
              navigator.geolocation.getCurrentPosition(
                ({ coords }) => {
                  form.setValue(
                    'latitude' as Path<T>,
                    Number(coords.latitude.toFixed(6)) as never,
                    {
                      shouldDirty: true,
                      shouldValidate: true,
                    },
                  );
                  form.setValue(
                    'longitude' as Path<T>,
                    Number(coords.longitude.toFixed(6)) as never,
                    { shouldDirty: true, shouldValidate: true },
                  );
                  setLocating(false);
                },
                () => {
                  setLocationError(
                    'Không lấy được vị trí. Hãy cho phép truy cập hoặc nhập tọa độ.',
                  );
                  setLocating(false);
                },
                { enableHighAccuracy: true, maximumAge: 60_000, timeout: 10_000 },
              );
            }}
          >
            <LocateFixed aria-hidden />
            {locating ? 'Đang lấy vị trí...' : 'Dùng vị trí hiện tại'}
          </Button>
          <p className="text-xs text-muted-foreground">
            Tìm theo địa chỉ trước, sau đó chọn đúng kết quả. GPS phù hợp khi bạn đang có mặt tại
            địa điểm.
          </p>
          {locationError ? (
            <p className="w-full text-xs text-destructive">{locationError}</p>
          ) : null}
        </div>
        {currentGeocodeResult ? (
          <div className="sm:col-span-2 space-y-2 rounded-lg border bg-muted/30 p-3">
            {currentGeocodeResult.error ? (
              <p className="text-sm text-destructive">{currentGeocodeResult.error}</p>
            ) : currentGeocodeResult.candidates.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Không tìm thấy địa chỉ phù hợp. Hãy bổ sung số nhà/tên đường hoặc dùng GPS.
              </p>
            ) : (
              <>
                <p className="text-sm font-medium">Chọn kết quả đúng</p>
                <div className="space-y-2">
                  {currentGeocodeResult.candidates.map((candidate) => {
                    const candidateKey = `${candidate.latitude}:${candidate.longitude}`;
                    const chosen = selectedCandidate === candidateKey;
                    return (
                      <button
                        key={candidateKey}
                        type="button"
                        className="flex w-full items-start gap-2 rounded-md border bg-background px-3 py-2 text-left text-sm transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={disabled}
                        onClick={() => {
                          form.setValue('latitude' as Path<T>, candidate.latitude as never, {
                            shouldDirty: true,
                            shouldValidate: true,
                          });
                          form.setValue('longitude' as Path<T>, candidate.longitude as never, {
                            shouldDirty: true,
                            shouldValidate: true,
                          });
                        }}
                      >
                        <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
                        <span>
                          <span className="block">{candidate.displayName}</span>
                          <span className="text-xs text-muted-foreground">
                            {candidate.latitude}, {candidate.longitude}
                            {chosen ? ' · Đã chọn' : ''}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
                {selectedGeocodeCandidate ? (
                  <a
                    className="inline-block text-xs font-medium underline underline-offset-2"
                    href={`https://www.openstreetmap.org/?mlat=${selectedGeocodeCandidate.latitude}&mlon=${selectedGeocodeCandidate.longitude}#map=18/${selectedGeocodeCandidate.latitude}/${selectedGeocodeCandidate.longitude}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Xem điểm đã chọn trên bản đồ
                  </a>
                ) : null}
              </>
            )}
            {currentGeocodeResult.attribution ? (
              <a
                className="inline-block text-xs text-muted-foreground underline underline-offset-2"
                href={currentGeocodeResult.attribution.url}
                target="_blank"
                rel="noreferrer"
              >
                {currentGeocodeResult.attribution.label}
              </a>
            ) : null}
          </div>
        ) : null}
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
