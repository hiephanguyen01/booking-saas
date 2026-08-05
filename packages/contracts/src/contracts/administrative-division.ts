import { z } from 'zod';

/** Official province-level code from Decision 19/2025/QĐ-TTg. */
export const provinceCodeSchema = z.string().regex(/^\d{2}$/, 'Mã tỉnh/thành phố không hợp lệ');

/** Official commune-level code from Decision 19/2025/QĐ-TTg. */
export const wardCodeSchema = z.string().regex(/^\d{5}$/, 'Mã phường/xã không hợp lệ');

export const administrativeProvinceTypeSchema = z.enum(['province', 'municipality']);
export type AdministrativeProvinceType = z.infer<typeof administrativeProvinceTypeSchema>;

export const administrativeWardTypeSchema = z.enum(['ward', 'commune', 'special_zone']);
export type AdministrativeWardType = z.infer<typeof administrativeWardTypeSchema>;

export const administrativeProvinceSchema = z.object({
  code: provinceCodeSchema,
  name: z.string().min(1),
  type: administrativeProvinceTypeSchema,
});
export type AdministrativeProvince = z.infer<typeof administrativeProvinceSchema>;

export const administrativeWardSchema = z.object({
  code: wardCodeSchema,
  provinceCode: provinceCodeSchema,
  name: z.string().min(1),
  type: administrativeWardTypeSchema,
});
export type AdministrativeWard = z.infer<typeof administrativeWardSchema>;

export const administrativeProvinceListSchema = z.array(administrativeProvinceSchema);
export const administrativeWardListSchema = z.array(administrativeWardSchema);

export const listAdministrativeWardsQuerySchema = z.object({
  provinceCode: provinceCodeSchema,
});
export type ListAdministrativeWardsQuery = z.infer<typeof listAdministrativeWardsQuerySchema>;

/** Canonical two-level Vietnamese address supplied by create/edit forms. */
export const administrativeAddressInputSchema = z.object({
  provinceCode: provinceCodeSchema,
  wardCode: wardCodeSchema,
  address: z.string().trim().min(1, 'Vui lòng nhập địa chỉ cụ thể').max(500),
});
export type AdministrativeAddressInput = z.infer<typeof administrativeAddressInputSchema>;

/** Exact public venue point used for distance ranking; both values always travel together. */
export const geographicPointInputSchema = z.object({
  latitude: z.coerce
    .number()
    .finite('Vĩ độ không hợp lệ')
    .min(-90, 'Vĩ độ không được nhỏ hơn -90')
    .max(90, 'Vĩ độ không được lớn hơn 90'),
  longitude: z.coerce
    .number()
    .finite('Kinh độ không hợp lệ')
    .min(-180, 'Kinh độ không được nhỏ hơn -180')
    .max(180, 'Kinh độ không được lớn hơn 180'),
});
export type GeographicPointInput = z.infer<typeof geographicPointInputSchema>;

export const geocodedAdministrativeAddressInputSchema = administrativeAddressInputSchema.merge(
  geographicPointInputSchema,
);
export type GeocodedAdministrativeAddressInput = z.infer<
  typeof geocodedAdministrativeAddressInputSchema
>;

/** Explicit, user-triggered forward-geocoding request for a Vietnamese venue address. */
export const geocodeAdministrativeAddressInputSchema = administrativeAddressInputSchema.extend({
  address: z.string().trim().min(3, 'Vui lòng nhập số nhà hoặc tên đường').max(200),
});
export type GeocodeAdministrativeAddressInput = z.infer<
  typeof geocodeAdministrativeAddressInputSchema
>;

export const geocodingCandidateSchema = geographicPointInputSchema.extend({
  displayName: z.string().min(1).max(1000),
});
export type GeocodingCandidate = z.infer<typeof geocodingCandidateSchema>;

export const geocodeAdministrativeAddressResponseSchema = z.object({
  candidates: z.array(geocodingCandidateSchema).max(5),
  attribution: z.object({
    label: z.string().min(1),
    url: z.string().url(),
  }),
});
export type GeocodeAdministrativeAddressResponse = z.infer<
  typeof geocodeAdministrativeAddressResponseSchema
>;

/** Stored address fields; nullable so records created before the migration remain readable. */
export const administrativeAddressSnapshotSchema = z.object({
  provinceCode: provinceCodeSchema.nullable(),
  provinceName: z.string().min(1).nullable(),
  wardCode: wardCodeSchema.nullable(),
  wardName: z.string().min(1).nullable(),
  address: z.string().nullable(),
});
export type AdministrativeAddressSnapshot = z.infer<typeof administrativeAddressSnapshotSchema>;

export const geocodedAdministrativeAddressSnapshotSchema =
  administrativeAddressSnapshotSchema.extend({
    latitude: z.number().min(-90).max(90).nullable(),
    longitude: z.number().min(-180).max(180).nullable(),
  });
export type GeocodedAdministrativeAddressSnapshot = z.infer<
  typeof geocodedAdministrativeAddressSnapshotSchema
>;
