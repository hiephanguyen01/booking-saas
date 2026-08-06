# Booking settlement: Tenant giữ tiền và chi trả Partner

Tài liệu này là nguồn vận hành/kỹ thuật cho luồng tiền của booking có Partner. Nó mô tả phần từ khi
gateway xác nhận Customer đã trả Tenant đến khi khoản phải trả Partner được ghi nhận và Tenant tạo
lệnh payout. Phần tích hợp gateway SePay nằm ở [`payments-sepay.md`](./payments-sepay.md).

## 1. Kết quả nghiệp vụ

Luồng chuẩn:

```text
Customer trả phần thanh toán online cho Tenant
  → Tenant giữ tiền (HELD)
  → Partner hoàn thành dịch vụ và xác nhận tiền thu tại chỗ
  → Chờ hết thời gian tranh chấp (DISPUTE_WINDOW)
  → Hệ thống ghi nhận phần Tenant được hưởng
  → Hệ thống ghi nhận khoản Tenant phải trả Partner
  → Tenant tạo payout và chuyển khoản cho Partner
```

`Payment.status = succeeded` và `BookingSettlement.status = held` không mâu thuẫn:

- `Payment.status` phản ánh sự thật từ SePay: tiền đã thanh toán thành công.
- `BookingSettlement.status` phản ánh quyền sử dụng nội bộ: tiền vẫn đang bị giữ, chưa được ghi nhận
  thành doanh thu/công nợ có thể payout.

BookingOS không phải ví điện tử và không tự giữ tiền trong tài khoản nền tảng. SePay chuyển tiền vào tài
khoản merchant của chính Tenant. “Giữ” ở đây là khóa nghiệp vụ/kế toán trong BookingOS; Tenant có trách
nhiệm không sử dụng phần phải trả Partner trước khi settlement được release.

## 2. Ví dụ chuẩn 1.000.000 ₫

Giả sử không có platform fee, affiliate hoặc promotion:

| Khoản | Công thức | Số tiền |
| --- | --- | ---: |
| Tổng booking | `final_amount` | 1.000.000 ₫ |
| Hoa hồng Tenant | `10% × 1.000.000` | 100.000 ₫ |
| Cọc thanh toán online | `20% × 1.000.000` | 200.000 ₫ |
| Customer trả Tenant | qua SePay | 200.000 ₫ |
| Customer trả Partner | `1.000.000 − 200.000` | 800.000 ₫ |
| Phần Partner được hưởng | `1.000.000 − 100.000` | 900.000 ₫ |
| Tenant giữ lại | hoa hồng gộp | 100.000 ₫ |
| Tenant phải payout Partner | `900.000 − 800.000` | 100.000 ₫ |

Journal chỉ được tạo sau hạn tranh chấp:

```text
Debit  Tenant cash             200.000
Debit  Partner (đã thu tại chỗ) 800.000
Credit Partner payable         900.000
Credit Tenant revenue          100.000
```

Số dư Partner sau journal là `900.000 credit − 800.000 debit = 100.000 ₫`. Đây là số Tenant phải
payout, không phải 900.000 ₫.

## 3. Công thức tổng quát

Ký hiệu:

- `F`: `final_amount + additional_charges` — tổng Customer thực trả cho dịch vụ.
- `O`: `online_held_amount` — phần tiền dịch vụ Tenant nhận online; không gồm cọc bảo đảm.
- `S`: `onsite_collected_amount` — tiền Partner xác nhận đã thu tại chỗ.
- `C`: hoa hồng Tenant gộp theo commission snapshot.
- `P`: phần Partner được hưởng gộp theo commission snapshot.

Các invariant:

```text
S = max(F − O, 0)
partner_payable = max(P − S, 0)
online_held_amount >= tenant_commission_gross
```

Platform fee, affiliate commission và promotion funding vẫn dùng công thức trong
[`TONG-QUAN.md`](../TONG-QUAN.md) §13. Commission luôn replay từ `booking.commission_snapshot`, không
đọc rule hiện tại, nên Tenant đổi commission không làm thay đổi booking cũ.

### Tiền cọc bảo đảm

`security_deposit` không phải tiền thanh toán dịch vụ. Khi gateway nhận cả deposit dịch vụ và cọc bảo
đảm:

```text
security_deposit_held = min(payment.amount, booking.security_deposit)
online_held_amount = payment.amount − security_deposit_held
```

Cọc bảo đảm không được dùng để chứng minh deposit đã đủ hoa hồng, không làm giảm tiền Customer trả
Partner tại chỗ, và đi theo quy trình return/damage/refund riêng.

