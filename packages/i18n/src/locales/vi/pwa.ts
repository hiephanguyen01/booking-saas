export const viPwa = {
  install: {
    title: 'Cài ứng dụng của cửa hàng',
    titleFallback: 'Cài ứng dụng của cửa hàng',
    description: 'Mở nhanh từ màn hình chính và dùng trang dự phòng khi mất mạng.',
    descriptionFallback: 'Mở nhanh từ màn hình chính và dùng trang dự phòng khi mất mạng.',
    headerAction: 'Cài app',
    compactAction: 'Cài',
    action: 'Cài ngay',
    later: 'Để sau',
    dismiss: 'Đóng lời mời cài đặt',
  },
  ios: {
    title: 'Thêm vào Màn hình chính',
    description: 'Trên iPhone và iPad, hãy cài ứng dụng qua menu Chia sẻ của trình duyệt.',
    shareStep: 'Chạm nút Chia sẻ trên thanh công cụ của trình duyệt.',
    addStep: 'Chọn “Thêm vào Màn hình chính”, sau đó xác nhận Thêm.',
    close: 'Đã hiểu',
  },
  android: {
    title: 'Cài từ Chrome',
    description: 'Chrome có thể thêm ứng dụng vào màn hình chính từ menu trình duyệt.',
    menuStep: 'Chạm menu ba chấm ở góc trên của Chrome.',
    addStep: 'Chọn “Cài ứng dụng” hoặc “Thêm vào màn hình chính”, sau đó xác nhận.',
  },
  browser: {
    iosTitle: 'Mở bằng Safari để cài app',
    iosDescription: 'Trình duyệt hiện tại không cung cấp luồng cài ứng dụng trên iPhone hoặc iPad.',
    iosOpenStep: 'Dùng menu Chia sẻ hoặc menu của trình duyệt để mở trang này bằng Safari.',
    iosAddStep: 'Trong Safari, chạm Chia sẻ rồi chọn “Thêm vào Màn hình chính”.',
    androidTitle: 'Mở bằng Chrome để cài app',
    androidDescription: 'Trình duyệt hiện tại không cung cấp luồng cài ứng dụng trên Android.',
    androidOpenStep: 'Dùng menu của trình duyệt để mở trang này bằng Chrome.',
    androidAddStep: 'Trong Chrome, mở menu rồi chọn “Cài ứng dụng” hoặc “Thêm vào màn hình chính”.',
  },
  guide: {
    close: 'Đã hiểu',
  },
  update: {
    title: 'Có phiên bản mới',
    description: 'Cập nhật khi bạn sẵn sàng. Trang sẽ tải lại một lần.',
    action: 'Cập nhật',
  },
} as const;
