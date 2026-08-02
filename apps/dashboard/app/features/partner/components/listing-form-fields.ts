import type {
  BookingMode,
  CreateListingInput,
  ListingResponse,
  ListingTypeResponse,
} from '@booking/contracts';
import type { FieldConfig } from '@booking/ui/components/form/types';
import {
  buildModeConfig,
  initialDynamic,
  savedModeConfig,
} from '~/features/partner/lib/listing-mode-config';

/** GenericForm field config for the partner listing form (presentation only). */
export function listingFormFields(opts: {
  listingTypes: ListingTypeResponse[];
  isEdit: boolean;
  lockedListingTypeId?: string;
  selectedListingTypeId?: string;
  minimumDepositPercent?: number | null;
}): FieldConfig<CreateListingInput>[] {
  const {
    listingTypes,
    isEdit,
    lockedListingTypeId,
    selectedListingTypeId,
    minimumDepositPercent,
  } = opts;
  const selectedType =
    listingTypes.find((type) => type.id === (lockedListingTypeId ?? selectedListingTypeId)) ??
    listingTypes[0];
  const itemLabel = selectedType?.itemLabel?.trim() || 'hạng mục';
  const titleExample = (() => {
    switch (selectedType?.slug) {
      case 'studio':
        return 'Ví dụ: Phòng Cyclorama trắng';
      case 'photography':
        return 'Ví dụ: Gói chụp chân dung ngoại cảnh';
      case 'makeup':
        return 'Ví dụ: Trang điểm cô dâu tại nhà';
      case 'equipment':
        return 'Ví dụ: Sony A7 IV kèm ống kính 24-70mm';
      case 'costume':
        return 'Ví dụ: Áo dài lụa đỏ thêu tay';
      case 'model':
        return 'Ví dụ: Model lookbook nữ tại TP.HCM';
      default:
        return `Ví dụ: ${selectedType?.name ?? 'Dịch vụ'} nổi bật`;
    }
  })();
  return [
    ...(!isEdit && !lockedListingTypeId
      ? [
          {
            name: 'listingTypeId' as const,
            type: 'select' as const,
            label: 'Loại dịch vụ',
            placeholder: 'Chọn loại dịch vụ',
            colSpan: 2 as const,
            options: listingTypes.map((t) => ({ label: t.name, value: t.id })),
          },
        ]
      : []),
    {
      name: 'title',
      type: 'text',
      label: `Tên ${itemLabel}`,
      required: true,
      description: titleExample,
      colSpan: 2,
    },
    {
      name: 'description',
      type: 'textarea',
      label: `Mô tả ${itemLabel}`,
      rows: 6,
      colSpan: 2,
    },
    {
      name: 'photos',
      type: 'file',
      label: 'Hình ảnh',
      target: 'listings',
      multiple: true,
      maxFiles: 12,
      reorderable: true,
      variant: 'gallery',
      colSpan: 2,
    },
    { name: 'bufferBefore', type: 'number', label: 'Đệm trước (phút)', colSpan: 1 },
    { name: 'bufferAfter', type: 'number', label: 'Đệm sau (phút)', colSpan: 1 },
    {
      name: 'capacity',
      type: 'number',
      label: 'Sức chứa (số khách tối đa)',
      description: 'Để trống nếu không giới hạn.',
      colSpan: 1,
    },
    {
      name: 'depositPercent',
      type: 'number',
      label: 'Đặt cọc (%)',
      description:
        minimumDepositPercent === null || minimumDepositPercent === undefined
          ? 'Booking vẫn được kiểm tra theo số commission thực tế trước khi thanh toán.'
          : `Tối thiểu ${minimumDepositPercent}% theo commission Tenant đang áp dụng.`,
      min: minimumDepositPercent ?? 0,
      max: 100,
      colSpan: 1,
    },
    {
      name: 'balanceDue',
      type: 'select',
      label: 'Thanh toán phần còn lại',
      colSpan: 1,
      options: [
        { label: 'Trực tuyến trước', value: 'online_before' },
        { label: 'Tại chỗ', value: 'on_arrival' },
      ],
    },
    {
      name: 'approvalRequired',
      type: 'switch',
      label: 'Yêu cầu duyệt trước khi thanh toán',
      colSpan: 2,
    },
  ];
}

/** Default values for create (blank) and edit (seeded from the listing). */
export function listingFormDefaults(opts: {
  partnerId: string;
  listingTypes: ListingTypeResponse[];
  listing?: ListingResponse;
  groupId?: string;
  lockedListingTypeId?: string;
  inheritedAddress?: { provinceCode: string; wardCode: string; address: string };
}): CreateListingInput {
  const { partnerId, listingTypes, listing, groupId, lockedListingTypeId, inheritedAddress } = opts;
  const selectedType =
    listingTypes.find(
      (type) => type.id === (listing?.listingTypeId ?? lockedListingTypeId ?? listingTypes[0]?.id),
    ) ?? listingTypes[0];
  const dynamic = initialDynamic(listing, selectedType?.defaultModes ?? []);
  return {
    partnerId,
    listingTypeId: listing?.listingTypeId ?? lockedListingTypeId ?? listingTypes[0]?.id ?? '',
    groupId: listing?.groupId ?? groupId,
    title: listing?.title ?? '',
    slug: listing?.slug,
    description: listing?.description ?? '',
    provinceCode: listing?.provinceCode ?? inheritedAddress?.provinceCode ?? '',
    wardCode: listing?.wardCode ?? inheritedAddress?.wardCode ?? '',
    address: listing?.address ?? inheritedAddress?.address ?? '',
    photos: listing?.photos ?? [],
    bookingModes: dynamic.bookingModes as BookingMode[],
    modeConfig: buildModeConfig(
      dynamic,
      savedModeConfig(listing),
      selectedType?.bookingSelection ?? listing?.bookingSelection ?? 'flexible_duration',
    ) as CreateListingInput['modeConfig'],
    attributes: listing?.attributes ?? {},
    stockQuantity: dynamic.bookingModes.includes('inventory')
      ? Number(dynamic.stockQuantity)
      : undefined,
    capacity: listing?.capacity ?? undefined,
    bufferBefore: listing?.bufferBefore ?? 0,
    bufferAfter: listing?.bufferAfter ?? 0,
    approvalRequired: listing?.approvalRequired ?? false,
    depositPercent: listing?.depositPercent ?? 100,
    balanceDue: (listing?.balanceDue as 'online_before' | 'on_arrival') ?? 'online_before',
    // Without this the edit form submits an empty policy and CLEARS the listing's
    // cancellation policy — a required checklist row for the reviewer.
    cancellationPolicyId: listing?.cancellationPolicyId ?? undefined,
  };
}