## 4. State machine của settlement

| Trạng thái | Ý nghĩa | Cách vào | Cách ra |
| --- | --- | --- | --- |
| `held` | SePay đã thành công, Tenant đang giữ tiền online | event `payment.succeeded` | booking hoàn thành |
| `dispute_window` | Dịch vụ hoàn tất; số thu tại chỗ và split đã đóng băng | event `booking.completed` | worker release khi đến hạn |
| `disputed` | Customer đã mở claim hợp lệ; payout bị khóa | `POST /customer/finance/disputes` trước deadline | Tenant release hoặc chấp nhận refund |
| `refund_pending` | Đã có quyết định refund nhưng gateway/manual transfer chưa xác nhận | cancellation hoặc dispute được chấp nhận | `refund.completed` |
| `released` | Revenue journal đã ghi; Partner payable có thể vào payout | worker settlement | trạng thái cuối của happy path |
| `refunded` | Provider hoặc Tenant đã xác nhận hoàn toàn bộ phần giữ online | `refund.completed` | trạng thái cuối |

`disputeUntil` được tính bằng thời gian DB:

```text
completed_at = now()
dispute_until = now() + tenant.settings.payout.holdingDays
```

Mặc định `holdingDays = 3`, chấp nhận `0..90`. Nếu bằng 0, worker có thể release ở lượt quét kế tiếp.
Các mốc tài chính khác cũng dùng clock của cùng DB transaction: chọn commission rule theo
`effectiveFrom/effectiveTo`, tính cancellation tier, xác nhận thời điểm hoàn thành/no-show và
`payment.paid_at`, `settlement.released_at` và `payout.paid_at`. Không dùng clock của API host để tránh
lệch máy làm đổi split hoặc refund.

## 5. Luồng kỹ thuật theo sự kiện

### 5.1 SePay thành công → HELD

1. IPN được xác thực bằng credential mã hóa của Tenant.
2. API kiểm tra số tiền và atomically đổi `payments.pending → succeeded`.
3. Trong cùng transaction, API ghi outbox event `payment.succeeded` gồm `paymentId`, `bookingId`.
4. Finance consumer tạo duy nhất một `booking_settlements` theo `booking_id/payment_id`.
5. Booking consumer xác nhận booking trong transaction riêng. Payments không import Booking module.

Các consumer completion/no-show/cancellation/refund không giả định tuyệt đối thứ tự delivery. Nếu
event nghiệp vụ đến trước handler `payment.succeeded`, Finance atomically materialize lại `HELD` từ
payment `deposit|full` đã `succeeded`, rồi mới áp dụng transition. Vì vậy một event được đánh dấu
processed không thể làm mất vĩnh viễn custody row chỉ vì hai consumer chạy lệch thứ tự.

Reconciliation worker đi cùng đường: nếu phát hiện payment thành công bị mất IPN, nó cũng atomically
ghi `payment.succeeded`, vì vậy không có nhánh settlement riêng cho reconciliation. Worker còn quét
payment đã `succeeded` nhưng booking/settlement chưa hội tụ và re-emit cùng event. Payload recovery có
thể đặt `skipBookingConfirmation=true` khi booking đã terminal/refunded để chỉ rebuild custody.

### 5.2 Partner hoàn thành → DISPUTE_WINDOW

Đối với hourly/daily service, Partner gọi:

```http
POST /partner/bookings/:bookingId/complete
Content-Type: application/json

{
  "onsiteCollectedAmount": "800000",
  "note": "Khách đã thanh toán đủ tại studio"
}
```

Điều kiện:

- booking thuộc đúng Partner và Tenant hiện tại;
- booking là `confirmed`, không phải `inventory`;
- thời điểm hiện tại đã qua `endUtc`;
- số thu tại chỗ đúng bằng phần còn lại của dịch vụ.

Transition `confirmed → completed` và event `booking.completed` được ghi cùng transaction. Finance
handler sau đó đóng băng số thu tại chỗ, split dự kiến và hạn tranh chấp. Inventory vẫn hoàn thành qua
`POST /partner/bookings/:id/return`; event không có số báo cáo nên Finance dùng đúng số còn lại đã tính
từ booking/settlement.

