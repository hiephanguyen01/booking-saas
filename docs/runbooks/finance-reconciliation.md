# Runbook: payment, settlement, refund và payout reconciliation

Runbook này dùng khi dashboard và sự thật ngân hàng/gateway không khớp. Mục tiêu là xác định projection
nào chưa hội tụ và khôi phục qua event/use-case hiện có. Không sửa ledger journal hoặc ép settlement
status bằng SQL trong production.

## Nguồn sự thật theo lớp

| Câu hỏi | Nguồn sự thật |
| --- | --- |
| Gateway đã nhận tiền chưa? | IPN đã xác thực + `payments.status/paid_at/gateway_txn_id` |
| Tenant đang giữ bao nhiêu? | `booking_settlements.online_held_amount/security_deposit_held` |
| Đã hết thời gian khiếu nại chưa? | DB `now()` so với `dispute_until` |
| Tenant/Partner được hưởng bao nhiêu? | commission snapshot + immutable release journal |
| Booking nào nằm trong payout? | `payout_allocations` |
| Refund đã thực sự hoàn chưa? | `refunds.status=succeeded` + provider/manual evidence |

`payment.succeeded` không đồng nghĩa `settlement.released`. Payment chỉ xác nhận tiền vào merchant
Tenant; release mới ghi earnings/payables.

## Triage nhanh theo booking

Chạy bằng migration/admin connection, thay UUID cụ thể. Query chỉ đọc:

```sql
SELECT b.id, b.code, b.status, b.paid_amount, b.security_deposit,
       b.refund_due_amount, b.refund_percent,
       p.id AS payment_id, p.status AS payment_status, p.amount AS payment_amount,
       p.gateway, p.gateway_order_ref, p.gateway_txn_id, p.paid_at,
       bs.id AS settlement_id, bs.status AS settlement_status, bs.kind,
       bs.online_held_amount, bs.security_deposit_held,
       bs.onsite_collected_amount, bs.partner_payable,
       bs.refunded_amount, bs.retained_amount,
       bs.dispute_until, bs.release_journal_id
FROM bookings b
LEFT JOIN payments p ON p.booking_id = b.id
LEFT JOIN booking_settlements bs ON bs.booking_id = b.id
WHERE b.id = '<booking-uuid>'::uuid
ORDER BY p.created_at DESC;
```

Sau đó kiểm tra outbox:

```sql
SELECT id, event_type, processed_at, retry_count, last_error, created_at
FROM outbox_events
WHERE tenant_id = '<tenant-uuid>'::uuid
  AND payload ->> 'bookingId' = '<booking-uuid>'
ORDER BY created_at;
```

Và ledger balance của riêng booking:

```sql
SELECT le.journal_id, le.entry_type, la.owner_type, la.owner_id,
       le.debit, le.credit, le.available_at, le.memo, le.created_at
FROM ledger_entries le
JOIN ledger_accounts la ON la.id = le.account_id
WHERE le.booking_id = '<booking-uuid>'::uuid
ORDER BY le.created_at, le.id;
```

Mỗi `journal_id` phải có `SUM(debit) = SUM(credit)`. Nếu không cân, dừng payout cho Tenant liên quan và
escalate; không tạo “dòng bù” bằng tay khi chưa xác định journal gốc.

## Các mismatch và recovery tự động

### Payment succeeded nhưng booking chưa confirmed hoặc thiếu settlement

`ReconciliationWorker` quét payment `succeeded` nếu booking còn `pending_payment/expired` hoặc thiếu
settlement. Nó re-emit `payment.succeeded`:

- Booking consumer xác nhận hoặc xử lý late-webhook slot race;
- Finance consumer upsert held settlement;
- nếu booking đã cancelled/refunded hoặc đã có successful refund, payload đặt
  `skipBookingConfirmation=true` để không phục hồi booking terminal về confirmed.

Nếu row không tự hội tụ, kiểm tra Redis/BullMQ, outbox relay, `last_error`, gateway config lịch sử và
tenant RLS trước. Không gọi controller webhook bằng payload tự chế.

### Booking cancelled nhưng không có refund row

Cancellation ghi `refund_due_amount` và `refund_percent` cùng transaction chuyển trạng thái. Worker
tìm booking có refund intent dương, payment succeeded nhưng thiếu reason `booking_cancellation`, rồi
emit `refund.recovery_requested`.

```sql
SELECT b.id, b.code, b.status, b.refund_due_amount, b.refund_percent
FROM bookings b
WHERE b.status IN ('cancelled', 'refunded')
  AND b.refund_due_amount > 0
  AND EXISTS (
    SELECT 1 FROM payments p WHERE p.booking_id = b.id AND p.status = 'succeeded'
  )
  AND NOT EXISTS (
    SELECT 1 FROM refunds r
    WHERE r.booking_id = b.id AND r.reason = 'booking_cancellation'
  );
```

Legacy booking có `refund_due_amount IS NULL` không được đoán tự động. Đối chiếu cancellation policy
snapshot, status-history timestamp và bank evidence; ghi incident decision trước khi chạy một recovery
command có kiểm soát.

### Booking no-show nhưng thiếu refund cọc bảo đảm

`booking.no_show` không hoàn phần tiền dịch vụ mặc định, nhưng phải hoàn toàn bộ `security_deposit`.
Worker tìm booking `no_show` đã có payment succeeded nhưng thiếu refund reason `security_deposit`, rồi
emit cùng `refund.recovery_requested` với đúng số cọc đã snapshot trên booking.

