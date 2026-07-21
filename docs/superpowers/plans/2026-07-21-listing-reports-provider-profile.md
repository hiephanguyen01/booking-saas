# Listing Reports + Public Provider Profile - Implementation Plan

**Goal:** Cho phép khách hàng đã đăng nhập báo cáo một tin đăng đơn hoặc tin đăng nhiều hạng mục từ trang chi tiết; báo cáo đi đúng tenant để đội ngũ kiểm duyệt xem và xử lý. Đồng thời mở trang hồ sơ công khai của nhà cung cấp, truy cập được từ cả listing detail và listing-group detail, bám design system storefront hiện tại.

**Architecture:** Thêm bounded context `content-reports` độc lập theo luồng `controller -> use-case -> repository-port -> repository`, lưu report theo tenant trong Postgres RLS. Storefront submit qua React Router action rồi gọi API server-to-server. Tenant xử lý report trong dashboard, nhưng thao tác ẩn/đăng lại nội dung vẫn dùng moderation flow hiện có. Public provider profile dùng một projection riêng chỉ whitelist dữ liệu công khai; danh sách dịch vụ tiếp tục đi qua catalog search và review tiếp tục đi qua reviews module.

**Tech stack:** NestJS 11, Prisma/Postgres RLS, React Router 8 SSR, zod contracts, Tailwind v4, shadcn primitives từ `@booking/ui`, i18next storefront.

## Design read

Reading this as: public marketplace profile và trust/safety flow cho khách hàng Việt Nam, ưu tiên độ tin cậy, thao tác rõ ràng và giữ nguyên visual language của Studio storefront hiện tại.

- `DESIGN_VARIANCE: 4`: giữ layout card/grid hiện có, không tạo hero marketing mới.
- `MOTION_INTENSITY: 2`: chỉ hover/focus/dialog transition từ primitive hiện có.
- `VISUAL_DENSITY: 5`: đủ thông tin để đánh giá nhà cung cấp nhưng vẫn dễ quét trên mobile.
- Design system: dùng duy nhất shadcn semantic tokens và tenant theme hiện có. Không thêm palette, font, radius hoặc thư viện icon mới.

## Scope decisions

### Có trong slice này

- Report target: `listing` và `group`.
- Chỉ user đã đăng nhập mới submit được; API vẫn kiểm tra lại session.
- Lý do chuẩn hoá: `misleading`, `fraud_or_scam`, `prohibited_content`, `contact_or_off_platform`, `duplicate_or_spam`, `other`.
- Tenant có inbox, detail và workflow `open -> reviewing -> resolved | dismissed`.
- Report không tự động hide listing/group. Tenant mở moderation detail hiện có để quyết định.
- Public provider profile gồm identity/trust summary, thống kê thật, loại dịch vụ, catalog cards và review đã xác thực.
- Provider profile chỉ tồn tại khi partner `approved` và còn ít nhất một offering `published`.
- Profile không public phone, email, address riêng, contact info, payout info, business documents, identity document hoặc review note nội bộ.

### Không có trong slice này

- Report review/feed/chat, appeal, customer report history, attachment bằng chứng và notification center.
- Partner tự chỉnh riêng một “public profile” mới. Slice đầu dùng dữ liệu partner đã có và public-safe projection.
- Tự động suspend partner hoặc tự động hide content theo số lượng report.
- Platform-admin report inbox; tenant là bên xử lý trong scope hiện tại.
- Bất kỳ test file/config/script nào, theo ADR 0005.

## Target UX

### Listing và group detail

1. Menu ba chấm giữ “Sao chép liên kết” và thêm “Báo cáo tin đăng”.
2. User chưa đăng nhập thấy auth-required dialog; CTA đăng nhập quay lại đúng URL với report dialog mở lại.
3. User đã đăng nhập thấy dialog dùng `GenericForm`: lý do, mô tả bổ sung, lời giải thích report được gửi cho tenant.
4. Submit success thay form bằng confirmation; duplicate active report hiển thị trạng thái “tenant đã nhận báo cáo này”.
5. Nút trong `ProviderCard` trở thành link thật tới `/:locale/p/:partnerSlug`.

### Public provider profile

