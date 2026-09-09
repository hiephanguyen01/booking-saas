# Thiết kế Kiến trúc Cải tiến: Thanh toán, Hoàn tiền Tinh gọn, Tạm giữ & Sổ cái Kép (BookingOS)

- **Tài liệu:** `docs/superpowers/specs/2026-09-09-lean-payments-refunds-and-custody-architecture-design.md`
- **Ngày lập:** 2026-09-09 (Cập nhật: Tinh giản theo phản biện - Bỏ hoàn toàn 4 mắt và Bỏ Rolling Reserve)
- **Tác giả:** Antigravity & CyberBear Core Team
- **Trạng thái:** Chờ phê duyệt (Pending User Review)

---

## 1. Bối cảnh & Vấn đề Cần Giải quyết

Qua quá trình rà soát mã nguồn thực tế của hệ thống BookingOS tại các module `booking`, `payments` và `finance`, hệ thống đã làm rõ **3 điểm bất cập và hướng cải tiến trọng yếu**:

1. **Quy trình Hoàn tiền SePay 4 mắt (Maker-Checker 7 trạng thái) bị Rườm rà (Over-Engineered):**
   - Bắt buộc phải có 2 nhân sự riêng biệt (Maker lập lệnh + Checker duyệt) là không khả thi với các đối tác vừa và nhỏ (SME Studio, Sân thể thao chỉ có 1-2 người).
   - Tồn tại trạng thái xác minh số tài khoản thủ công (`verification_required`) làm chậm trễ tiến độ hoàn tiền và gây khó chịu cho khách hàng.
2. **Lỗ hổng Thâm hụt Hoa hồng do Tiền cọc thấp hơn Hoa hồng (`max0` Clamping Deficit):**
   - Tại `settlement.entity.ts`, hệ thống dùng hàm `max0(partnerShare - onsiteCollectedAmount)` để tính số tiền trả cho đối tác.
   - Khi đối tác cấu hình tiền cọc thấp (ví dụ 10%), nhưng hoa hồng nền tảng là 15-20%, đối tác thu 90% tiền mặt tại chỗ. Khoản hoa hồng còn thiếu bị hệ thống kẹp về 0 thay vì ghi nợ, gây **thất thoát doanh thu hoa hồng âm thầm** cho nền tảng.
3. **Trải nghiệm Khách hàng Kém khi Webhook Đến Trễ bị Đè Slot (Late Webhook Slot Conflict):**
   - Khi khách thanh toán sát nút (quá 15 phút giữ chỗ), nếu slot bị người khác đặt, hệ thống kích hoạt `autoRefundSlotTaken` hủy đơn và hoàn tiền nhưng không cảnh báo trước và không có giải pháp hỗ trợ chọn lại giờ thuận tiện.

*(Lưu ý: Không triển khai Quỹ Dự phòng gối đầu Rolling Reserve 14 ngày vì hệ thống đã có Cửa sổ Khóa Payout 72h giữ 100% tiền trước khi giải ngân, việc giam thêm 7% là thừa thãi và gây ức chế dòng tiền cho đối tác).*

---

## 2. Thiết kế Chi tiết Từng Cấu phần

```mermaid
flowchart TD
    subgraph 1. Lean Refund Engine
        RF_START[Yêu cầu Hoàn tiền] --> NAPAS[Auto Lookup Napas/VietQR 500ms]
        NAPAS --> THRESH{Ngưỡng Số tiền?}
        THRESH -->|< 2.000.000 VND| PAYOUT_API[VietQR Payout API Tự động 30s]
        THRESH -->|>= 2.000.000 VND| MANUAL_1STEP[Chuyển khoản 1 Bước + Upload Bill]
        PAYOUT_API --> RF_DONE[completed]
        MANUAL_1STEP --> RF_DONE
    end

    subgraph 2. Financial Integrity & Invariants
        DEP_RULE[min_deposit >= commission + tax + fee]
        NO_MAX0[Loại bỏ max0 -> Ghi Nợ 131_PARTNER_RECEIVABLE]
    end

    subgraph 3. Streamlined Custody & Settlement
        HOLD[Ký quỹ held 100%] --> SERVICE[Diễn ra Dịch vụ]
        SERVICE --> DISPUTE_WIN[Cửa sổ Khiếu nại 72h]
        DISPUTE_WIN -->|Không khiếu nại| RELEASE_100[Giải ngân 100% Doanh thu cho Đối tác]
        DISPUTE_WIN -->|Khách khiếu nại| FREEZE[Đóng băng disputed chờ Admin]
    end
```

