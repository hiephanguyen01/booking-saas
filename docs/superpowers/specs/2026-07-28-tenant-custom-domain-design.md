# Tenant custom domain — HTTPS tự động bằng Caddy on-demand TLS

**Ngày:** 2026-07-28 · **Môi trường đích:** staging (`stg.bookingos.vn`), thiết kế dùng lại nguyên
vẹn cho production.

## Vấn đề

Tenant đã có thể tự thêm tên miền riêng trong dashboard, nhưng tên miền đó **không thể chạy HTTPS**.
Nginx trên host EC2 chỉ giữ certificate Let's Encrypt cho `stg.bookingos.vn` và
`*.stg.bookingos.vn`. Một domain riêng như `booking.giangstudio.vn` trỏ về Elastic IP sẽ hỏng ngay ở
bắt tay TLS — trình duyệt báo sai certificate, request chưa bao giờ tới ứng dụng.
`docs/deployment-runbook.md` § "Tenant custom domain" đã ghi nhận đúng điều này và yêu cầu không mở
custom domain public trước khi có cơ chế TLS.

Ngoài chặn cứng đó còn hai lỗ hổng nhỏ hơn ở tầng ứng dụng:

- Card tên miền trong dashboard chỉ hiện **Loại bản ghi** và **Giá trị** của bản ghi TXT, **không
  hiện tên bản ghi** `_bookingos-verify.<host>`. Backend có sẵn `domainVerificationRecord()` nhưng
  contract không trả tên ra. Tenant không đủ thông tin để tạo đúng bản ghi.
- Không chỗ nào nói tenant phải trỏ A/CNAME về đâu. Xác minh TXT chỉ chứng minh quyền sở hữu; nó
  không làm tên miền hoạt động. Kết quả là trạng thái "Đã xác minh" nhưng vào vẫn trắng trang, và
  không có gì trong dashboard chỉ ra nguyên nhân.

## Cái đã có (không làm lại)

| Thành phần | Vị trí |
| --- | --- |
| Bảng `tenant_domains` (hostname citext unique, `is_primary`, `verification_token`, `verified_at`) + RLS | `apps/api/prisma/schema.prisma:680` |
| API self-serve: list / add / verify / set-primary / delete | `modules/tenancy/infrastructure/http/tenant-settings.controller.ts:169` |
| Bản admin tương ứng | `modules/tenancy/infrastructure/http/admin-tenant.controller.ts:198` |
| Cổng theo gói dịch vụ (`customDomain`) | `application/use-cases/assert-custom-domain-allowed.use-case.ts` |
| Xác minh TXT nền, BullMQ, retry backoff | `infrastructure/domain-verification.worker.ts` |
| Resolve tenant theo Host, cache Redis 60s, chỉ domain đã verified mới resolve | `application/use-cases/resolve-tenant-by-host.use-case.ts` |
| Storefront là `default_server` của nginx trong compose — domain mới không cần deploy | `docker/nginx/deploy.conf.template` |
| UI quản lý tên miền | `apps/dashboard/app/features/tenant/components/settings/tenant-domains-card.tsx` |

Gói `Studio Pro` trong seed đã bật `customDomain: true`, nên staging không vướng cổng plan.

## Quyết định đã chốt

1. **TLS: Caddy on-demand TLS** thay nginx trên host, có endpoint `ask` hỏi API trước khi cấp
   certificate. Miễn phí, tenant thêm domain là chạy, ops không phải thao tác gì cho từng tenant.
   Loại bỏ Cloudflare for SaaS (tốn phí + phải bật Proxied + phải viết integration CF API) và loại bỏ
   phương án tự động hoá certbot theo từng domain (nhiều mảnh tự viết, cấp certificate có độ trễ, dễ
   hỏng âm thầm lúc renew).
