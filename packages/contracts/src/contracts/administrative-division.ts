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

/** Stored address fields; nullable so records created before the migration remain readable. */
export const administrativeAddressSnapshotSchema = z.object({
  provinceCode: provinceCodeSchema.nullable(),
  provinceName: z.string().min(1).nullable(),
  wardCode: wardCodeSchema.nullable(),
  wardName: z.string().min(1).nullable(),
  address: z.string().nullable(),
});
export type AdministrativeAddressSnapshot = z.infer<typeof administrativeAddressSnapshotSchema>;
