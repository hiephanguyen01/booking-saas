# Plan — Audit và hardening 257 use-case entity-centric

> Date: 2026-07-24
> Branch: `refactor/entity-centric`
> Baseline: `f85b3c2`

## Mục tiêu

Đọc máy + review code thật toàn bộ 257 file
`apps/api/src/modules/**/*.use-case.ts`, tìm các use-case không đi tới entity/value object/pure
domain policy, rồi chỉ refactor những chỗ đang giữ business rule hoặc persistence implementation
trong application layer. Query orchestration, adapter-backed state machine và guarded/set-based
repository transition không bị ép tạo “entity cho có”.

Luật giữ nguyên:

- Không test; verify bằng lint/typecheck/build/runtime smoke.
- Không đổi controller, DTO, response, error status/code/message/details.
- Một use-case/file; một public `execute()`.
- Một tenant operation/một `forTenant`; không nest transaction.
- CAS/set-based SQL ở repository; application chỉ gọi port.
- Entity/VO framework-free, không đọc clock/I/O.

## Kết quả inventory

AST/import-graph gate trên 257 use-case:

| Nhóm | Số lượng | Kết luận |
|---|---:|---|
| Đi tới entity/VO/pure domain policy | 216 | Giữ |
| Query/read projection thuần | 27 | Entity không có vai trò |
| Store adapter đã dùng `Session`/`AuthChallenge` | 6 | Giữ seam bảo mật |
| Guarded/set-based repository transition | 2 | Giữ CAS/SQL |
| Provider credential validation ở boundary | 1 | Giữ; Track B mới được đổi shape |
| Read-model projection command | 1 | Không cần entity, nhưng phải qua port |
| Business rule thật sự còn inline | 4 | Refactor |

Bốn use-case cần domain:

1. `finance/get-customer-booking-settlement`: rule `canOpenDispute`.
2. `finance/update-payout-policy`: payout policy mapping/serialization.
3. `listing/assert-listing-deposit-coverage`: commission-vs-deposit invariant.
4. `listing/get-listing-deposit-requirement`: cùng policy nhưng read projection.

Ba application persistence bypass cần đóng:

1. `finance/{get,update}-payout-policy`: gọi `tx.tenant` trực tiếp.
2. `listing/project-review-aggregates`: giữ raw SQL trực tiếp.
3. `booking/create-booking`: gọi `tx.partner.findUnique` trực tiếp.

## Frozen wire

| Path | Wire phải giữ nguyên |
|---|---|
| deposit coverage | `400 DEPOSIT_BELOW_TENANT_COMMISSION`, dynamic message và ba details key |
| customer settlement miss | `404 SETTLEMENT_NOT_FOUND`, `Settlement not found` |
| payout policy tenant miss | bare Nest 404 hiện tại |
| payout policy response/storage | `{holdingDays,minAmount,cycle}`, giữ mọi tenant settings khác |
| review aggregate projection | không response/outbox; cùng SQL semantics |
| booking partner miss | legacy fallback `isHouse=false` |

## Task 1 — Finance policy/visibility

- Mở rộng `PayoutPolicy` với factory từ input và mapper storage/DTO.
- Thêm `PAYOUT_POLICY_STORE` port + Prisma adapter; use-case không chạm `tx.tenant`.
- Thêm `Settlement.canOpenDispute(now, hasExistingDispute)` và dùng trong customer read.
- Giữ DB clock trong tenant transaction.

## Task 2 — Listing deposit policy

- Thêm framework-free `ListingDepositPolicy` VO.
- Thêm typed `DepositBelowTenantCommission` DomainError giữ byte-identical wire.
- Cả assert write-path và requirement read-path dùng cùng VO.

## Task 3 — Persistence boundaries

- Thêm `REVIEW_AGGREGATE_PROJECTOR` port + Prisma adapter, chuyển raw SQL khỏi use-case.
- Thêm booking-local `BOOKING_PARTNER_READER` port + Prisma adapter cho `isHouse`.
- Đăng ký token bằng `useClass`; không import module domain khác.

## Task 4 — Audit gate và verify

- Chạy lại AST/import graph cho đủ 257.
- Chứng minh mọi direct Prisma model access đã rời use-case; chỉ raw transaction primitives được
  spec cho phép còn lại.
- API lint/typecheck/build, `check:rls`, full turbo `--force`.
- Runtime smoke payout policy + customer settlement, listing deposit response/error và booking
  creation path; dọn/khôi phục fixture.

## Task 5 — Final review

- So `main...HEAD`: no tests, domain framework-free, một use-case/file.
- Review CAS/RLS/outbox/wire và cập nhật HANDOFF/spec với inventory thật.