```sql
SELECT b.id, b.code, b.security_deposit
FROM bookings b
WHERE b.status = 'no_show'
  AND b.security_deposit > 0
  AND EXISTS (
    SELECT 1 FROM payments p WHERE p.booking_id = b.id AND p.status = 'succeeded'
  )
  AND NOT EXISTS (
    SELECT 1 FROM refunds r
    WHERE r.booking_id = b.id AND r.reason = 'security_deposit'
  );
```

Refund cọc có `affectsBookingStatus=false`: trạng thái booking/settlement dịch vụ không đổi khi Tenant
xác nhận đã hoàn cọc thủ công.

### Refund succeeded nhưng booking/settlement chưa cập nhật

Worker tìm refund succeeded nếu projection chưa hội tụ, rồi re-emit `refund.completed`. Điều kiện
booking phải là `refunded` chỉ áp dụng khi row có `affects_booking_status=true`; partial dispute refund
và security-deposit refund cố ý giữ nguyên booking status. Finance vẫn yêu cầu
`settlement.refund_id` khớp cho refund dịch vụ. Booking và Finance handlers idempotent theo state/refund
id.

```sql
SELECT r.id, r.booking_id, r.amount, r.reason, r.status, r.affects_booking_status,
       b.status AS booking_status, bs.status AS settlement_status, bs.refund_id
FROM refunds r
JOIN bookings b ON b.id = r.booking_id
LEFT JOIN booking_settlements bs ON bs.booking_id = r.booking_id
WHERE r.status = 'succeeded'
  AND r.reason <> 'security_deposit'
  AND ((r.affects_booking_status AND b.status <> 'refunded')
       OR bs.refund_id IS DISTINCT FROM r.id);
```

Refund `manual_required` là công việc Tenant chưa hoàn tất, không phải mismatch. Chỉ xác nhận sau khi
có reference ngân hàng; endpoint confirmation giữ advisory lock theo booking và không tạo hai refund.
Với partial refund, xác nhận manual phải giữ `affects_booking_status=false`; nếu booking bị đổi thành
`refunded`, dừng recovery và kiểm tra version của API worker trước khi sửa projection.

### Settlement quá hạn nhưng chưa released

```sql
SELECT id, booking_id, status, dispute_until, updated_at
FROM booking_settlements
WHERE status = 'dispute_window' AND dispute_until <= now()
ORDER BY dispute_until;
```

Kiểm tra `SETTLEMENT_RELEASE_DISABLED`, worker/Redis và open dispute. Worker chỉ lấy due rows qua admin
pool rồi xử lý từng row trong `forTenant`. Release journal + status update cùng transaction; race loser
rollback cả journal.

### Payout bị kẹt hoặc trả trùng

```sql
SELECT p.id, p.payee_type, p.payee_id, p.amount, p.status, p.paid_at, p.evidence,
       COALESCE(SUM(pa.amount), 0) AS allocated
FROM payouts p
LEFT JOIN payout_allocations pa
  ON pa.payout_id = p.id AND pa.status IN ('reserved', 'paid')
WHERE p.tenant_id = '<tenant-uuid>'::uuid
GROUP BY p.id
ORDER BY p.created_at DESC;
```

Invariant:

- tối đa một payout `pending|processing` cho một `(tenant, payee_type, payee_id)`;
- chỉ `pending → processing → paid` tạo payout journal;
- payout failed phải có allocations `released`;
- allocation paid chỉ trỏ payout paid;
- payout Partner mới phải có `SUM(allocation.amount) = payout.amount`; nếu không, create rollback với
  `PAYOUT_ALLOCATION_MISMATCH`;
- migration hardening backfill allocation FIFO cho payout Partner legacy; nếu tổng allocation vẫn nhỏ
  hơn payout thì đó là orphan ledger cần điều tra, không phải trạng thái bình thường.

Nếu ngân hàng đã chuyển nhưng UI còn `processing`, đối chiếu reference rồi dùng endpoint mark-paid hiện
có. Không tạo payout thứ hai. Advisory lock theo payee và guarded state transition sẽ chặn race giữa
hai operator.

## Rollout migration

1. Backup database và lưu số lượng mismatch bằng các query trên.
2. Tạm tắt release worker bằng `SETTLEMENT_RELEASE_DISABLED=true` nếu deploy nhiều replica lệch version.
3. Chạy `pnpm --filter=@booking/api prisma:deploy` bằng migration role.
4. Chạy `pnpm --filter=@booking/api prisma:generate` trên artifact/build mới.
5. Chạy `pnpm --filter=@booking/api check:rls`.
6. Deploy tất cả API worker cùng version, bật lại release worker.
7. Theo dõi outbox error, reconciliation count, số `refund_pending`, settlement quá hạn và payout mở.

`refund_pending` nằm trong migration enum riêng vì PostgreSQL không cho sử dụng enum label mới trong
cùng transaction đã thêm label đó. Không gộp hai migration này khi squash thủ công.

## Sau incident

Lưu lại payment/refund/payout reference, booking code, tenant, timeline status history, outbox errors và
journal ids. Nếu phải thực hiện corrective event, ghi rõ event type/payload/actor và kết quả convergence.
Không lưu secret gateway hoặc raw credential trong incident document.
