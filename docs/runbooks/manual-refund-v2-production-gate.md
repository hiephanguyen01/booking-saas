# Runbook: Manual Refund V2 Production Gate & Canary Procedure

Tài liệu này xác định quy trình kiểm soát (go/no-go gate), điều kiện dừng khẩn cấp và các bước triển khai canary cho tính năng **Manual Refund V2** trên môi trường Production của BookingOS.

> **NGUYÊN TẮC BẮT BUỘC:** Không bật tính năng cho toàn bộ hệ thống ngay lập tức. Tính năng chỉ được kích hoạt theo cơ chế từng tenant (per-tenant feature flag), bắt đầu với một tenant canary duy nhất, sau khi đã vượt qua toàn bộ 11 bước kiểm soát nghiêm ngặt dưới đây.

---

## 1. Trình tự kiểm soát Go/No-Go (Bắt buộc theo thứ tự)

Mọi đợt triển khai hoặc kích hoạt tenant canary phải thực hiện tuần tự qua 11 bước:

### Bước 1: Release SHA cố định và Rollback SHA đã ghi nhận
- Xác nhận commit triển khai là **exact release SHA with CI green** (toàn bộ pipeline CI pass: lint, typecheck, build, static guards).
- Ghi nhận trước **rollback SHA** đã được kiểm chứng hoạt động ổn định trên Production.
- Không triển khai từ branch không xác định hoặc artifact chưa qua CI.

### Bước 2: Database backup và đối soát migration
- Tạo snapshot/backup cơ sở dữ liệu vật lý hoặc managed backup trước khi thao tác.
- Xác nhận trạng thái migrations đã được áp dụng đầy đủ qua migration role (`app_migrate` / `postgres`).
- Không rollback bằng cách đảo ngược migration trên production; nếu có lỗi cấu trúc, thực hiện restore từ bản backup đã lưu.

### Bước 3: Đạt chứng chỉ kiểm tra sẵn sàng (`readiness.ready=true`)
- Gọi endpoint preflight kiểm tra cấu hình tenant candidate:
  `GET /platform/tenants/:tenantId/refunds/readiness`
- Kiểm tra toàn bộ 7 tiêu chí sẵn sàng:
  1. `manual_refund_v2` feature flag được cấu hình hợp lệ;
  2. `MANUAL_REFUND_PII_KEYRING` có active key version và giải mã hợp lệ;
  3. `MANUAL_REFUND_PII_FINGERPRINT_KEY` cấu hình đúng độ dài 32-byte;
  4. Private storage bucket (`S3_PRIVATE_BUCKET`) sẵn sàng và cho phép put/get presigned URL;
  5. Đã tồn tại ít nhất 2 nhân sự tài chính độc lập có quyền Maker/Checker;
  6. Migration schema và RLS policies cho bảng `manual_refund_operations` đã áp dụng đầy đủ;
  7. Không tồn tại cảnh báo phân quyền hoặc credential mồ côi.
- **Dừng ngay lập tức** nếu kết quả trả về `readiness.ready=false`.

### Bước 4: Khởi tạo ở trạng thái tạm dừng và tắt payment route
- Khi kích hoạt tính năng cho tenant bằng `POST /platform/tenants/:tenantId/refunds/enable-workflow`, workflow phải được tạm dừng ngay lập tức thông qua:
  `POST /platform/tenants/:tenantId/refunds/pause-workflow`
- Đảm bảo các route chuyển tiền gateway hoặc SePay IPN cho tenant canary đang ở trạng thái tắt hoặc cách ly kiểm soát.

### Bước 5: Hai tài khoản tài chính độc lập (Maker - Checker Independence)
- Bắt buộc chuẩn bị ít nhất hai tài khoản tài chính riêng biệt thuộc tenant:
  - Tài khoản 1: có quyền `tenant.refunds.prepare` (Maker).
  - Tài khoản 2: có quyền `tenant.refunds.approve` (Checker).
- Không chia sẻ phiên làm việc, không dùng chung session cookie/thiết bị, và `maker_user_id <> checked_by_user_id`. Không được dùng break-glass để thay thế quy trình 2 mắt (four-eyes principle) thông thường.

### Bước 6: Thử nghiệm lưu trữ bằng chứng riêng tư (Probe)
- Thực hiện kiểm tra probe upload / download / quarantine trên `S3_PRIVATE_BUCKET` với một tệp hình ảnh/PDF mẫu thử nghiệm dùng một lần (disposable evidence probe).
- Xác minh: MIME sniffing hoạt động chính xác, file không thể truy cập công khai qua internet, và URL tải về có chữ ký số giới hạn thời gian (`no-store` headers).

### Bước 7: Ghi nhận baseline bảng cảnh báo (Alert-board Baseline)
- Truy cập Dashboard Platform (`/admin`) kiểm tra card **Sức khoẻ Manual Refund V2**.
- Xác nhận các chỉ số nền tảng đang ở trạng thái bình thường (baseline không có lỗi nghiêm trọng):
  - Số lượng hồ sơ quá hạn: 0
  - Số lượng khách báo chưa nhận tiền: 0
  - Lượt break-glass trong 30 ngày: 0 (hoặc trong ngưỡng an toàn đã giải trình)
  - Trạng thái tổng thể không được ở mức `manualRefunds.severity=critical`.

