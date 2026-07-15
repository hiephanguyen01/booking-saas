export interface FilterOptionMock {
  count: number;
  label: string;
  value: string;
}

export const MOCK_LOCATIONS: FilterOptionMock[] = [
  { value: 'quan-1', label: 'Quận 1', count: 85 },
  { value: 'quan-2', label: 'Quận 2', count: 12 },
  { value: 'quan-3', label: 'Quận 3', count: 15 },
  { value: 'quan-7', label: 'Quận 7', count: 5 },
  { value: 'phu-nhuan', label: 'Phú Nhuận', count: 45 },
  { value: 'binh-thanh', label: 'Bình Thạnh', count: 3 },
  { value: 'go-vap', label: 'Gò Vấp', count: 18 },
  { value: 'thu-duc', label: 'TP. Thủ Đức', count: 24 },
];

export const MOCK_STUDIO_AMENITIES: FilterOptionMock[] = [
  { value: 'Bãi đỗ ô tô', label: 'Bãi đỗ ô tô', count: 34 },
  { value: 'Bãi đỗ xe máy', label: 'Bãi đỗ xe máy', count: 314 },
  { value: 'Cho phép thú cưng', label: 'Cho phép thú cưng', count: 4 },
  { value: 'Mở cửa 24h', label: 'Mở cửa 24h', count: 78 },
  { value: 'Camera an ninh', label: 'Camera an ninh', count: 245 },
  { value: 'Lễ tân', label: 'Lễ tân', count: 98 },
  { value: 'Thang máy', label: 'Thang máy', count: 123 },
  { value: 'Wifi miễn phí', label: 'Wifi miễn phí', count: 333 },
];

export const MOCK_ROOM_AMENITIES: FilterOptionMock[] = [
  { value: 'Backdrop', label: 'Backdrop', count: 135 },
  { value: 'Đèn reflector', label: 'Đèn reflector', count: 314 },
  { value: 'Đèn strobe', label: 'Đèn strobe', count: 4 },
  { value: 'Ghế, sofa', label: 'Ghế, sofa', count: 78 },
  { value: 'Máy tính', label: 'Máy tính', count: 245 },
  { value: 'Phòng thay đồ riêng', label: 'Phòng thay đồ riêng', count: 98 },
  { value: 'Máy lạnh', label: 'Máy lạnh', count: 98 },
  { value: 'Gương', label: 'Gương', count: 98 },
  { value: 'Máy lọc không khí', label: 'Máy lọc không khí', count: 98 },
];
