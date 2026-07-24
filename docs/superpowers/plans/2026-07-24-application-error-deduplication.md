# Plan — Deduplicate application error literals

> Date: 2026-07-24
> Branch: `refactor/entity-centric`
> Baseline: `c637d8e`

## Mục tiêu

Rà toàn bộ `apps/api/src/modules/*/application/**/*.ts`, loại bỏ các
`throw new XxxException({ statusCode, code, message, ... })` lặp lại khỏi use-case/helper và dùng
typed error đã có trong `domain/errors`. Chỉ thêm error mới khi wire shape thực sự riêng biệt.

Không đổi HTTP status, `code`, `message`, `details` hay các legacy top-level field. Lỗi 5xx,
provider/webhook/auth-protocol và bare Nest exception không bị ép thành `DomainError` vì
`DomainError` là quy ước 4xx-only.

## Inventory

AST gate tìm thấy 82 `throw new *Exception` trong application layer:

| Module | Số site |
|---|---:|
| affiliate | 4 |
| booking | 6 |
| catalog | 7 |
| finance | 4 |
| identity-access | 6 |
| listing | 29 |
| partner | 4 |
| payments | 8 |
| promotions | 3 |
| reviews | 5 |
| scheduling | 4 |
| tenancy | 2 |

Phân loại:

- Standard 4xx business/read-access error: dùng typed `DomainError`.
- Error code dùng ở nhiều module (`BOOKING_NOT_FOUND`, `LISTING_NOT_FOUND`,
  `LISTING_TYPE_NOT_FOUND`, `PARTNER_NOT_FOUND`, `TENANT_NOT_FOUND`, `MODE_NOT_ENABLED`,
  `CANCELLATION_POLICY_NOT_FOUND`): một definition trong shared kernel; module cũ re-export nếu cần
  giữ import seam.
- Legacy body cố ý thiếu `statusCode`, auth retry fields, webhook/provider boundary và 5xx:
  giữ Nest exception semantics; chỉ đặt tên/move ra application error file nếu literal dài.
- Bare `new NotFoundException()` / `new ConflictException()` giữ nguyên vì không lặp custom wire
  contract và đổi sang `DomainError` sẽ đổi body.

## Frozen wire

- Mọi standard envelope giữ `{ statusCode, code, message, details? }`.
- Catalog search và partner pricing legacy body đang thiếu `statusCode` tiếp tục thiếu.
- OTP `retryAfterSec` / `attemptsRemaining` tiếp tục là top-level field.
- 503 payment-not-configured, webhook errors và defensive affiliate 500 tiếp tục là Nest errors.
- Không thay đổi transaction, repository call, outbox hoặc controller/contract.

## Các bước

1. Thêm/reuse shared và module domain errors; thay call-site theo từng module.
2. Đặt tên các HTTP-only exception dài trong application error files, giữ nguyên response object.
3. AST gate: không còn inline custom Nest exception literal trong application; các bare exception
   được allowlist rõ.
4. API lint/typecheck/build, full turbo `--force`, `check:rls`.
5. Final review `main...HEAD`, cập nhật HANDOFF/spec và commit.