### Bước 8: Thiết lập hạn mức tuyến gateway và mở lại workflow
- Cấu hình hạn mức tối đa cho tài khoản hoàn tiền / gateway routing của tenant.
- Gọi lệnh mở lại quy trình:
  `POST /platform/tenants/:tenantId/refunds/resume-workflow`
  với lý do rõ ràng được ghi nhận vào audit log.

### Bước 9: Giao dịch canary giới hạn với hạn mức được phê duyệt riêng biệt
- Thực hiện duy nhất 01 giao dịch hoàn tiền canary thực tế (`one production canary transaction with an explicit monetary cap approved separately`).
- Giao dịch phải có giá trị nhỏ, được lãnh đạo phê duyệt trước về mặt hạn mức tài chính.
- Theo dõi xuyên suốt: từ lúc khách nhập số tài khoản, maker kiểm tra và chuyển khoản, upload biên lai, cho đến khi checker phê duyệt và tiền vào tài khoản khách hàng.

### Bước 10: Quy trình xử lý sự cố và dừng khẩn cấp (Emergency Stop)
- Khi gặp bất kỳ điều kiện dừng khẩn cấp nào (Stop Conditions ở mục 2), lập tức:
  1. Kích hoạt `pause-workflow` trên tenant canary;
  2. Vô hiệu hóa tuyến nhận tiền/chuyển tiền gateway;
  3. Thực hiện đối soát (reconcile) dữ liệu theo [finance-reconciliation.md](./finance-reconciliation.md);
  4. Nếu do lỗi phần mềm nghiêm trọng, tiến hành rollback container về **rollback SHA**.

### Bước 11: Lưu trữ và bảo vệ dữ liệu PII/Secrets
- Bằng chứng đối soát, biên lai và log phải được lưu trữ ở khu vực bảo mật riêng tư.
- **Tuyệt đối không sao chép** thông tin PII khách hàng (số tài khoản, tên chủ thẻ), khóa bí mật, keyrings hoặc exception traceback chứa dữ liệu nhạy cảm vào GitHub issues, Pull Requests, Slack/Telegram chat, hệ thống tracking bên ngoài hoặc tài liệu incident.

---

## 2. Điều kiện dừng khẩn cấp bắt buộc (Mandatory Stop Conditions)

Lập tức thực hiện lệnh **pause-workflow** và dừng toàn bộ quy trình canary nếu phát hiện bất kỳ dấu hiệu nào sau đây:

1. **Preflight thất bại**:
   - `readiness.ready=false` ở bất kỳ thời điểm nào trước hoặc trong quá trình triển khai.

2. **Cảnh báo nền tảng nghiêm trọng**:
   - Chỉ số sức khoẻ nền tảng chuyển sang `manualRefunds.severity=critical`.
   - Xuất hiện cảnh báo vượt ngưỡng quá hạn xử lý hoặc lỗi hệ thống liên tục.

3. **Bất thường về dòng tiền & tài chính**:
   - Phát hiện ghi nợ trùng lặp (**duplicate debit**) trên sổ cái hoặc tài khoản ngân hàng.
   - Lệch số tiền hoàn (**amount mismatch**) giữa số tiền yêu cầu trong batch và số tiền thực chuyển trên sao kê/biên lai.

4. **Sự cố cổng thanh toán & Webhook**:
   - Nhận tín hiệu IPN không xác thực được chữ ký số (**unverified webhook**) hoặc giao dịch gateway không rõ nguồn gốc.

5. **Khiếu nại từ khách hàng**:
   - Khách hàng phản hồi không nhận được tiền (**customer_not_received**) sau khi checker đã phê duyệt thành công.

6. **Lạm dụng hoặc vi phạm cơ chế duyệt khẩn cấp**:
   - Phát hiện thao tác **break-glass** bất thường, không có biên bản phê chuẩn sự cố từ Platform Admin.

---

## 3. Quy trình Rollback và Kế hoạch Phục hồi

Khi xảy ra sự cố cần rollback:

1. **Tạm dừng tính năng ngay lập tức:**
   ```bash
   curl -X POST https://api.bookingos.vn/platform/tenants/<tenantId>/refunds/pause-workflow \
     -H "Content-Type: application/json" \
     -H "Cookie: sid=..." \
     -d '{"reason": "Incident detected during canary rollout: triggering emergency stop"}'
   ```
2. **Khóa tạm thời các giao dịch thanh toán của tenant liên quan.**
3. **Thực hiện đối soát tài chính theo runbook:**
   Tham khảo [Runbook đối soát tài chính](./finance-reconciliation.md) để kiểm tra tính cân bằng của Ledger (`SUM(debit) = SUM(credit)`) và khớp trạng thái đơn hoàn tiền.
4. **Rollback ứng dụng về immutable rollback SHA (nếu lỗi do code release mới):**
   ```bash
   # Cập nhật SHA hình ảnh trên production host và chạy lại containers
   API_IMAGE=ghcr.io/bookingos/api:<rollback SHA>
   STOREFRONT_IMAGE=ghcr.io/bookingos/storefront:<rollback SHA>
   DASHBOARD_IMAGE=ghcr.io/bookingos/dashboard:<rollback SHA>
   docker compose --env-file .env.prod -f docker-compose.deploy.yml up -d
   ```
5. **Thông báo và lưu trữ incident log:**
   Ghi nhận timeline chi tiết, các ID đối tượng liên quan (operationId, batchId, bookingId) nhưng che giấu (redact) toàn bộ số tài khoản và thông tin bí mật.
