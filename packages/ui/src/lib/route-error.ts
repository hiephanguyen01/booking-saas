export interface RouteErrorPresentation {
  status: number;
  title: string;
  description: string;
  retryable: boolean;
}

function statusOf(error: unknown): number {
  if (error && typeof error === 'object' && 'status' in error) {
    const status = (error as { status?: unknown }).status;
    if (typeof status === 'number') return status;
  }
  return 500;
}

export function routeErrorPresentation(error: unknown): RouteErrorPresentation {
  const status = statusOf(error);
  if (status === 401) {
    return {
      status,
      title: 'Phiên đăng nhập đã hết hạn',
      description: 'Vui lòng đăng nhập lại để tiếp tục.',
      retryable: false,
    };
  }
  if (status === 403) {
    return {
      status,
      title: 'Bạn không có quyền truy cập',
      description: 'Hãy chọn workspace khác hoặc liên hệ quản trị viên.',
      retryable: false,
    };
  }
  if (status === 404) {
    return {
      status,
      title: 'Không tìm thấy nội dung',
      description: 'Nội dung có thể đã được di chuyển hoặc không còn tồn tại.',
      retryable: false,
    };
  }
  if (status === 429) {
    return {
      status,
      title: 'Bạn thao tác quá nhanh',
      description: 'Vui lòng chờ một chút rồi thử lại.',
      retryable: true,
    };
  }
  if (status === 503 || status === 504) {
    return {
      status,
      title: 'Dịch vụ tạm thời không khả dụng',
      description: 'Hệ thống đang gián đoạn. Vui lòng thử lại sau ít phút.',
      retryable: true,
    };
  }
  return {
    status,
    title: 'Đã có lỗi xảy ra',
    description: 'Vui lòng thử lại. Nếu lỗi tiếp diễn, hãy liên hệ bộ phận hỗ trợ.',
    retryable: true,
  };
}