---

### Cấu phần 1: Bộ máy Hoàn tiền Tinh gọn (Lean Refund Engine - Xóa bỏ 4 Mắt)

#### 1. Rút gọn Máy trạng thái (Từ 7 trạng thái xuống 3 trạng thái)
Loại bỏ hoàn toàn các trạng thái: `verification_required`, `correction_required`, `transfer_submitted`, `transfer_rejected`.

Enum `manualRefundOperationStatusSchema` trong `packages/contracts/src/contracts/payment.ts`:
```typescript
export const manualRefundOperationStatusSchema = z.enum([
  'awaiting_details',     // Chờ khách cung cấp thông tin tài khoản ngân hàng
  'ready_for_transfer',   // Đã có STK (tự động verify Napas), sẵn sàng chi trả
  'completed',            // Hoàn tất thành công (Terminal)
  'failed',               // Thất bại vĩnh viễn (Terminal)
]);
export type ManualRefundOperationStatus = z.infer<typeof manualRefundOperationStatusSchema>;
```

#### 2. Tự động Tra cứu Napas (Napas / VietQR Lookup API)
- Endpoint backend: `POST /api/v1/payments/lookup-bank-account`.
- Input: `{ bankBin: string, accountNumber: string }`.
- Output: `{ accountName: string, isValid: boolean }`.
- Khi khách chọn ngân hàng và gõ STK, hệ thống gọi API tra cứu và hiển thị tên chủ thẻ in hoa (ví dụ: `NGUYEN VAN A`) sau 500ms. Khách nhấn xác nhận $\rightarrow$ chuyển thẳng sang `ready_for_transfer`.

#### 3. Hai Luồng Xử lý Hoàn tiền Tinh gọn:
* **Luồng A - Tự động Chi hộ (VietQR Payout API):**
  - Điều kiện: Số tiền hoàn $\le 2.000.000$ VND và Gateway có hỗ trợ Payout (PayOS Payout hoặc SePay Corporate API).
  - Use case: `ExecuteAutoPayoutUseCase` tự động gọi API Payout trong 30 giây.
  - Khi API trả về thành công $\rightarrow$ Chuyển trạng thái sang `completed`.
* **Luồng B - Chuyển khoản Thủ công 1 Bước (1-Step Manual with Proof):**
  - Điều kiện: Số tiền $> 2.000.000$ VND hoặc Gateway không bật API Payout.
  - Màn hình Dashboard hiển thị mã VietQR động với cú pháp chuyển tiền chuẩn xác.
  - Bất kỳ nhân sự nào có quyền quản trị (Chủ cơ sở, Quản lý hoặc Kế toán) quét mã chuyển khoản, tải ảnh biên lai và bấm **"Xác nhận đã chuyển tiền"**.
  - Hệ thống ghi nhận trạng thái `completed` ngay lập tức. **Không cần người thứ hai (Checker) duyệt.**

---

### Cấu phần 2: Bảo vệ Thâm hụt Hoa hồng & Sổ cái Kép Minh bạch

#### 1. Ràng buộc Tỷ lệ Cọc Tối thiểu (Deposit Floor Invariant)
Tại tầng Domain & Zod Schema khi tạo/chỉnh sửa Listing:
$$\text{min\_deposit\_percentage} \ge \text{tenant\_commission\_rate} + \text{platform\_fee\_rate} + \text{vat\_rate}$$
- Nếu đối tác nhập tỷ lệ cọc thấp hơn tổng nghĩa vụ tài chính nền tảng được hưởng $\rightarrow$ Báo lỗi `DepositBelowCommissionFloorError` và từ chối lưu.

#### 2. Xóa bỏ Hàm Kẹp `max0` & Ghi nhận Nợ Phải thu Đối tác (`131_PARTNER_RECEIVABLE`)
Tại `apps/api/src/modules/finance/domain/entities/settlement.entity.ts`:
```typescript
const netPartnerDue = 
  split.partnerShare - 
  onsiteCollectedAmount - 
  split.partnerVatWithheld - 
  split.partnerPitWithheld;

if (netPartnerDue < 0n) {
  // Đối tác thu thừa tiền mặt tại chỗ, nợ lại nền tảng tiền hoa hồng
  partnerPayable = 0n;
  partnerReceivable = -netPartnerDue;
} else {
  partnerPayable = netPartnerDue;
  partnerReceivable = 0n;
}
```

