# Private Partner Documents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make new partner identity/legal documents authenticated, limited to 5 MiB, write-once, private at rest, owner-scoped, and readable only through permission-gated short-lived grants while keeping partner logos public and legacy records reviewable during migration.

**Architecture:** Storage owns S3/MinIO primitives and signed-header enforcement; Partner owns document authorization, key ownership, persistence, and read grants. Sensitive files are persisted as opaque keys under applicant/partner private prefixes. Storefront and dashboard share one private-document uploader from `@booking/ui`. A separate idempotent API script migrates legacy public document URLs.

**Tech Stack:** NestJS 11, Prisma 6/PostgreSQL/RLS, AWS SDK for JavaScript v3, React Router 8 SSR, React 19, Zod, MinIO-compatible disposable storage, pnpm/Turbo.

**Spec:** `docs/superpowers/specs/2026-08-21-private-partner-documents-design.md`

## Global Constraints

- ADR 0005 forbids automated test files/runners; do not add Jest, Vitest, Playwright, or test files.
- Partner document maximum is exactly `5 * 1024 * 1024` bytes.
- Allowed MIME types are exactly JPEG, PNG, WebP, AVIF, GIF; ICO remains excluded.
- New sensitive documents go only to `S3_PRIVATE_BUCKET`; partner logo remains public.
- New writes use `...Key` / `...Keys`; legacy `...Url` and `licenseDocs` are read-only compatibility inputs.
- Applicant prefix: `partner-documents/applicants/<userId>/...`.
- Existing partner prefix: `partner-documents/partners/<partnerId>/...`.
- Private download URLs are never persisted and never appear in public partner APIs.
- Never log presigned URLs, document bytes, identity numbers, or full private object keys.
- No Prisma schema migration; `businessInfo` remains JSONB.
- No deploy unless separately authorized.
- At execution time use isolated branch `fix/sec-002-private-partner-documents` from this approved design branch head. If `main` moved, refresh against current `main` before product-code commits.

---

### Task 1: Define contracts and enforce signed PUT headers

**Files:**
- Modify: `packages/contracts/src/contracts/partner.ts`
- Modify: `apps/api/src/modules/storage/infrastructure/services/s3-storage.service.ts`
- Verify unchanged: `apps/dashboard/app/features/tenant/components/finance/tax-document-upload-field.tsx`
- Verify unchanged: `apps/api/src/modules/finance/application/use-cases/create-tax-document-upload.use-case.ts`

**Produces:**

```ts
partnerDocumentContentTypeSchema
PARTNER_DOCUMENT_UPLOAD_ACCEPT
MAX_PARTNER_DOCUMENT_SIZE_BYTES
partnerDocumentUploadInputSchema
privateDocumentUploadResponseSchema
partnerDocumentKindSchema
partnerDocumentReadItemSchema
partnerDocumentReadListSchema
```

- [ ] **Step 1: Add upload contracts to `partner.ts`**

```ts
export const partnerDocumentContentTypeSchema = z.enum([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/gif',
]);
export type PartnerDocumentContentType = z.infer<typeof partnerDocumentContentTypeSchema>;

export const PARTNER_DOCUMENT_UPLOAD_ACCEPT = partnerDocumentContentTypeSchema.options;
export const MAX_PARTNER_DOCUMENT_SIZE_BYTES = 5 * 1024 * 1024;

export const partnerDocumentUploadInputSchema = z.object({
  contentType: partnerDocumentContentTypeSchema,
  sizeBytes: z.number().int().min(1).max(MAX_PARTNER_DOCUMENT_SIZE_BYTES),
});
export type PartnerDocumentUploadInput = z.infer<typeof partnerDocumentUploadInputSchema>;

export const privateDocumentUploadResponseSchema = z.object({
  uploadUrl: z.string().url(),
  key: z.string().min(1),
  expiresInSec: z.number().int().positive(),
  requiredHeaders: z.object({
    'content-type': partnerDocumentContentTypeSchema,
    'if-none-match': z.literal('*'),
  }),
});
export type PrivateDocumentUploadResponse = z.infer<typeof privateDocumentUploadResponseSchema>;
```

- [ ] **Step 2: Add read contracts**

```ts
export const partnerDocumentKindSchema = z.enum([
  'identity_card_front',
  'identity_card_back',
  'business_license_front',
  'business_license_back',
  'license_document',
]);
export type PartnerDocumentKind = z.infer<typeof partnerDocumentKindSchema>;

export const partnerDocumentReadItemSchema = z.discriminatedUnion('storage', [
  z.object({
    storage: z.literal('private'),
    kind: partnerDocumentKindSchema,
    key: z.string().min(1),
    downloadUrl: z.string().url(),
    expiresInSec: z.number().int().positive(),
  }),
  z.object({
    storage: z.literal('legacy_public'),
    kind: partnerDocumentKindSchema,
    url: z.string().url(),
  }),
]);
export const partnerDocumentReadListSchema = z.array(partnerDocumentReadItemSchema);
export type PartnerDocumentReadItem = z.infer<typeof partnerDocumentReadItemSchema>;
```