2. **DNS: hỗ trợ cả CNAME và A.** Tên miền con trỏ CNAME về một hostname cố định; tên miền gốc trỏ A
   về Elastic IP. Bỏ A là chặn tenant muốn dùng chính tên miền gốc — thực tế phổ biến ở Việt Nam.
   Target lấy từ config platform, không hardcode trong frontend.
3. **Xác minh: giữ TXT, thêm bước chẩn đoán "đã trỏ chưa".** TXT chống việc chiếm tên miền khi domain
   đổi chủ. Bước chẩn đoán chỉ resolve DNS tại thời điểm bấm, không thêm state.
4. **CORS của R2: mở `AllowedOrigins: ["*"]` cho riêng PUT.** Xem § "CORS của R2" bên dưới.

## Kiến trúc

```
Internet :80/:443
   ▼
Caddy (systemd trên host EC2)        ← thay docker/nginx/staging-host.conf
   ├── site tường minh: admin.stg.bookingos.vn, api.stg.bookingos.vn
   └── site catch-all `https://` với tls { on_demand }
          └── ask → http://127.0.0.1:8081/public/domains/tls-allowed?domain=<host>
   ▼ reverse_proxy 127.0.0.1:8080
compose nginx (giữ nguyên: storefront là default_server)
   ▼ storefront / dashboard / api
