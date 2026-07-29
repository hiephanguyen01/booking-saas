export const viErrors = {
  pageNotFound: 'Không tìm thấy trang',
  generic: 'Đã có lỗi xảy ra.',
  home: 'Về trang chủ',
  tenantSuspendedTitle: '{tenant} tạm ngưng hoạt động',
  tenantSuspendedDescription:
    'Trang đặt chỗ này hiện không khả dụng. Vui lòng liên hệ chủ cửa hàng để biết thêm chi tiết.',
  tenantUnavailable: 'Cửa hàng hiện đang tạm ngưng hoạt động. Vui lòng quay lại sau.',
  invalidProvinceCode: 'Mã tỉnh/thành phố không hợp lệ.',
  api: {
    timeout: 'Yêu cầu đã hết thời gian chờ. Vui lòng thử lại.',
    network: 'Dịch vụ tạm thời không khả dụng. Vui lòng thử lại.',
    invalidResponse: 'Dịch vụ trả về phản hồi không hợp lệ. Vui lòng thử lại.',
    generic: 'Không thể hoàn tất yêu cầu. Vui lòng thử lại.',
  },
} as const;