- [ ] **Step 3: Sign exact headers in `S3StorageService.createUpload()`**

```ts
const signableHeaders = new Set<string>(['content-type']);
if (input.contentLength !== undefined) signableHeaders.add('content-length');
if (input.writeOnce) signableHeaders.add('if-none-match');

const uploadUrl = await getSignedUrl(
  this.client,
  new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: input.contentType,
    ...(input.contentLength !== undefined ? { ContentLength: input.contentLength } : {}),
    ...(input.writeOnce ? { IfNoneMatch: '*' } : {}),
  }),
  { expiresIn: this.config.presignExpiresSec, signableHeaders },
);
```

Use `!== undefined`, not a truthy length check.

- [ ] **Step 4: Confirm finance regression precondition**

Current tax client must still PUT:

```ts
headers: { 'content-type': file.type, 'if-none-match': '*' }
```

and `CreateTaxDocumentUploadUseCase` must still set `contentLength` + `writeOnce: true`. The current repository already satisfies this; do not modify finance in this task.

- [ ] **Step 5: Verify and commit**

```bash
pnpm --filter=@booking/contracts build
pnpm --filter=@booking/api typecheck
pnpm --filter=@booking/api build

git add packages/contracts/src/contracts/partner.ts \
  apps/api/src/modules/storage/infrastructure/services/s3-storage.service.ts
git commit -m "fix(storage): enforce signed partner upload headers"
```

---

### Task 2: Add canonical owner-scoped keys and private presign endpoints

**Files:**
- Create: `apps/api/src/modules/partner/domain/partner-document-key.ts`
- Create: `apps/api/src/modules/partner/application/use-cases/create-applicant-document-upload.use-case.ts`
- Create: `apps/api/src/modules/partner/application/use-cases/create-partner-document-upload.use-case.ts`
- Modify: `apps/api/src/modules/partner/infrastructure/http/dto/partner.dto.ts`
- Modify: `apps/api/src/modules/partner/infrastructure/http/partner-application.controller.ts`
- Modify: `apps/api/src/modules/partner/infrastructure/http/partner-profile.controller.ts`
- Modify: `apps/api/src/modules/partner/infrastructure/http/partner.module.ts`

**Produces:**

```ts
applicantPartnerDocumentPrefix(userId: string): string
partnerDocumentPrefix(partnerId: string): string
isApplicantDocumentKeyForUser(userId: string, key: string): boolean
isPartnerDocumentKey(partnerId: string, key: string): boolean
```

and authenticated endpoints:

```text
POST /partners/application-documents/presign
POST /partner/profile/documents/presign
```

- [ ] **Step 1: Create strict key helpers**

```ts
const DOCUMENT_FILE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:jpg|png|webp|avif|gif)$/;

export const applicantPartnerDocumentPrefix = (userId: string) =>
  `partner-documents/applicants/${userId}`;
export const partnerDocumentPrefix = (partnerId: string) =>
  `partner-documents/partners/${partnerId}`;

function belongsToPrefix(prefix: string, key: string): boolean {
  if (!key || key.includes('..') || key.startsWith('/') || key.includes('\\')) return false;
  const base = `${prefix}/`;
  return key.startsWith(base) && DOCUMENT_FILE.test(key.slice(base.length));
}

export const isApplicantDocumentKeyForUser = (userId: string, key: string) =>
  belongsToPrefix(applicantPartnerDocumentPrefix(userId), key);
export const isPartnerDocumentKey = (partnerId: string, key: string) =>
  belongsToPrefix(partnerDocumentPrefix(partnerId), key);
```

This exactly matches the current `randomUUID()` filename shape from storage.

- [ ] **Step 2: Add DTO wrappers**

```ts
export class PartnerDocumentUploadDto extends createZodDto(partnerDocumentUploadInputSchema) {}
export class PrivateDocumentUploadResponseDto extends createZodDto(
  privateDocumentUploadResponseSchema,
) {}
```

- [ ] **Step 3: Implement applicant presign use case**

```ts
@Injectable()
export class CreateApplicantDocumentUploadUseCase {
  constructor(@Inject(STORAGE_PORT) private readonly storage: StoragePort) {}

  async execute(
    userId: string,
    input: PartnerDocumentUploadInput,
  ): Promise<PrivateDocumentUploadResponse> {
    const grant = await this.storage.createPrivatePresignedUpload({
      keyPrefix: applicantPartnerDocumentPrefix(userId),
      contentType: input.contentType,
      contentLength: input.sizeBytes,
      writeOnce: true,
    });
    return {
      ...grant,
      requiredHeaders: { 'content-type': input.contentType, 'if-none-match': '*' },
    };
  }
}
```

