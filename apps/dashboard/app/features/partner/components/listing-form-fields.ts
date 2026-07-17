import type {
  BookingMode,
  CancellationPolicySummary,
  CreateListingInput,
  ListingResponse,
  ListingTypeResponse,
} from '@booking/contracts';
import type { FieldConfig } from '@booking/ui/components/form/types';

/** GenericForm field config for the partner listing form (presentation only). */
export function listingFormFields(opts: {
  listingTypes: ListingTypeResponse[];
  cancellationPolicies: CancellationPolicySummary[];
  isEdit: boolean;
  lockedListingTypeId?: string;
}): FieldConfig<CreateListingInput>[] {
  const { listingTypes, cancellationPolicies, isEdit, lockedListingTypeId } = opts;
  return [
    {
      name: 'listingTypeId',
      type: 'select',
      label: 'Loại dịch vụ',
      placeholder: 'Chọn loại dịch vụ',
      disabled: isEdit || Boolean(lockedListingTypeId),
      colSpan: 2,
      options: listingTypes.map((t) => ({ label: t.name, value: t.id })),
    },
    { name: 'title', type: 'text', label: 'Tiêu đề', colSpan: 1 },
    {
      name: 'slug',
      type: 'text',
      label: 'Slug (đường dẫn)',
      placeholder: 'vd: studio-a-han-quoc',
      colSpan: 1,
    },
    { name: 'description', type: 'textarea', label: 'Mô tả', colSpan: 2 },
    {
      name: 'photos',
      type: 'file',
      label: 'Ảnh',
      target: 'listings',
      multiple: true,
      maxFiles: 12,
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
    { name: 'depositPercent', type: 'number', label: 'Đặt cọc (%)', colSpan: 1 },
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
    ...(cancellationPolicies.length
      ? [
          {
            name: 'cancellationPolicyId' as const,
            type: 'select' as const,
            label: 'Chính sách hủy',
            colSpan: 2,
            placeholder: 'Chọn chính sách hủy',
            options: cancellationPolicies.map((policy) => ({
              label: policy.name,
              value: policy.id,
            })),
          },
        ]
      : []),
  ];
}

/** Default values for create (blank) and edit (seeded from the listing). */
export function listingFormDefaults(opts: {
  partnerId: string;
  listingTypes: ListingTypeResponse[];
  listing?: ListingResponse;
  groupId?: string;
  lockedListingTypeId?: string;
}): CreateListingInput {
  const { partnerId, listingTypes, listing, groupId, lockedListingTypeId } = opts;
  return {
    partnerId,
    listingTypeId: listing?.listingTypeId ?? lockedListingTypeId ?? listingTypes[0]?.id ?? '',
    groupId: listing?.groupId ?? groupId,
    title: listing?.title ?? '',
    slug: listing?.slug ?? '',
    description: listing?.description ?? '',
    provinceCode: listing?.provinceCode ?? '',
    wardCode: listing?.wardCode ?? '',
    address: listing?.address ?? '',
    photos: listing?.photos ?? [],
    bookingModes: (listing?.bookingModes ?? []) as BookingMode[],
    modeConfig: {},
    attributes: listing?.attributes ?? {},
    stockQuantity: listing?.stockQuantity ?? undefined,
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