Partner/Tenant vẫn là người xác nhận hoàn thành, nhưng họ có hạn: 24h sau `timeslot.end`,
`BookingSchedulerWorker` tự đóng đơn còn `confirmed`. Không phải suy đoán dịch vụ đã tốt — đây là hạn
chót, vì một settlement kẹt ở `held` sẽ không bao giờ mở dispute window, khách không khiếu nại được
và tiền nằm trong custody vĩnh viễn.

- `sweepAutoCompletions()` lo đơn thường: phát `booking.completed` không kèm số thu tại chỗ nên
  Finance dùng `expectedOnsite` mặc định, và partner nhận email `booking_auto_completed_partner`.
- `sweepAutoReturns()` lo đơn `inventory`: phát `booking.returned` (không hư hỏng, không phí trễ) rồi
  `booking.completed`, vì chỉ `booking.returned` mới nhả cọc bảo đảm.

No-show chỉ được đánh dấu từ lúc slot kết thúc đến `+23h`, chừa một tiếng đệm trước khi sweep chạy.

### 5.3 Đến hạn → RELEASED

`SettlementReleaseWorker` quét 30 giây/lần:

1. admin connection chỉ tìm `dispute_window` có `dispute_until <= now()`;
2. từng row được xử lý lại trong `TenantDbService.forTenant` để RLS áp dụng;
3. replay split từ snapshot;
4. tạo revenue journal và set settlement `released` trong cùng transaction;
5. status guard đảm bảo hai worker không release hai lần; nếu guard thua race, journal cùng transaction
   bị rollback.

Do journal chỉ xuất hiện sau thời gian tranh chấp, `ComputePayoutPayableUseCase` không trừ
`holdingDays` lần thứ hai. Nó chỉ lấy ledger đến thời điểm hiện tại và trừ các payout pending/processing.

### 5.4 Payout

Release không tự chuyển khoản. Nó chỉ tạo công nợ. Tenant tiếp tục:

1. xem `partnerPayable`/số dư Partner;
2. tạo payout thủ công;
3. chuyển khoản ngoài hệ thống;
4. đánh dấu payout paid kèm reference/evidence.

Payout journal debit Partner payable và credit Tenant cash, đưa số dư Partner về gần 0.

Mỗi payee được khóa bằng Postgres advisory transaction lock khi tạo/chuyển payout. Một payout phải
atomically claim `pending → processing` trước khi ghi journal; chỉ `processing → paid` được chấp nhận.
`payout_allocations` phân bổ FIFO từng settlement `released` vào lệnh chi để dashboard trả lời được:
booking nào đang chờ chuyển, booking nào đã trả, và còn bao nhiêu. Khi payout fail, allocation được
release để kỳ sau dùng lại. Partial unique index ngăn hai payout mở cho cùng payee. Với payout cho
Partner, tổng allocation phải bằng chính xác số tiền payout; nếu thiếu settlement hợp lệ, toàn bộ
transaction rollback với `PAYOUT_ALLOCATION_MISMATCH` thay vì tạo một lệnh chi không đối soát được.

## 6. Cancellation, no-show, refund và dispute

- Customer/Partner/Tenant cancellation ghi chính xác `booking.refund_due_amount` và `refund_percent`
  trước khi emit event. Đây là durable intent cho recovery; worker không tính lại policy theo thời gian
  hiện tại.
- Refund được idempotent theo `(booking_id, reason)`: `booking_cancellation`, `security_deposit` hoặc
  `dispute_refund` có lifecycle độc lập.
- SePay không có refund API trong adapter hiện tại: refund vào `manual_required`. Tenant chuyển khoản
  ngoài hệ thống rồi xác nhận reference/evidence tại màn Giao dịch.
- Chỉ `refund.completed` (gateway support hoặc manual confirmation) mới đổi booking/settlement sang
  trạng thái hoàn tiền. `refund.requested` không được coi là tiền đã về Customer.
- Với `no_show`, phần tiền dịch vụ online không tự hoàn; nó chờ dispute/release. Riêng cọc bảo đảm
  luôn tạo refund `security_deposit`, tách khỏi lifecycle tiền dịch vụ. Worker phục hồi refund này nếu
  event bị mất hoặc booking cũ chưa có refund row.
- Refund dispute được tính theo delta nhưng lưu `refunded_amount` lũy kế. Mọi quyết định đều bị chặn
  ở `online_held_amount - refunded_amount`, nên nhiều delivery/recovery không thể hoàn vượt số Tenant
  còn giữ. Refund một phần đưa phần còn lại vào một holding window mới; refund toàn bộ kết thúc
  settlement ở `refunded`.