- [ ] **Step 4: Implement existing-partner presign use case**

Use the same code with `partnerDocumentPrefix(partnerId)`.

- [ ] **Step 5: Add controllers**

Applicant controller:

```ts
@AuthenticatedOnly()
@Throttle(THROTTLE_UPLOAD)
@Post('application-documents/presign')
@HttpCode(200)
@ApiOkResponse({ type: PrivateDocumentUploadResponseDto })
async presignApplicationDocument(
  @CurrentPrincipal() principal: SessionPrincipal,
  @Body() input: PartnerDocumentUploadDto,
): Promise<PrivateDocumentUploadResponse> {
  return this.createApplicantDocumentUpload.execute(principal.userId, input);
}
```

Partner profile controller:

```ts
@RequirePermissions('partner.profile.manage')
@UseGuards(RequireCurrentAgreementGuard)
@Throttle(THROTTLE_UPLOAD)
@Post('documents/presign')
@HttpCode(200)
@ApiOkResponse({ type: PrivateDocumentUploadResponseDto })
async presignDocument(@Body() input: PartnerDocumentUploadDto) {
  return this.createPartnerDocumentUpload.execute(
    this.tenantContext.partnerIdOrThrow(),
    input,
  );
}
```

- [ ] **Step 6: Register providers, verify, commit**

```bash
pnpm check:module-cycles
pnpm --filter=@booking/api lint
pnpm --filter=@booking/api typecheck
pnpm --filter=@booking/api build

git add apps/api/src/modules/partner/domain/partner-document-key.ts \
  apps/api/src/modules/partner/application/use-cases/create-applicant-document-upload.use-case.ts \
  apps/api/src/modules/partner/application/use-cases/create-partner-document-upload.use-case.ts \
  apps/api/src/modules/partner/infrastructure/http/dto/partner.dto.ts \
  apps/api/src/modules/partner/infrastructure/http/partner-application.controller.ts \
  apps/api/src/modules/partner/infrastructure/http/partner-profile.controller.ts \
  apps/api/src/modules/partner/infrastructure/http/partner.module.ts
git commit -m "feat(partner): add private document upload grants"
```

---

### Task 3: Make private keys the only new sensitive-document persistence format

**Files:**
- Modify: `packages/contracts/src/contracts/partner.ts`
- Modify: `apps/api/src/modules/partner/domain/errors/partner-errors.ts`
- Create: `apps/api/src/modules/partner/domain/partner-document-business-info.ts`
- Modify: `apps/api/src/modules/partner/domain/entities/partner.entity.ts`
- Modify: `apps/api/src/modules/partner/application/use-cases/apply-as-partner.use-case.ts`
- Modify: `apps/api/src/modules/partner/application/use-cases/update-partner-documents.use-case.ts`
- Modify: `apps/api/src/modules/storage/infrastructure/http/upload.controller.ts`

- [ ] **Step 1: Rename sensitive fields in both registration contracts**

In `partnerRegistrationSchema` and `partnerOnboardingProfileSchema` rename:

```text
businessLicenseFrontUrl -> businessLicenseFrontKey
businessLicenseBackUrl -> businessLicenseBackKey
identityCardFrontUrl -> identityCardFrontKey
identityCardBackUrl -> identityCardBackKey
```

Key fields use `z.string().min(1)`; update every `superRefine` path. Change profile document update schema to:

```ts
export const updatePartnerDocumentsInputSchema = z.object({
  logoUrl: z.string().url().or(z.literal('')).optional(),
  licenseDocumentKeys: z.array(z.string().min(1)).max(20).optional(),
});
```

- [ ] **Step 2: Add stable error**

```ts
export class InvalidPartnerDocumentReference extends DomainError {
  constructor() {
    super(
      'INVALID_PARTNER_DOCUMENT_REFERENCE',
      400,
      'Partner document reference is invalid or belongs to another owner',
    );
  }
}
```

Never put the rejected key in the error message.

- [ ] **Step 3: Add new-write validation helpers**

`partner-document-business-info.ts` defines legacy sensitive fields and:

```ts
export function assertApplicantDocumentReferences(
  userId: string,
  businessInfo: Record<string, unknown>,
): void;

export function assertPartnerDocumentReferences(
  partnerId: string,
  keys: readonly string[],
): void;
```

`assertApplicantDocumentReferences` rejects any presence of legacy fields:

```text
identityCardFrontUrl
identityCardBackUrl
businessLicenseFrontUrl
businessLicenseBackUrl
licenseDocs
```

and validates each present canonical applicant key with `isApplicantDocumentKeyForUser`. `assertPartnerDocumentReferences` requires every key to satisfy `isPartnerDocumentKey`.

- [ ] **Step 4: Enforce applicant ownership before tenant transaction**