```text
[ logo/avatar ]  Tên nhà cung cấp   [Đã xác minh]
                 Hoạt động từ ...
                 Mô tả public-safe

Điểm đánh giá | Lượt trải nghiệm hoàn tất | Số dịch vụ đang mở

[Tất cả loại dịch vụ khả dụng dưới dạng tab]
[ListingCard] [ListingCard] [ListingCard]

Đánh giá từ khách hàng đã hoàn tất booking
```

- Container/rhythm dùng cùng `max-w-292.5`, `SectionCard`, `rounded-lg`, semantic colors và `ListingCard` hiện có.
- Desktop: header và metrics nằm trong một `SectionCard`; offerings grid 3 cột, tablet 2, mobile 1.
- Không dựng cover giả khi partner chỉ có logo. Không biến profile thành landing page.
- Empty/error/pagination state dùng primitive và copy song ngữ hiện có.

### Tenant report inbox

- Nav “Báo cáo vi phạm” nằm trong nhóm “Vận hành”, chỉ hiện với `tenant.listings.publish`.
- Index có status tabs, `ListToolbar`, pagination và các dòng report dễ quét.
- Detail cho thấy target snapshot, reporter display name, reason/details, thời gian, trạng thái và link tới moderation detail hiện có.
- Form xử lý dùng `GenericForm`; `resolved`/`dismissed` bắt buộc resolution note.

---

## Task 1: Contracts cho reports và public provider

**Files**

- Create: `packages/contracts/src/contracts/content-report.ts`
- Modify: `packages/contracts/src/contracts/partner.ts`
- Modify: `packages/contracts/src/contracts/listing.ts`
- Modify: `packages/contracts/src/contracts/catalog-search.ts`
- Modify: `packages/contracts/src/contracts/review.ts`
- Modify: `packages/contracts/src/index.ts`

**Interfaces**

- `contentReportTargetSchema = z.enum(['listing', 'group'])`.
- `contentReportReasonSchema` với 6 reason đã chốt.
- `contentReportStatusSchema = z.enum(['open', 'reviewing', 'resolved', 'dismissed'])`.
- `createContentReportInputSchema`: `target`, `targetId`, `reason`, `details?`; nếu `other`, `details` trim tối thiểu 20 ký tự; mọi details tối đa 1000.
- `updateContentReportInputSchema`: `status`, `resolutionNote?`; `resolved` và `dismissed` bắt buộc note tối thiểu 10 ký tự.
- `contentReportResponseSchema`: public-safe report result với `alreadyReported`.
- `tenantContentReportListQuerySchema`: pagination + `status`, `target`, `reason`, `q`, `from`, `to`.
- `tenantContentReportListResponseSchema`: items, total, page/pageSize và status counts.
- `tenantContentReportDetailResponseSchema`: snapshot target/reporter/partner + current target availability/status + resolution metadata.
- `publicPartnerProfileResponseSchema`: whitelist `id`, `slug`, `name`, `description`, `logoUrl`, `partnerType`, `identityVerified`, `activeSince`, aggregate stats và `listingTypes[{slug,name,count}]`.
- Extend `trustSignalsSchema` với `partnerSlug` và `partnerLogoUrl`.
- Add `trust` trực tiếp vào `publicListingGroupDetailResponseSchema`; group page không còn lấy provider từ child đầu tiên.
- Extend public catalog query với hidden filter `partner?: slug`, expose `applied.partner`, và add `partnerSlug` vào catalog item.
- Extend public review target với `partner` để profile tái dùng review API đã có.

**Checks**

- Không contract nào chứa Prisma/Nest/React import.
- `details`/`resolutionNote` không dùng `.default()` để vẫn tương thích `GenericForm`.
- Build contracts trước khi chạm consumer: `pnpm --filter=@booking/contracts build`.

---

## Task 2: Schema + hand-written RLS migration cho `content_reports`

**Files**

- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260721xxxxxx_content_reports/migration.sql`

**Model đề xuất**

- `id`, `tenantId`.
- `reporterUserId` nullable FK `users` với `ON DELETE SET NULL` và `reporterName` snapshot.
- `partnerId` nullable FK `partners` với `ON DELETE SET NULL` và `partnerName` snapshot.
- `targetType`, `targetId`, `targetTitle`, `targetSlug` snapshots. Không tạo polymorphic FK giả.
- `reason`, `details`, `status`.
- `handledByUserId`, `resolutionNote`, `handledAt`.
- `createdAt`, `updatedAt`.

**Indexes/invariants**

- Index `(tenant_id, status, created_at DESC)` cho inbox.
- Index `(tenant_id, target_type, target_id)` cho lookup/audit.
- Partial unique index một active report trên `(tenant_id, reporter_user_id, target_type, target_id)` khi status là `open` hoặc `reviewing`.
- RLS `ENABLE`, `FORCE`, `tenant_isolation` cả `USING` và `WITH CHECK`.
- Grant CRUD cho `app_user, app_admin` theo pattern reviews/favorites.
- Không thêm permission mới: tenant report moderation dùng permission `tenant.listings.publish` hiện có vì slice này chỉ report listing/group.

**Checks**

- `pnpm --filter=@booking/api prisma:generate`.
- `pnpm --filter=@booking/api check:rls`.
- Khi có local DB: `prisma:deploy`, xác nhận partial unique và RLS bằng SQL read-only/sanity flow, không tạo test file.

---

## Task 3: Content reports bounded context + customer submit API

**Files**

- Create: `apps/api/src/modules/content-reports/domain/ports/content-report-repository.port.ts`
- Create: `apps/api/src/modules/content-reports/domain/ports/content-report-tenant-reader.port.ts`
- Create: `apps/api/src/modules/content-reports/domain/report-status.ts`
- Create: `apps/api/src/modules/content-reports/application/content-report.mapper.ts`
- Create: `apps/api/src/modules/content-reports/application/use-cases/create-content-report.use-case.ts`
- Create: `apps/api/src/modules/content-reports/infrastructure/repositories/prisma-content-report.repository.ts`
- Create: `apps/api/src/modules/content-reports/infrastructure/repositories/prisma-content-report-tenant.reader.ts`
- Create: `apps/api/src/modules/content-reports/infrastructure/http/dto/content-report.dto.ts`
- Create: `apps/api/src/modules/content-reports/infrastructure/http/customer-content-report.controller.ts`
- Create: `apps/api/src/modules/content-reports/infrastructure/http/content-reports.module.ts`
- Modify: `apps/api/src/app.module.ts`

**Endpoint**

- `POST /customer/content-reports`
- Decorators: `@AuthenticatedOnly()` và `@Throttle({ default: { ttl: 60_000, limit: 5 } })`.
- Tenant được resolve từ `x-forwarded-host`/`host`, không nhận `tenantId` từ body.
- Reporter lấy từ `@CurrentPrincipal()`, không nhận `userId` từ body.

**Use-case flow**

1. Resolve tenant id qua admin read port, giống favorites/reviews.
2. Mở đúng một `TenantDbService.forTenant(tenantId, tx => ...)`.
3. Repository resolve target đang `published` và snapshot target/partner trong cùng tx.
4. Nếu không tồn tại, trả `404 REPORT_TARGET_NOT_FOUND`.
5. Nếu reporter đã có active report trên target, trả report hiện có với `alreadyReported: true`.
6. Nếu chưa có, create report `open`; partial unique bảo vệ race, repository re-read khi gặp `P2002`.
7. Response không trả reporter email/phone hoặc internal resolution fields.

---

## Task 4: Tenant report read + resolution API

**Files**

- Create: `apps/api/src/modules/content-reports/application/use-cases/list-tenant-content-reports.use-case.ts`
- Create: `apps/api/src/modules/content-reports/application/use-cases/get-tenant-content-report.use-case.ts`
- Create: `apps/api/src/modules/content-reports/application/use-cases/update-content-report-status.use-case.ts`
- Create: `apps/api/src/modules/content-reports/infrastructure/http/tenant-content-report.controller.ts`
- Modify: repository port/adapter, mapper, DTO và module từ Task 3.

**Endpoints**

- `GET /tenant/content-reports` with `@RequirePermissions('tenant.listings.publish')`.
- `GET /tenant/content-reports/:id` with cùng permission.
- `PATCH /tenant/content-reports/:id` with cùng permission.

**Rules**

- Query/search/count chạy trong một tenant tx; list dùng snapshot fields nên không có N+1.
- Detail batch/read target hiện tại để trả `targetAvailable` và `targetStatus`; snapshot vẫn còn nếu target đã bị xoá.
- Pure transition function kiểm tra workflow status.
- Terminal statuses bắt buộc resolution note; reopen sang `reviewing` xoá `handledAt`/handler cũ.
- Ghi `audit_logs` qua `AUDIT_WRITER` trong cùng tx cho mọi status change.
- Không gọi trực tiếp listing moderation use-case và không tự hide content.

---

## Task 5: Public provider profile projection + catalog/review integration

**Files**

- Create: `apps/api/src/modules/partner/domain/ports/public-partner-repository.port.ts`
- Create: `apps/api/src/modules/partner/domain/public-profile-content.ts`
- Create: `apps/api/src/modules/partner/application/public-partner.mapper.ts`
- Create: `apps/api/src/modules/partner/application/use-cases/get-public-partner-profile.use-case.ts`
- Create: `apps/api/src/modules/partner/infrastructure/repositories/prisma-public-partner.repository.ts`
- Create: `apps/api/src/modules/partner/infrastructure/http/public-partner.controller.ts`
- Modify: `apps/api/src/modules/partner/infrastructure/http/partner.module.ts`
- Modify: catalog query/use-case/read repository + mapper files under `apps/api/src/modules/catalog/**`
- Modify: public reviews query/repository/controller summary under `apps/api/src/modules/reviews/**`

**Public provider endpoint**

- `GET /public/partners/:slug` with `@Public()` and host-scoped tenant resolution.
- Dùng dedicated public repository/mapper; không gọi `toPartnerResponse()` vì mapper đó chứa PII.
- Partner phải `approved` và có ít nhất một display offering: group published hoặc listing standalone published.
- `listingTypes` count theo display unit: một group tính là một card, child của group không tính lặp, standalone listing tính một card.
- Stats từ dữ liệu thật: completed partner bookings, review aggregate, published offering count.
- `businessInfo.logoUrl` chỉ trả khi là URL http/https hợp lệ.
- Description chỉ trả khi public-content scanner không phát hiện phone/email/Zalo/external URL; nếu có flag thì trả `null`. Không redact từng đoạn để tránh hiển thị câu méo hoặc bỏ sót.

**Catalog integration**

- Catalog query nhận `partner` slug nhưng không render như một user-facing facet.
- Prisma public listing query lọc đúng partner slug và chỉ lấy partner `approved`.
- `partnerSlug` đi cùng catalog item để sitemap và future cards có canonical provider identity.
- Profile route dùng catalog search theo active listing type, không tạo lại logic giá/grouping/availability trong partner module.

**Reviews integration**

- `GET /public/reviews?target=partner&slug=...` resolve partner approved rồi lọc `Review.partnerId`.
- Giữ pagination/rating/sort hiện có.
- Update Swagger summary từ “listing or group” thành “listing, group or provider”.

---

## Task 6: Gắn provider identity vào listing/group detail API

**Files**

- Modify: `apps/api/src/modules/listing/domain/ports/listing-repository.port.ts`
- Modify: `apps/api/src/modules/listing/infrastructure/repositories/prisma-listing.repository.ts`
- Modify: `apps/api/src/modules/listing/application/listing.mapper.ts`
- Modify: `apps/api/src/modules/listing/application/use-cases/get-public-listing-group.use-case.ts`
- Modify: listing-group repository port/adapter nếu cần aggregate completed bookings.

**Changes**

- Listing detail trust trả `partnerSlug` + `partnerLogoUrl` bên cạnh name/verified/activeSince.
- Group detail trả `trust` trực tiếp từ group owner và group-level completed bookings; không bắt storefront dùng `roomOptions[0]` làm nguồn provider.
- Public listing/group chỉ hiện khi owning partner còn `approved`; suspended partner không có public profile hoặc public inventory.
- Logo được parse bằng cùng helper public-safe, không cast thẳng jsonb.

---

## Task 7: Storefront report dialog trên listing + group detail

**Files**

- Create: `apps/storefront/app/features/content-reports/components/report-content-dialog.tsx`
- Create: `apps/storefront/app/features/content-reports/components/report-login-required-dialog.tsx`
- Create: `apps/storefront/app/features/content-reports/server/submit-content-report.server.ts`
- Modify: `apps/storefront/app/features/listing-group/components/header-actions.tsx`
- Modify: `apps/storefront/app/features/listing/listing-page.tsx`
- Modify: `apps/storefront/app/features/listing-group/listing-group-page.tsx`
- Modify: `apps/storefront/app/routes/listing.tsx`
- Modify: `apps/storefront/app/routes/listing-group.tsx`
- Modify: `packages/i18n/src/locales/vi/listing.ts`
- Modify: `packages/i18n/src/locales/en/listing.ts`

**React Router flow**

- Thêm `action` vào cả listing và group route; hai action gọi chung `submitContentReport(request)` server helper.
- Action đọc JSON, re-validate `createContentReportInputSchema`, lấy auth token từ request context và gọi API server-to-server.
- Unauthenticated action trả/redirect đúng login flow; không có browser fetch.
- `GenericForm` submit vào current route. `shouldRevalidate` trả `false` khi action result là report mutation để tránh reload quote/availability/group room data nặng.
- Login CTA dùng `redirectTo` là current URL cộng `report=1`; sau login dialog tự mở. Đóng dialog bỏ param bằng replace navigation và không reset scroll.

**UI rules**

- Menu item dùng `Flag`, label song ngữ; không dùng destructive styling như thể report đã chắc chắn đúng.
- Form label nằm trên input, errors nằm dưới input; button 44px từ `size="control"`.
- Submit disabled/pending copy rõ ràng; success và duplicate-active là hai copy riêng.
- Mobile dialog không tràn viewport; focus trap/escape dùng shadcn Dialog.
- Không thêm toast global; confirmation nằm trong dialog để user biết tenant đã nhận.

---

## Task 8: Storefront public provider page + provider links

**Files**

- Create: `apps/storefront/app/routes/provider.tsx`
- Create: `apps/storefront/app/routes/legacy/provider.tsx`
- Create: `apps/storefront/app/features/provider/provider-page.tsx`
- Create: `apps/storefront/app/features/provider/components/provider-header.tsx`
- Create: `apps/storefront/app/features/provider/components/provider-offerings.tsx`
- Create: `apps/storefront/app/lib/provider.server.ts`
- Modify: `apps/storefront/app/routes.ts`
- Modify: `apps/storefront/app/lib/locale-paths.ts`
- Modify: `apps/storefront/app/features/listing-group/components/provider-card.tsx`
- Modify: `apps/storefront/app/features/listing-group/listing-group-page.tsx`
- Modify: `apps/storefront/app/features/listing/listing-page.tsx`
- Modify: `apps/storefront/app/components/public-reviews-section.tsx`
- Modify: `apps/storefront/app/routes/sitemap[.]xml.tsx`
- Create/modify provider namespace files under `packages/i18n/src/locales/{vi,en}` and namespace exports.

**Routes**

- Canonical: `/:locale/p/:partnerSlug`.
- Legacy redirect: `/p/:partnerSlug`.
- Add `storefrontPaths.provider(locale, slug)`; không string-build ở component.

**Loader**

1. Fetch profile và partner reviews bằng host-scoped public API.
2. Validate `?type=` against `profile.listingTypes`; fallback type đầu tiên.
3. Fetch catalog with `type`, `partner`, `page`, `pageSize=12`.
4. Return profile, active type, cards, pagination, reviews.

**Rendering**

- ProviderCard dùng `AvatarImage` khi có logo, fallback initials khi không có; button là `<Link>` thật, icon thể hiện profile/store thay vì `MessageCircle`.
- Provider header không hiển thị contact data; company/individual chỉ là localized supporting label.
- Metrics chỉ render dữ liệu thật, 0 vẫn hiển thị rõ; không fake booking count.
- Type tabs dùng links/URL, không client-side hidden state; pagination giữ `type`.
- Cards tái dùng `ListingCard` và favorite context hiện có.
- Reviews trên provider page hiển thị thêm listing/group context để user biết review thuộc dịch vụ nào.
- `meta` + JSON-LD dùng `ProfilePage` và `Organization`/`Person` theo partner type; canonical/hreflang theo root context.
- Sitemap thu thập unique `partnerSlug` từ catalog pages đã quét và thêm `/p/:slug` cho vi/en, không thêm một API index mới chỉ để phục vụ sitemap.

---

## Task 9: Tenant dashboard report inbox

**Files**

- Create: `apps/dashboard/app/routes/tenant/content-reports/_index.tsx`
- Create: `apps/dashboard/app/routes/tenant/content-reports/detail.tsx`
- Create: `apps/dashboard/app/features/content-reports/components/content-report-inbox.tsx`
- Create: `apps/dashboard/app/features/content-reports/components/content-report-detail.tsx`
- Create: `apps/dashboard/app/features/content-reports/lib/content-report-filters.ts`
- Create: `apps/dashboard/app/features/content-reports/server/content-report-action.server.ts`
- Modify: `apps/dashboard/app/routes/tenant/routes.ts`
- Modify: `apps/dashboard/app/routes/tenant/nav.ts`
- Modify: `apps/dashboard/app/constants/paths.ts`

**Index**

- Loader `requireTenant(request, 'tenant.listings.publish')`.
- `ListToolbar` filters `q`, target, reason, created date; status dùng `StatusFilterTabs` với counts từ API.
- List item cho thấy target title/type, partner snapshot, reporter display name, reason, created time và status badge.
- Empty/error/loading copy Vietnamese-hardcoded theo dashboard convention.

**Detail/action**

- Detail loader lấy report và tạo internal target link:
  - listing -> `/tenant/listings/:id/review`
  - group -> `/tenant/listing-groups/:id/review`
- Nếu target không còn, hiển thị snapshot và disabled callout, không tạo link chết.
- `GenericForm` dùng `updateContentReportInputSchema`; action re-validates JSON và `PATCH` API.
- Success redirect lại detail, giữ feedback ngắn; backend error giữ đúng upstream status.
- Không đưa reporter email/phone vào UI.

---

## Task 10: Documentation + verification

**Files**

- Modify: `TONG-QUAN.md`
- Modify: `docs/architecture.md`
- Modify: `docs/data-model.md`
- Create: `docs/features/content-reports.md`
- Create: `docs/features/public-provider-profile.md`

**Documentation**

- Chuyển listing/group reports ra khỏi future-only backlog; ghi rõ feed/review reports vẫn future.
- Cập nhật module list, report workflow, public profile privacy boundary và route map.
- Ghi rõ tenant moderation permission hiện dùng `tenant.listings.publish`; không gọi `tenant.reports.read` vì key đó dành cho analytics/financial reports.
- Ghi rõ report snapshots sống tiếp khi target/user bị xoá và target không tự động bị hide.

**Command verification, không có tests**

```bash
pnpm --filter=@booking/contracts build
pnpm --filter=@booking/i18n build
pnpm --filter=@booking/api prisma:generate
pnpm --filter=@booking/api check:rls
pnpm --filter=@booking/api lint
pnpm --filter=@booking/api typecheck
pnpm --filter=@booking/storefront security
pnpm turbo lint typecheck build
```

**Manual verification matrix**

- Logged out listing report -> login -> quay lại và dialog mở đúng target.
- Logged in report listing và group -> success; submit lại -> idempotent duplicate state.
- Crafted target id của tenant khác -> 404 do RLS/host scope.
- Report draft/hidden target từ request giả -> 404.
- Tenant owner thấy inbox, filter/paginate, mở detail, mark reviewing/resolved/dismissed.
- User tenant chỉ có read listing nhưng không publish -> nav ẩn và API 403.
- Report resolution không tự đổi listing status; link moderation vẫn hoạt động.
- Listing/group detail đều hiển thị cùng provider, logo/fallback, link đúng locale.
- Provider pending/suspended hoặc không có published offering -> 404.
- Provider profile không chứa phone/email/contact/payout/identity/business documents trong HTML/loader JSON.
- Provider profile type tabs, pagination, favorite, reviews, mobile 1-col và desktop 3-col hoạt động.
- Light/dark + tenant brand colors giữ contrast và focus ring.
- Sitemap chứa provider URLs duy nhất cho cả vi/en.

## Recommended implementation order

1. Task 1 contracts.
2. Task 2 schema/migration.
3. Tasks 3-4 reports API.
4. Tasks 5-6 provider/public detail API.
5. Task 7 storefront reports.
6. Task 8 provider page.
7. Task 9 tenant inbox.
8. Task 10 docs + full verification.

Backend foundation nên hoàn tất trước UI. Storefront report UI và provider page có thể làm song song sau khi contracts/API ổn định; tenant inbox phụ thuộc report list/detail/update API.