```

**Không cần wildcard certificate nữa.** Subdomain tenant (`studiohub.stg.bookingos.vn`) cũng là
row đã verified trong `tenant_domains` (seed đặt `verifiedAt`), nên nó đi chung đường on-demand như
custom domain: HTTP-01 cho từng host, không cần DNS-01, không cần build `xcaddy` với plugin
Cloudflare, không cần đặt Cloudflare API token trên máy. Certbot chỉ còn là đường lùi.

`docker/caddy/Caddyfile`:

```caddyfile
{
  email ops@bookingos.vn
  on_demand_tls { ask http://127.0.0.1:8081/public/domains/tls-allowed }
}

(app) {
  reverse_proxy 127.0.0.1:8080 {
    header_up X-Forwarded-Proto https
    header_up X-Forwarded-Host {host}
  }
}

admin.stg.bookingos.vn, api.stg.bookingos.vn { import app }

https:// {
  tls { on_demand }
  import app
}
```

Cú pháp on-demand thay đổi giữa các bản Caddy 2.x — chạy `caddy validate` với đúng bản cài trên máy
trước khi cắt, và giữ `ask` làm cơ chế bảo vệ duy nhất (các tuỳ chọn rate-limit cũ đã bị gỡ).

### Endpoint `ask`

Caddy gọi `GET .../tls-allowed?domain=<hostname>` **ngay trong lúc bắt tay TLS**; 2xx thì cấp
certificate, khác thì từ chối. Đây là thứ chặn người lạ trỏ tên miền bừa vào Elastic IP để ép hệ
thống đi xin certificate.

- `GET /public/domains/tls-allowed?domain=` — `@Public()`, controller → `CheckDomainTlsAllowedUseCase`
  → `ITenantDomainRepository.findByHostname` + `ITenantCache`. Verified → 200; còn lại → 404. Không
  đụng schema, không thêm bảng. Dùng lại cache Redis 60s sẵn có (kể cả negative caching).
- Đường đi tới API là listener nội bộ mới trên compose nginx, publish `127.0.0.1:8081`, **chỉ mở đúng
  path đó**:

  ```nginx
  server {
    listen 8081;
    location = /public/domains/tls-allowed { proxy_pass http://api_upstream; }
    location / { return 404; }
  }
  ```

  Không cho Caddy hỏi thẳng `https://api.stg.bookingos.vn` vì request đó vòng ngược qua chính Caddy
  trong lúc Caddy đang bắt tay TLS, phụ thuộc DNS public và chết nếu Caddy vừa restart.

Luật "chỉ domain đã verified mới resolve" trong `resolve-tenant-by-host` giữ nguyên; giờ nó chi phối
luôn cả việc cấp certificate.

## Thay đổi tầng ứng dụng

### Contract (`packages/contracts/src/contracts/tenancy.ts`)

| Thay đổi | Chi tiết |
| --- | --- |
| `domainResponseSchema` | Bỏ `verificationToken`, thay bằng `verification?: { recordType: 'TXT'; recordName: string; recordValue: string }`. `recordName` = `_bookingos-verify.<host>`, map ở `tenancy.mapper.ts` bằng `domainVerificationRecord()` sẵn có. Frontend là consumer duy nhất nên đổi thẳng, không cần giai đoạn đệm. |
| `tenancyConfigResponseSchema` | Thêm `storefrontCname: string` (ví dụ `connect.stg.bookingos.vn`) và `storefrontIpv4: string` (một Elastic IP). Nguồn: env `PLATFORM_STOREFRONT_CNAME`, `PLATFORM_STOREFRONT_IPV4`, wire cạnh `baseDomain` tại `tenancy.module.ts:82`. |
| mới `domainDnsCheckResponseSchema` | `{ pointsToUs, observedCname, observedIpv4[], checkedAt }` |

### API

- `GET /tenant/settings/tenancy-config` — dùng lại `GetTenancyConfigUseCase` (đang chỉ mở cho admin),
  khai báo `@RequirePermissions('tenant.settings.manage')` như các route domain hiện có. Để dashboard
  biết trỏ CNAME/A về đâu.
- `POST /tenant/settings/domains/:id/dns-check` và bản admin
  `POST /admin/tenants/:id/domains/:domainId/dns-check` — use-case riêng `CheckDomainDnsUseCase`, mở
  rộng port `IDnsVerifier` thêm `resolveCname` / `resolveIpv4` (adapter `node:dns/promises`, timeout
  3 giây). Chạy inline, không lưu state, không enqueue: đây là thao tác bấm tay để chẩn đoán, khác
  với verify TXT — verify phải chạy nền vì nó là điều kiện để tên miền sống. Route tenant dùng
  `tenant.settings.manage`; route admin dùng đúng permission đang gác các route domain trong
  `admin-tenant.controller.ts`.

`storefrontCname` là một bản ghi A mới trong Cloudflare (`connect.stg` → Elastic IP, DNS only). Nó
không nằm trong `tenant_domains` và **không cần certificate riêng** — nó chỉ là đích CNAME; TLS luôn
diễn ra trên hostname của tenant.

Mỗi use-case một file, một `execute()` công khai, controller → use-case → port theo luật của repo.

### Dashboard

`tenant-domains-card.tsx` dựng lại phần hướng dẫn thành hai bước:

- **Bước 1 · Chứng minh sở hữu** — bảng ba dòng Tên bản ghi / Loại / Giá trị, mỗi ô dùng
  `CopyableCode`. Nút "Kiểm tra lại DNS" (verify TXT) giữ nguyên hành vi.
- **Bước 2 · Trỏ tên miền** — hai khối: *Tên miền con* → `CNAME` về `storefrontCname`; *Tên miền gốc*
  → `A` về `storefrontIpv4`. Hiện cả khi tên miền đã verified, cho tới khi dns-check báo đã trỏ đúng.
- Nút **"Kiểm tra kết nối"** trên mỗi hàng, kết quả hiện inline trong hàng đó: đã trỏ đúng, hay đang
  trỏ về địa chỉ nào. Không thêm cột DB và không tự chạy trong loader — tránh mỗi lần mở trang
  settings là n truy vấn DNS làm chậm và chập chờn.
- `features/admin/components/tenant-domains-card.tsx` nhận cùng thông tin để support chẩn đoán hộ
  tenant.

## CORS của R2

Khách upload ảnh hồ sơ partner và ảnh đánh giá đi thẳng từ trình duyệt lên R2 bằng presigned URL
(`packages/ui/src/lib/upload.ts` → `fetch(uploadUrl, { method: 'PUT' })`), nên mỗi origin storefront
phải nằm trong CORS của bucket. Hôm nay đó là JSON gõ tay trong Cloudflare dashboard liệt kê đúng ba
origin (`docs/deployment-runbook.md` §8.3) — nghĩa là **mỗi tenant mới đều hỏng upload cho tới khi ops
sửa tay**, kể cả tenant chỉ dùng subdomain. Custom domain chỉ làm lỗ hổng sẵn có này lộ ra.

Cấu hình thay thế, đặt một lần trong Cloudflare:

```json
[{ "AllowedOrigins": ["*"], "AllowedMethods": ["PUT"],
   "AllowedHeaders": ["content-type"], "MaxAgeSeconds": 3600 }]
```

Lý do đây không phải nới lỏng bảo mật, ghi lại để lần audit sau khỏi phải suy luận lại: điều kiện duy
nhất để ghi được object là chữ ký trong presigned URL. Muốn có chữ ký phải gọi `/uploads/presign` của
BFF — route yêu cầu đăng nhập, cookie `httpOnly`, và `request-security.server.ts` chặn POST khác
origin bằng kiểm tra `Origin` + `sec-fetch-site`. Ai đã cầm URL đã ký thì dùng `curl` cũng PUT được;
CORS chưa bao giờ chặn request ngoài trình duyệt. Cấu hình trên cũng không bật credentials, nên không
có cookie nào đi kèm request PUT.

`STORAGE_UPLOAD_ORIGINS` là chuyện khác và **không** đổi: đó là danh sách origin *của R2* để đưa vào
CSP `connect-src` của storefront, không phụ thuộc số tenant.

Phương án sinh CORS tự động từ `tenant_domains` (outbox → `PutBucketCors`) đã cân nhắc và loại: nó
cần thêm secret R2 quyền admin cho API và thêm một điểm hỏng, mà không làm hệ thống an toàn hơn cấu
hình trên một cách thực chất.

## Ngoài phạm vi

- `is_primary` vẫn chỉ là nhãn: tên miền phụ tiếp tục phục vụ song song, không redirect canonical về
  tên miền chính.
- Cảnh báo chủ động khi tên miền đã verified nhưng chưa trỏ. Chỉ có nút kiểm tra thủ công.

## Cutover trên EC2

> **Đã lỗi thời (2026-08-08).** Mục này mô tả Caddy chạy như systemd unit trên host. Sau đó Caddy được
> đưa vào chính compose stack (service `caddy`, profile `tls`) để config của nó được workflow Deploy
> đồng bộ tự động thay vì scp tay, và việc cắt trên máy staging đã hoàn tất — thủ tục cắt một lần đó
> đã xoá khỏi repo, tìm lại bằng `git log -- docs/nginx-to-caddy-cutover.md`. Vận hành lâu dài:
> [`deployment.md`](../../deployment.md) → *TLS — Caddy on-demand* và Phase 6–7 của
> [`deployment-runbook.md`](../../deployment-runbook.md). Giữ lại mục này làm hồ sơ quyết định.
> Rủi ro #1 bên dưới cũng đổi theo: thư mục certificate giờ là volume `caddy_data`.

0. Tạo bản ghi A `connect.stg.bookingos.vn` → Elastic IP trên Cloudflare, để **DNS only**. Đây là
   đích CNAME cho tên miền con của tenant. Đồng thời thay CORS của bucket R2 bằng cấu hình wildcard ở
   § "CORS của R2" (làm được ngay, độc lập với mọi bước sau).
1. Deploy code mới trước — nginx host vẫn giữ 80/443, chưa ảnh hưởng gì. Nghiệm thu:
   `curl "http://127.0.0.1:8081/public/domains/tls-allowed?domain=studiohub.stg.bookingos.vn"`
   trả 200, domain lạ trả 404.
2. Cài Caddy từ repo chính thức, đặt Caddyfile (thay `email` bằng email vận hành thật — Let's Encrypt
   gửi cảnh báo hết hạn về đó), chạy `caddy validate`.
3. Cắt: `systemctl stop nginx && systemctl enable --now caddy`. Gián đoạn vài giây. Certificate cho
   `admin.` và `api.` xin ngay lúc start; subdomain tenant và custom domain xin ở request đầu tiên
   (request đó chậm khoảng 1–3 giây, các request sau bình thường).
4. Nghiệm thu: đăng nhập `admin.stg`, gọi `api.stg/health/ready`, mở một subdomain tenant, mở một
   custom domain thật.
5. Rollback: `systemctl stop caddy && systemctl start nginx`. Certificate certbot còn nguyên trên
   đĩa, cấu hình cũ còn trong repo.
6. Ổn định 1–2 tuần rồi mới tắt cron `certbot-renew`.

## File chạm vào

| Nhóm | File |
| --- | --- |
| Hạ tầng | `docker/caddy/Caddyfile` (mới) · `docker/nginx/deploy.conf.template` (thêm listener 8081) · `docker-compose.deploy.yml` (publish `127.0.0.1:8081`, thêm hai env cho api) · `.env.deploy.example` |
| API | `public-tenant.controller.ts` · `check-domain-tls-allowed.use-case.ts` (mới) · `check-domain-dns.use-case.ts` (mới) · `dns-verifier.port.ts` + adapter · `tenant-settings.controller.ts` · `admin-tenant.controller.ts` · `tenancy.mapper.ts` · `tenancy.module.ts` |
| Contracts / UI | `contracts/tenancy.ts` · `features/tenant/{components/settings,server}` · `features/admin/components/tenant-domains-card.tsx` |
| Docs | `docs/deployment.md` (topology + mục TLS) · `docs/deployment-runbook.md` (Phase 6 certbot → Caddy; §8.3 CORS → wildcard PUT kèm lý do; mục "Tenant custom domain" viết lại thành quy trình thật) · `docker/nginx/staging-host.conf` giữ lại kèm ghi chú đường lùi |

## Rủi ro

1. **Thư mục certificate của Caddy** (`/var/lib/caddy/.local/share/caddy`) phải sống cùng systemd unit
   chính thức. Xoá nhầm là xin lại toàn bộ certificate.
2. **Rate limit Let's Encrypt**: 50 certificate mỗi tuần cho một registered domain — mọi
   `*.stg.bookingos.vn` tính chung vào `bookingos.vn`. Vài tenant thì thoải mái; khi test lặp thì trỏ
   `acme_ca` sang staging CA của Let's Encrypt.
3. **Cloudflare phải giữ DNS only.** Bật Proxied là hỏng cả việc xin certificate lẫn hướng tenant trỏ
   A về Elastic IP.
4. Tên miền bị xoá vẫn còn certificate tới hạn — vô hại, storefront trả trang không tìm thấy tenant.
5. Nếu tenant mở tên miền **trước** khi verify xong, negative cache 60 giây khiến `ask` trả 404 và
   Caddy backoff; đợi khoảng một phút rồi thử lại. Sau `markVerified` đã có `invalidateHost` nên
   đường thuận không bị trễ.
6. Caddy là điểm chết duy nhất cho TLS, đúng như nginx hôm nay. Không làm rủi ro xấu đi, nhưng
   staging vẫn là một máy.

## Nghiệm thu

Theo luật no-tests của repo, xác minh bằng static gate và chạy thật:

```bash
pnpm check:no-tests && pnpm check:module-cycles && \
  pnpm --filter=@booking/storefront security && \
  pnpm turbo lint typecheck build && \
  pnpm --filter=@booking/api check:rls
```

Rồi chạy tay: thêm một tên miền trong dashboard tenant, đọc đúng tên bản ghi TXT, tạo bản ghi, verify
xanh, bấm "Kiểm tra kết nối" khi chưa trỏ (phải báo chưa trỏ) và sau khi trỏ (phải báo đã trỏ), mở
tên miền đó bằng HTTPS và thấy storefront đúng tenant.