```ts
const businessInfo = input.businessInfo ?? {};
assertApplicantDocumentReferences(userId, businessInfo);
```

Pass this validated object to `Partner.apply()`.

- [ ] **Step 5: Change aggregate document merge**

```ts
mergeDocuments(input: {
  logoUrl?: string;
  licenseDocumentKeys?: string[];
}): PartnerBusinessInfoIntent {
  const businessInfo: Record<string, unknown> = { ...this.state.businessInfo };
  if (input.logoUrl !== undefined) businessInfo.logoUrl = input.logoUrl;
  if (input.licenseDocumentKeys !== undefined) {
    businessInfo.licenseDocumentKeys = input.licenseDocumentKeys;
  }
  const intent = { businessInfo };
  this.state = { ...this.state, ...intent };
  return intent;
}
```

Do not delete legacy fields here; migration owns cleanup.

- [ ] **Step 6: Enforce partner ownership in `UpdatePartnerDocumentsUseCase`**

Validate `input.licenseDocumentKeys ?? []` before calling `mergeDocuments()`.

- [ ] **Step 7: Remove anonymous public partner presign**

Delete `presignPartnerApplication()` from `UploadController` and remove its `@Public()` import. Keep authenticated generic `POST /uploads/presign` unchanged for public media/logo.

- [ ] **Step 8: Verify and commit**

```bash
pnpm check:no-tests
pnpm check:module-cycles
pnpm --filter=@booking/contracts build
pnpm --filter=@booking/api lint
pnpm --filter=@booking/api typecheck
pnpm --filter=@booking/api build

git add packages/contracts/src/contracts/partner.ts \
  apps/api/src/modules/partner/domain/errors/partner-errors.ts \
  apps/api/src/modules/partner/domain/partner-document-business-info.ts \
  apps/api/src/modules/partner/domain/entities/partner.entity.ts \
  apps/api/src/modules/partner/application/use-cases/apply-as-partner.use-case.ts \
  apps/api/src/modules/partner/application/use-cases/update-partner-documents.use-case.ts \
  apps/api/src/modules/storage/infrastructure/http/upload.controller.ts
git commit -m "fix(partner): persist sensitive documents as private keys"
```

Frontend typecheck may be red at this checkpoint because contracts changed; Tasks 5-6 must restore it before final verification.

---

### Task 4: Add audited permission-gated private document reads

**Files:**
- Extend: `apps/api/src/modules/partner/domain/partner-document-business-info.ts`
- Create: `apps/api/src/modules/partner/application/use-cases/list-partner-documents.use-case.ts`
- Modify: `apps/api/src/modules/partner/infrastructure/http/dto/partner.dto.ts`
- Modify: `apps/api/src/modules/partner/infrastructure/http/partner-profile.controller.ts`
- Modify: `apps/api/src/modules/partner/infrastructure/http/tenant-partner.controller.ts`
- Modify: `apps/api/src/modules/partner/infrastructure/http/partner.module.ts`

**Produces:**

```text
GET /partner/profile/documents
GET /tenant/partners/:id/documents
```

- [ ] **Step 1: Collect canonical + legacy references**

`collectPartnerDocumentReferences(businessInfo)` maps:

```text
identityCardFrontKey -> identity_card_front
identityCardBackKey -> identity_card_back
businessLicenseFrontKey -> business_license_front
businessLicenseBackKey -> business_license_back
licenseDocumentKeys[] -> license_document

identityCardFrontUrl -> identity_card_front (legacy_public)
identityCardBackUrl -> identity_card_back (legacy_public)
businessLicenseFrontUrl -> business_license_front (legacy_public)
businessLicenseBackUrl -> business_license_back (legacy_public)
licenseDocs[] -> license_document (legacy_public)
```

Ignore malformed values and preserve array order.

- [ ] **Step 2: Implement `ListPartnerDocumentsUseCase`**

```ts
export type PartnerDocumentViewer =
  | { actorType: 'partner'; actorId: string }
  | { actorType: 'tenant'; actorId: string };

execute(
  tenantId: string,
  partnerId: string,
  viewer: PartnerDocumentViewer,
): Promise<PartnerDocumentReadItem[]>
```

Dependencies: `PARTNER_REPOSITORY`, `TenantDbService`, `STORAGE_PORT`, `AUDIT_WRITER`.

Inside `tenantDb.forTenant()` load the partner, throw `PartnerNotFound`, collect refs, then audit exactly:

```ts
{
  tenantId,
  actorUserId: viewer.actorId,
  action:
    viewer.actorType === 'partner'
      ? 'partner.private_documents.self_view_requested'
      : 'partner.private_documents.view_requested',
  entityType: 'partner',
  entityId: partnerId,
  data: { partnerId, documentCount: refs.length, viewerType: viewer.actorType },
}
```