Bút toán Sổ cái kép khi `partnerReceivable > 0n`:
- **Nợ:** `131_PARTNER_RECEIVABLE` (Phải thu đối tác - số tiền thiếu)
- **Có:** `511_PLATFORM_REVENUE` (Ghi nhận đủ 100% doanh thu hoa hồng)
- Số dư nợ này sẽ lập tức trừ vào ví đối tác hoặc cấn trừ tự động vào các đơn tiếp theo.

---

### Cấu phần 3: Tối ưu Cửa sổ Ký quỹ (Custody) 72h & Rút tiền Nhanh

1. **Giữ 100% Tiền trong Cửa sổ 72h:**
   - Trong suốt thời gian từ lúc khách thanh toán đến **72 giờ sau khi kết thúc dịch vụ**, toàn bộ $100\%$ tiền thanh toán nằm an toàn trong tài khoản ký quỹ trung gian (`booking_settlements.status = 'held'`).
   - Khách có quyền mở khiếu nại (Open Dispute) bất kỳ lúc nào trong 72h này nếu dịch vụ không đúng cam kết.
2. **Giải ngân Trọn vẹn (100% Fast Release):**
   - Hết thời hạn 72h mà không phát sinh khiếu nại: Settlement tự động chuyển sang `released`.
   - Đối tác nhận trọn vẹn $100\%$ doanh thu thuần của mình vào ví và được quyền tạo lệnh rút tiền (Payout) ngay lập tức, không bị giữ lại bất kỳ khoản dự phòng gối đầu nào.

---

### Cấu phần 4: Xử lý Tranh chấp Slot khi Webhook Đến Trễ & Trải nghiệm Người dùng

1. **Cảnh báo Sắp Hết hạn Giữ chỗ (T-3 Minutes Countdown Reminder):**
   - Lên lịch notification job tại phút thứ 12 của chu kỳ 15 phút `pending_payment`.
   - Gửi cảnh báo: *"Chỉ còn 3 phút để hoàn tất thanh toán giữ chỗ"*.
2. **Khắc phục `SlotTakenError` trong `confirm-booking.use-case.ts`:**
   - Khi webhook đến trễ và slot đã bị chiếm:
     - Kích hoạt hoàn tiền $100\%$ tự động qua Luồng A (VietQR Payout trong 30 giây).
     - Phát sự kiện Outbox `booking.slot_conflict_compensated`.
     - Tạo **Priority Rebooking Token** (Mã ưu tiên đổi giờ) kèm voucher giảm $5\% - 10\%$ gửi cho khách qua SMS/Email/In-app, cho phép khách 1-click chọn lại khung giờ mới mà không mất công nhập lại toàn bộ thông tin.

---

## 3. Kế hoạch Triển khai & Tác động Kiến trúc

| Giai đoạn | Nội dung Triển khai | Tệp tin Tác động |
| :--- | :--- | :--- |
| **Giai đoạn 1** | Tinh gọn Contract & Xóa bỏ 4 Mắt | `packages/contracts/src/contracts/payment.ts`, `apps/api/src/modules/payments/` |
| **Giai đoạn 2** | Sửa lỗi `max0` & Bổ sung Invariant Cọc tối thiểu | `apps/api/src/modules/finance/domain/entities/settlement.entity.ts`, `catalog` |
| **Giai đoạn 3** | Tối ưu Cửa sổ 72h & Xử lý Tranh chấp Slot | `confirm-booking.use-case.ts`, `notification` module |

---

## 4. Cam kết Kiến trúc & Kiểm thử (Architecture Invariants)
- Toàn bộ giá trị tiền tệ sử dụng `bigint` VND.
- Đảm bảo tính cân bằng tuyệt đối của Sổ cái kép ($\sum \text{Debit} = \sum \text{Credit}$).
- Tuân thủ nghiêm ngặt ADR 0006 (Không có service class trong application layer, 1 use-case = 1 file).
- Tuân thủ ADR 0009 (100% Use Case có Unit Test tương ứng; vượt qua toàn bộ 8 architecture guards).