- Refund lưu durable `affects_booking_status`. `full_refund` kết thúc booking ở `refunded`, còn
  `partial_refund` giữ booking ở trạng thái hoàn thành và chỉ thay đổi settlement. Manual confirmation
  và reconciliation đọc cờ đã lưu này, không suy đoán lại từ `reason`.
- Refund cọc bảo đảm có `affectsBookingStatus=false`: không đổi trạng thái settlement dịch vụ.

Nếu refund xảy ra sau khi một revenue journal đã tồn tại, Finance ghi một journal `clawback` đảo đúng
chu kỳ revenue đang active. Sau partial refund, phần giữ lại có thể release thành journal mới; guard
idempotency theo thứ tự `revenue → clawback → revenue`, không coi clawback lịch sử là reversal của
journal mới. Event refund cũ đến trễ cũng không được đảo một settlement đã release lại.

Customer mở dispute trên chi tiết booking. Repository xác minh host → Tenant, customer ownership, DB
deadline và chỉ atomically đổi `dispute_window → disputed`. Partner thấy claim của booking mình và có
thể phản hồi một lần. Xem dữ liệu cần `partner.finance.read`; gửi phản hồi cần
`partner.bookings.write`, vì đây là mutation/bằng chứng nghiệp vụ chứ không phải quyền chỉ đọc. Mỗi
settlement chỉ có một claim; unique constraint trên `settlement_id` và
`canOpenDispute` ở customer DTO/UI chặn mở lại sau khi claim đã được xử lý. Tenant có ba quyết định:
`release`, `full_refund`, `partial_refund`. Quyết định và actor/evidence được lưu ở
`settlement_disputes`; không sửa settlement trực tiếp từ UI.

## 7. Quy tắc deposit tối thiểu

Partner cấu hình `listing.depositPercent`, nghĩa là tỷ lệ Customer phải trả online cho Tenant. Không có
chuyện Partner nộp một khoản cọc riêng cho Tenant.

Hệ thống chặn ở ba lớp:

1. tạo listing: nếu commission hiệu lực là phần trăm, `depositPercent` phải ≥ commission Tenant;
2. tạo/sửa mọi commission rule (`tenant_default`, listing type, category, partner): mô phỏng đúng
   precedence/effective time trên toàn bộ listing bị ảnh hưởng và chặn nếu có listing không đủ deposit;
3. tạo booking: tính số tiền thật sau promotion bằng commission snapshot và bắt buộc
   `depositAmount >= tenantCommissionGross`.

Lớp 3 là invariant cuối cùng và xử lý cả fixed commission, rounding, tenant-funded promotion và rule
đã thay đổi. Mã lỗi:

- `DEPOSIT_BELOW_TENANT_COMMISSION`: listing/booking không đủ coverage;
- `COMMISSION_EXCEEDS_PARTNER_DEPOSIT`: Tenant tăng partner-percent rule cao hơn một hoặc nhiều
  listing hiện tại; Tenant phải yêu cầu Partner tăng deposit trước.

House partner được bỏ qua vì không có partner payable.

## 8. API và dashboard

| Audience | API | Màn hình |
| --- | --- | --- |
| Tenant | `GET /tenant/finance/settlements` | Tài chính → Tiền đang giữ |
| Tenant | `GET /tenant/finance/settlement-summary` | tổng hợp held/disputed/refund/payout |
| Tenant | `GET /tenant/finance/settlements/:bookingId` | chi tiết booking |
| Tenant | `GET/POST /tenant/finance/disputes` | danh sách và xử lý tranh chấp |
| Tenant | `GET /tenant/payments/refunds` | lịch sử refund/manual-required |
| Tenant | `POST /tenant/payments/refunds/:id/confirm` | xác nhận đã chuyển hoàn thủ công |
| Partner | `GET /partner/finance/settlements/:bookingId` | chi tiết booking |
| Partner | `GET /partner/finance/settlements` | đối soát toàn bộ booking của Partner |
| Partner | `GET /partner/finance/settlement-summary` | tổng hợp toàn bộ settlement, không phụ thuộc page hiện tại |
| Partner | `GET /partner/finance/disputes` | claim liên quan, DTO không lộ nội bộ Tenant |
| Partner | `POST /partner/finance/disputes/:id/respond` | phản hồi một lần khi claim còn mở |
| Partner | `POST /partner/bookings/:bookingId/complete` | dialog Hoàn thành dịch vụ |
| Customer | `GET /customer/finance/settlements/:bookingId` | trạng thái giữ tiền an toàn theo ownership |
| Customer | `POST /customer/finance/disputes` | mở dispute trước deadline |
| Platform | `GET /platform/finance/settlements` | sổ đối soát toàn nền tảng |