After transaction commit, sign only the collected private keys with `createPrivatePresignedDownload({ key })`; return legacy URLs as `legacy_public`. No caller-supplied arbitrary key exists in this API.

- [ ] **Step 3: Add response DTO + controller routes**

```ts
export class PartnerDocumentReadItemDto extends createZodDto(partnerDocumentReadItemSchema) {}
```

Partner self route uses `partner.profile.manage`, current tenant/partner context, and current principal. Do **not** add `RequireCurrentAgreementGuard` to this read.

Tenant route uses `tenant.partners.read`, `:id`, tenant context/RLS, and current principal.

- [ ] **Step 4: Register, verify, commit**

```bash
pnpm check:module-cycles
pnpm --filter=@booking/api lint
pnpm --filter=@booking/api typecheck
pnpm --filter=@booking/api build
pnpm --filter=@booking/api check:rls

git add apps/api/src/modules/partner/domain/partner-document-business-info.ts \
  apps/api/src/modules/partner/application/use-cases/list-partner-documents.use-case.ts \
  apps/api/src/modules/partner/infrastructure/http/dto/partner.dto.ts \
  apps/api/src/modules/partner/infrastructure/http/partner-profile.controller.ts \
  apps/api/src/modules/partner/infrastructure/http/tenant-partner.controller.ts \
  apps/api/src/modules/partner/infrastructure/http/partner.module.ts
git commit -m "feat(partner): gate private document reads"
```

---

### Task 5: Add shared private uploader and move storefront onboarding to it

**Files:**
- Modify: `packages/ui/src/lib/upload.ts`
- Create: `packages/ui/src/components/form/private-document-upload.tsx`
- Modify: `packages/ui/src/components/form/types.ts`
- Modify: `packages/ui/src/components/form/field-renderer.tsx`
- Modify: `apps/storefront/app/constants/api-paths.ts`
- Modify: `apps/storefront/app/constants/paths.ts`
- Modify: `apps/storefront/app/routes.ts`
- Modify: `apps/storefront/app/features/storage/server/partner-upload-presign-route.server.ts`
- Create: `apps/storefront/app/routes/uploads.partner-documents.presign.tsx`
- Delete: `apps/storefront/app/routes/uploads.presign.tsx`
- Modify: `apps/storefront/app/features/partner-onboarding/components/partner-profile-fields.tsx`
- Modify: `apps/storefront/app/features/partner-onboarding/server/partner-onboarding-domain.ts`
- Modify: `apps/storefront/CLAUDE.md` to remove the stale claim that storefront `/uploads/presign` is a generic authenticated image proxy.

**Produces:**

```ts
presignAndPutPrivateDocument(file, options): Promise<{ key: string }>
```

and storefront resource path:

```text
/uploads/partner-documents/presign
```

The repository search shows `storefrontPaths.uploadPresign` is used only by partner onboarding, so the old storefront `/uploads/presign` route is removed rather than retained as an ambiguous second path.

- [ ] **Step 1: Add private transport to `@booking/ui/lib/upload.ts`**

Mirror the private grant locally so `@booking/ui` remains free of `@booking/contracts`:

```ts
interface PrivateDocumentPresignGrant {
  uploadUrl: string;
  key: string;
  expiresInSec: number;
  requiredHeaders: { 'content-type': string; 'if-none-match': '*' };
}
```

`presignAndPutPrivateDocument()` POSTs `{ contentType: file.type, sizeBytes: file.size }`, validates the response, requires `requiredHeaders['content-type'] === file.type` and `requiredHeaders['if-none-match'] === '*'`, then PUTs `body: file` with exactly `headers: grant.requiredHeaders`. Browser code must not set `content-length` manually.

- [ ] **Step 2: Add controlled `PrivateDocumentUpload`**

```ts
export interface PrivateDocumentUploadProps {
  value?: string | null;
  onChange: (key: string) => void;
  presignEndpoint: string;
  accept: readonly string[];
  maxSizeMb: number;
  disabled?: boolean;
  label?: string;
}
```

It validates MIME/size, persists only the key, uses `URL.createObjectURL(file)` only for transient preview, revokes object URLs on replacement/unmount, and shows a neutral “Tài liệu đã tải lên” state when it has a persisted key but no local preview.

- [ ] **Step 3: Wire `FileFieldConfig` private mode**

Add:

```ts
uploadMode?: 'public-image' | 'private-document';
```

Default is `public-image`. `FieldRenderer` renders `PrivateDocumentUpload` for private mode and existing `ImageUpload` otherwise. Private mode requires `presignEndpoint`; `ImageUpload` remains unchanged.

- [ ] **Step 4: Replace storefront path constants**

Backend constant:

```ts
partner: {
  apply: '/partners/apply',
  applicationDocumentPresign: '/partners/application-documents/presign',
},
```

Remove old `/uploads/partner-applications/presign`.

Storefront path:

```ts
partnerDocumentUploadPresign: '/uploads/partner-documents/presign',
```

Remove `storefrontPaths.uploadPresign` after its only call site is migrated.

- [ ] **Step 5: Make the BFF authenticated and phase-aware with a concrete locale source**

In `partner-upload-presign-route.server.ts`:

```ts
const tenant = getCurrentStorefrontTenant();
const locale = resolveLocale(request, tenant.defaultLocale);
await requirePartnerPhase(request, 'partner_registration_profile', locale);
const auth = requireAuth(storefrontPaths.becomePartner(locale));
```

Then body-limit with `MAX_PRESIGN_REQUEST_BYTES`, parse `partnerDocumentUploadInputSchema`, call authenticated `apiPost<PrivateDocumentUploadResponse>` with `auth.session.accessToken`, validate `privateDocumentUploadResponseSchema`, validate `uploadUrl` through `allowedStorageUploadUrl()`, and return no `publicUrl`. Remove `publicPost` usage.

- [ ] **Step 6: Replace the old resource route**

Delete `routes/uploads.presign.tsx`. Create `routes/uploads.partner-documents.presign.tsx` as a thin action delegating to the handler. In `routes.ts`, replace:

```ts
route('uploads/presign', 'routes/uploads.presign.tsx')
```

with:

```ts
route('uploads/partner-documents/presign', 'routes/uploads.partner-documents.presign.tsx')
```

- [ ] **Step 7: Rename onboarding fields and payload**

Use `businessLicenseFrontKey`, `businessLicenseBackKey`, `identityCardFrontKey`, `identityCardBackKey`. Each field sets:

```ts
uploadMode: 'private-document',
presignEndpoint: storefrontPaths.partnerDocumentUploadPresign,
accept: PARTNER_DOCUMENT_UPLOAD_ACCEPT,
maxSizeMb: MAX_PARTNER_DOCUMENT_SIZE_BYTES / (1024 * 1024),
variant: 'document',
```

`partner-onboarding-domain.ts` writes those keys into `businessInfo`; it emits no sensitive legacy URL fields.

- [ ] **Step 8: Verify and commit**

```bash
pnpm --filter=@booking/ui lint
pnpm --filter=@booking/ui typecheck
pnpm check:frontend-structure
pnpm --filter=@booking/storefront security
pnpm --filter=@booking/storefront lint
pnpm --filter=@booking/storefront typecheck
pnpm --filter=@booking/storefront build

git add packages/ui/src/lib/upload.ts \
  packages/ui/src/components/form/private-document-upload.tsx \
  packages/ui/src/components/form/types.ts \
  packages/ui/src/components/form/field-renderer.tsx \
  apps/storefront/app/constants/api-paths.ts \
  apps/storefront/app/constants/paths.ts \
  apps/storefront/app/routes.ts \
  apps/storefront/app/features/storage/server/partner-upload-presign-route.server.ts \
  apps/storefront/app/routes/uploads.partner-documents.presign.tsx \
  apps/storefront/app/features/partner-onboarding/components/partner-profile-fields.tsx \
  apps/storefront/app/features/partner-onboarding/server/partner-onboarding-domain.ts \
  apps/storefront/CLAUDE.md
git rm -- apps/storefront/app/routes/uploads.presign.tsx
git commit -m "fix(storefront): upload partner documents privately"
```

---

### Task 6: Split dashboard public logo from private legal documents

**Files:**
- Reuse: `packages/ui/src/components/form/private-document-upload.tsx`
- Modify: `apps/dashboard/app/constants/api-paths.ts`
- Modify: `apps/dashboard/app/constants/paths.ts`
- Modify: `apps/dashboard/app/routes.ts`
- Create: `apps/dashboard/app/routes/uploads.partner-documents.presign.tsx`
- Modify: `apps/dashboard/app/features/partner/components/profile/profile-documents-card.tsx`
- Modify: `apps/dashboard/app/features/partner/server/profile-actions.server.ts`
- Modify: `apps/dashboard/app/routes/partner/profile.tsx`
- Modify: `apps/dashboard/app/features/tenant/lib/partner-business-info.ts`
- Modify: `apps/dashboard/app/routes/tenant/partners/detail.tsx`
- Modify: tenant identity/legal card components that currently receive `identityPhotos` / `licensePhotos`.

- [ ] **Step 1: Add exact dashboard constants**

Keep existing `apiPaths.partner.profileDocuments` as the PATCH path. Add:

```ts
partner: {
  ...,
  profileDocumentPresign: partnerPath('/profile/documents/presign'),
  profileDocumentList: partnerPath('/profile/documents'),
},
tenant: {
  ...,
  partnerDocuments: (partnerId: string) =>
    tenantPath(`/partners/${segment(partnerId)}/documents`),
},
```

