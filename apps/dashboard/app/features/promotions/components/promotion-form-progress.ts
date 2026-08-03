import { createFormProgress, type FormSectionDefinition } from '~/lib/form-progress';

const SECTIONS = [
  {
    id: 'promotion-delivery',
    label: 'Cách khách nhận ưu đãi',
    shortLabel: 'Cách nhận',
  },
  {
    id: 'promotion-discount',
    label: 'Mức ưu đãi',
    shortLabel: 'Mức giảm',
  },
  {
    id: 'promotion-scope',
    label: 'Phạm vi áp dụng',
    shortLabel: 'Phạm vi',
  },
  {
    id: 'promotion-conditions',
    label: 'Điều kiện sử dụng',
    shortLabel: 'Điều kiện',
  },
  {
    id: 'promotion-schedule',
    label: 'Lịch chạy',
    shortLabel: 'Lịch chạy',
  },
] as const satisfies ReadonlyArray<FormSectionDefinition<string>>;

export type PromotionFormSectionId = (typeof SECTIONS)[number]['id'];

const FIELD_SECTION: Record<string, PromotionFormSectionId> = {
  name: 'promotion-delivery',
  code: 'promotion-delivery',
  isAuto: 'promotion-delivery',
  storefrontVisible: 'promotion-delivery',

  discountType: 'promotion-discount',
  discountValue: 'promotion-discount',
  maxDiscount: 'promotion-discount',
  fundedBy: 'promotion-discount',

  appliesTo: 'promotion-scope',
  appliesToId: 'promotion-scope',

  minOrderAmount: 'promotion-conditions',
  usageLimitTotal: 'promotion-conditions',
  usageLimitPerCustomer: 'promotion-conditions',
  firstBookingOnly: 'promotion-conditions',

  status: 'promotion-schedule',
  startsAt: 'promotion-schedule',
  endsAt: 'promotion-schedule',
  timeWindows: 'promotion-schedule',
};

/**
 * The promotion form's sections and its field → section map. No schema: this
 * form is a plain `<Form>` validated by the browser and re-validated in the
 * route action, so the wizard derives progress from the steps the user has
 * passed (`progressFromCompleted`) rather than from a client-side parse.
 */
export const promotionSectionMap = createFormProgress<PromotionFormSectionId, never>({
  sections: SECTIONS,
  fieldSection: FIELD_SECTION,
});