Danh sách Tenant lọc được theo status và Partner. Amount truyền qua HTTP luôn là digit string VND để
không mất chính xác. Partner endpoint luôn lấy `partnerId` từ session/context, không nhận từ client.

## 9. Data model, RLS và migration

Migrations:

- `20260719000000_booking_settlements`: custody table ban đầu;
- `20260719110000_settlement_refund_pending_enum`: commit enum riêng theo yêu cầu PostgreSQL;
- `20260719120000_finance_lifecycle_hardening`: dispute/refund/allocation/maturity và corrective backfill.

`booking_settlements`, `settlement_disputes` và `payout_allocations` đều có `tenant_id NOT NULL`, FORCE
RLS, policy `tenant_isolation`. Settlement unique theo `booking_id` và `payment_id`; dispute unique
theo `settlement_id`; các amount không âm (riêng `tenant_net_earning` có thể âm vì promotion/
affiliate). `refunds.affects_booking_status` là boolean `NOT NULL`, backfill `false` cho refund cọc bảo
đảm và được lưu ngay khi tạo refund. Index quan trọng:

- `(partner_id, status)` cho Partner/tenant filter;
- `(status, dispute_until)` cho worker;
- `tenant_id` cho RLS/FK access.

Corrective backfill phân loại theo thứ tự ưu tiên:

- booking đã có revenue journal → `released`, không tạo journal lại;
- refund succeeded → `refunded`, refund manual/pending → `refund_pending`;
- cancelled có phần giữ lại → `cancellation_fee` + `dispute_window` theo Tenant payout policy;
- cancelled có durable `refund_due_amount = 0` cũng đi vào `cancellation_fee`; chỉ intent `NULL` hoặc
  số refund dương chưa có refund row mới ở `refund_pending`;
- completed/no-show chưa có journal → đúng kind + `dispute_window` theo Tenant payout policy;
- journal cũ được gắn lại vào `release_journal_id` thay vì để projection mồ côi;
- còn lại → `held`.

Triển khai:

```bash
pnpm --filter=@booking/api prisma:deploy
pnpm --filter=@booking/api prisma:generate
pnpm --filter=@booking/api check:rls
```

Không dùng `prisma migrate dev`; migration được hand-write theo ADR 0004.

## 10. Cấu hình và vận hành

- `tenant.settings.payout.holdingDays`: số ngày chờ tranh chấp, mặc định 3.
- `tenant.settings.payout.minAmount`: payout tối thiểu.
- `tenant.settings.payout.cycle`: `weekly | monthly`.
- `SETTLEMENT_RELEASE_DISABLED=true`: tắt riêng settlement release worker.
- `OUTBOX_RELAY_DISABLED=true`: tắt outbox và các worker phụ thuộc trong môi trường maintenance.

Checklist khi một settlement bị kẹt:

1. payment có `status=succeeded` và đúng `amount` không;
2. outbox `payment.succeeded` đã processed chưa;
3. booking đã `completed` chưa;
4. `onsite_collected_amount` có khớp `final + charges − onlineHeld` không;
5. `dispute_until` đã qua theo giờ DB chưa;
6. Redis/BullMQ và settlement worker có chạy không;
7. booking đã có revenue journal cũ gây `SETTLEMENT_JOURNAL_EXISTS` không.
8. payout allocation có còn `reserved` trong payout đã `failed` không;
9. refund `succeeded` có khớp `settlement.refund_id`, và nếu `affects_booking_status=true` thì booking
   có ở `refunded` không;
10. booking cancelled có `refund_due_amount > 0` nhưng thiếu refund row không.
11. refund partial có `affects_booking_status=false` và booking vẫn `completed` không;
12. journal active gần nhất có đúng chuỗi revenue/clawback không.

Reconciliation tự phục hồi payment success, refund success, cancellation có refund intent nhưng thiếu
refund row và cọc bảo đảm của booking `no_show` bị thiếu refund row. Chi tiết query/triage ở
[`runbooks/finance-reconciliation.md`](./runbooks/finance-reconciliation.md).

Không sửa status/journal trực tiếp bằng dashboard hoặc SQL tùy ý. Ledger là append-only; settlement là
projection custody. Nếu cần can thiệp production, lưu snapshot/query trước, đối chiếu provider và chạy
recovery qua outbox trong `TenantDbService.forTenant`.