Add `dashboardPaths.partnerDocumentUploadPresign = '/uploads/partner-documents/presign'`.

- [ ] **Step 2: Add same-origin partner presign route**

Route action uses `requirePartner(request)`, parses `partnerDocumentUploadInputSchema`, POSTs to `profileDocumentPresign`, validates `privateDocumentUploadResponseSchema`, and returns the grant. Register `uploads/partner-documents/presign` in dashboard `routes.ts`.

- [ ] **Step 3: Split `ProfileDocumentsCard`**

Logo stays on existing generic public upload path. Additional legal docs use shared `PrivateDocumentUpload` and submit `licenseDocumentKeys`. Existing descriptors display `downloadUrl` for `private` and `url` for `legacy_public`; display URLs are never persisted.

- [ ] **Step 4: Update append/delete actions**

`profile-actions.server.ts` appends new `licenseDocumentKeys` to existing canonical keys, max 20. Private deletion filters by key. Legacy URL deletion remains compatibility-only against legacy `licenseDocs` until operational migration removes them.

- [ ] **Step 5: Load partner read descriptors**

`routes/partner/profile.tsx` fetches `PartnerDocumentReadItem[]` from `profileDocumentList` alongside current profile data. A document-list failure degrades only the document section.

- [ ] **Step 6: Load tenant review descriptors**

`routes/tenant/partners/detail.tsx` fetches `PartnerDocumentReadItem[]` from `tenant.partnerDocuments(params.partnerId)` under current `tenant.partners.read` auth. `partner-business-info.ts` stops being the primary source for sensitive document images; it retains non-document legal text/logo compatibility only.

- [ ] **Step 7: Verify and commit**

```bash
pnpm check:frontend-structure
pnpm --filter=@booking/dashboard lint
pnpm --filter=@booking/dashboard typecheck
pnpm --filter=@booking/dashboard build

git add apps/dashboard/app/constants/api-paths.ts \
  apps/dashboard/app/constants/paths.ts \
  apps/dashboard/app/routes.ts \
  apps/dashboard/app/routes/uploads.partner-documents.presign.tsx \
  apps/dashboard/app/features/partner/components/profile/profile-documents-card.tsx \
  apps/dashboard/app/features/partner/server/profile-actions.server.ts \
  apps/dashboard/app/routes/partner/profile.tsx \
  apps/dashboard/app/features/tenant/lib/partner-business-info.ts \
  apps/dashboard/app/routes/tenant/partners/detail.tsx \
  apps/dashboard/app/features/tenant/components/partners
git commit -m "fix(dashboard): consume private partner document grants"
```

Before staging the component directory, inspect the diff and stage only the specific modified files; never use `git add -A` or `git add .`.

---

### Task 7: Add idempotent legacy public-document migration

**Files:**
- Create: `apps/api/scripts/migrate-private-partner-documents.ts`
- Modify: `apps/api/package.json`

**Architecture:** The script imports `s3ConfigFromEnv()` and uses AWS SDK `S3Client`, `HeadObjectCommand`, `CopyObjectCommand`, and `DeleteObjectCommand` directly. It does **not** widen `StoragePort` for one-off operational migration semantics.

- [ ] **Step 1: Follow existing operational script lifecycle**

Mirror env loading, Prisma cleanup, logging, and exit codes from `bootstrap-storage.ts`, `check-rls.ts`, and tax scripts. Do not add a CLI dependency.

- [ ] **Step 2: Implement dry-run discovery**

Default mode and `--dry-run` perform no writes. Discover only these legacy fields:

```text
identityCardFrontUrl
identityCardBackUrl
businessLicenseFrontUrl
businessLicenseBackUrl
licenseDocs
```

Counters:

```text
eligible
external_url
missing
oversized
already_migrated
migrated
delete_pending
failed
```

- [ ] **Step 3: Restrict source objects to BookingOS public storage**

Resolve source keys only for URLs matching configured BookingOS public origin/bucket semantics. Never request an arbitrary external URL; report it as `external_url`.

- [ ] **Step 4: Copy to deterministic private destination**

Prefix:

```text
partner-documents/legacy/<partnerId>/
```

Filename is SHA-256 of normalized source key plus validated original image extension. Use `HeadObjectCommand` to enforce allowed image MIME and `ContentLength <= MAX_PARTNER_DOCUMENT_SIZE_BYTES`, then `CopyObjectCommand` public bucket -> private bucket.

- [ ] **Step 5: Update JSONB after successful copy**

Inside tenant-scoped DB access map exactly:

```text
identityCardFrontUrl -> identityCardFrontKey
identityCardBackUrl -> identityCardBackKey
businessLicenseFrontUrl -> businessLicenseFrontKey
businessLicenseBackUrl -> businessLicenseBackKey
licenseDocs[] -> licenseDocumentKeys[]
```

Preserve unrelated `businessInfo`. Existing matching canonical destination is idempotent success.

