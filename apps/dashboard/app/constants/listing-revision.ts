/**
 * Display labels for a listing edit awaiting review (§7.3) — shared by the
 * partner's "chờ duyệt" banner and the tenant reviewer's before/after diff, so
 * both sides name a field the same way.
 */

/** Vietnamese label for each diff section, in the order the edit form shows them. */
export const REVISION_SECTION_LABEL: Record<string, string> = {
  content: 'Nội dung & ảnh',
  location: 'Địa điểm',
  pricing: 'Dịch vụ & giá',
  policy: 'Vận hành, thanh toán & chính sách',
};

/** Vietnamese label for each editable field a diff can mention. */
export const REVISION_FIELD_LABEL: Record<string, string> = {
  title: 'Tiêu đề',
  description: 'Mô tả',
  photos: 'Hình ảnh',
  categoryId: 'Danh mục',
  amenities: 'Tiện ích chung',
  provinceCode: 'Tỉnh / Thành phố',
  wardCode: 'Phường / Xã',
  address: 'Địa chỉ cụ thể',
  workingArea: 'Khu vực hoạt động',
  attributes: 'Thông tin hạng mục',
  bookingModes: 'Hình thức đặt',
  modeConfig: 'Giá & gói dịch vụ',
  stockQuantity: 'Số lượng trong kho',
  capacity: 'Sức chứa',
  bufferBefore: 'Đệm trước',
  bufferAfter: 'Đệm sau',
  approvalRequired: 'Yêu cầu duyệt trước khi thanh toán',
  depositPercent: 'Đặt cọc (%)',
  balanceDue: 'Thanh toán phần còn lại',
  cancellationPolicyId: 'Chính sách hủy',
};