- [ ] **Step 6: Delete public source only after DB commit**

Use `DeleteObjectCommand` after DB success. A deletion failure records `delete_pending`; the next `--apply` retries deletion without duplicate copy/DB mutation. Do not log full URLs or private keys.

- [ ] **Step 7: Add package command and verify disposable idempotence**

```json
"migrate:partner-documents": "node --env-file-if-exists=../../.env ./node_modules/ts-node/dist/bin.js --transpile-only scripts/migrate-private-partner-documents.ts"
```

Disposable data contains one valid managed legacy object, one external URL, one oversized managed object, one missing managed object. Verify dry-run no-op, first apply migrates only valid object, second apply creates no duplicate changes.

- [ ] **Step 8: Commit**

```bash
git add apps/api/scripts/migrate-private-partner-documents.ts apps/api/package.json
git commit -m "feat(ops): add legacy partner document migration"
```

---

### Task 8: Run disposable end-to-end security/runtime smoke

**Files:**
- Create temporarily: `.github/workflows/sec-002-private-partner-documents-smoke.yml`
- Delete before final CI: same file
- No permanent test files

**Execution environment:** Use a temporary GitHub Actions workflow here because this session has no full local PostgreSQL/Redis/MinIO application stack. It must use disposable services only, never staging/production.

- [ ] **Step 1: Boot disposable PostgreSQL, Redis, MinIO; create distinct public/private buckets; migrate/generate/build; start required services.**

- [ ] **Step 2: Verify unauthenticated applicant presign -> 401; >5 MiB -> 400; valid grant has no `publicUrl`, has required headers, and applicant-owned prefix.**

- [ ] **Step 3: Verify exact-size PUT succeeds, different-size body against signed declared length fails, and second PUT to same write-once key fails.**

- [ ] **Step 4: Verify object exists only in private bucket and cannot be fetched from public bucket/origin.**

- [ ] **Step 5: User B attaching user A applicant key -> 400 `INVALID_PARTNER_DOCUMENT_REFERENCE` and no partner row; user A attaching own key succeeds.**

- [ ] **Step 6: Authorized tenant reviewer gets working short-lived grant; unauthorized/cross-tenant access fails; public partner endpoint exposes neither private keys nor grants.**

- [ ] **Step 7: Partner A uploads/attaches/reads own partner-scoped document; attaching partner B key -> 400.**

- [ ] **Step 8: Public partner logo upload still writes public bucket and serves public URL.**

- [ ] **Step 9: Seed legacy URL record; authorized read returns `legacy_public`; run migration; then read returns `private`, canonical DB key exists, and public original is gone.**

- [ ] **Step 10: Existing tax PDF presign/PUT with `content-type` + `if-none-match: *` still succeeds with exact signed length.**

- [ ] **Step 11: Remove temporary workflow/debug artifacts.**

- [ ] **Step 12: Record run ID, exact source SHA, and PASS/FAIL for all 16 spec acceptance cases without logging signed URLs/keys/secrets.**

---

### Task 9: Final verification and merge-readiness review

**Files:**
- No new product files expected
- Update stale comments/docs only when they describe behavior changed by Tasks 1-8

- [ ] **Step 1: Search stale semantics**

```bash
rg "partner-applications/presign|identityCardFrontUrl|identityCardBackUrl|businessLicenseFrontUrl|businessLicenseBackUrl|licenseDocs|no server-side cap exists yet" \
  apps packages docs TONG-QUAN.md
```

Every remaining hit must be deliberate legacy compatibility/migration or historical documentation; fix active new-write code/comments.

- [ ] **Step 2: Run full repository gates**

```bash
pnpm check:no-tests
pnpm check:module-cycles
pnpm --filter=@booking/api lint
pnpm --filter=@booking/api typecheck
pnpm --filter=@booking/api build
pnpm --filter=@booking/api check:rls
pnpm lint
pnpm typecheck
pnpm build
```

Normal CI must also pass storefront security, frontend structure, tenant-surface/theme, and every repository-required check.

- [ ] **Step 3: Review final diff**

Confirm no automated tests, no temporary workflow, no secrets/PII/signed URLs/private keys in committed artifacts, logo remains public, public partner contract remains private-data-free, and no new-write route accepts legacy sensitive URL fields.

- [ ] **Step 4: Review every approved spec section against the diff and fix any mismatch before readiness claim.**

- [ ] **Step 5: Run final normal CI on the exact final source-only head after all fixes and temporary-workflow deletion.**

- [ ] **Step 6: Create a PR only after separate explicit PR-creation authorization.**

Suggested title:

```text
fix(partner): keep verification documents private
```

PR body must state root cause, public-PII blocker, architecture, exact CI/runtime evidence, no deploy, and that operational privacy closure still requires the deployed-environment legacy audit/migration. Merge requires separate explicit authorization.
