# Private Partner Documents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make all new partner identity/legal documents authenticated, 5 MiB size-bound, write-once, private at rest, owner-scoped, and readable only through permission-gated short-lived grants while preserving public partner logos and legacy read compatibility.

**Architecture:** Keep S3/MinIO mechanics in the Storage module and move partner-document semantics into the Partner module. New sensitive uploads use canonical owner-scoped private keys, exact signed PUT headers, and `businessInfo` key fields; partner/tenant read endpoints resolve only keys already referenced by the partner and emit audited short-lived private GET grants. Storefront and dashboard use one shared private-document transport/component from `@booking/ui`, while an idempotent operational script remediates legacy public URLs.

**Tech Stack:** NestJS 11, Prisma 6/PostgreSQL/RLS, AWS SDK for JavaScript v3 S3 presigner, React Router 8 SSR, React 19, Zod contracts, MinIO-compatible disposable storage, pnpm/Turbo.

**Spec:** `docs/superpowers/specs/2026-08-21-private-partner-documents-design.md`

## Global Constraints

- ADR 0005 prohibits adding automated test files/runners (Jest/Vitest/Playwright). Verification uses repository static gates plus disposable runtime smoke.
- Maximum new partner-document size is exactly `5 * 1024 * 1024` bytes.
- Allowed partner-document MIME types are exactly `image/jpeg`, `image/png`, `image/webp`, `image/avif`, and `image/gif`; favicon ICO types remain excluded.
- New identity/legal documents go only to `S3_PRIVATE_BUCKET`; partner logos remain on the existing public upload path.
- New writes use only canonical `...Key` / `...Keys` fields. Legacy `...Url` and `licenseDocs` fields are read-only compatibility inputs.
- Applicant keys are scoped to `partner-documents/applicants/<userId>/...`; existing-partner keys are scoped to `partner-documents/partners/<partnerId>/...`.
- Private download URLs are short-lived and never persisted in `Partner.businessInfo` or returned from public partner APIs.
- Do not log presigned URLs, raw document bytes, identity numbers, or full private object keys.
- No Prisma schema migration is required; `businessInfo` remains JSONB.
- No deploy is part of implementation or review unless separately authorized.
- At execution time, create/use isolated branch `fix/sec-002-private-partner-documents` from the approved design branch head. If `main` moved, refresh the implementation branch against current `main` before product-code commits.

---

### Task 1: Contract the private-document protocol and enforce signed PUT headers

**Files:**
- Modify: `packages/contracts/src/contracts/partner.ts`
- Modify: `apps/api/src/modules/storage/infrastructure/services/s3-storage.service.ts`
- Verify unchanged compatibility: `apps/dashboard/app/features/tenant/components/finance/tax-document-upload-field.tsx`
- Verify unchanged compatibility: `apps/api/src/modules/finance/application/use-cases/create-tax-document-upload.use-case.ts`

**Interfaces:**
- Produces `partnerDocumentContentTypeSchema`, `PARTNER_DOCUMENT_UPLOAD_ACCEPT`, `MAX_PARTNER_DOCUMENT_SIZE_BYTES`, `partnerDocumentUploadInputSchema`, `privateDocumentUploadResponseSchema`, `partnerDocumentKindSchema`, `partnerDocumentReadItemSchema`, and `partnerDocumentReadListSchema` in `@booking/contracts`.
- Preserves `StoragePort.createPrivatePresignedUpload(CreateUploadInput)`.
- `S3StorageService.createUpload()` signs `content-type`, signs `content-length` when supplied, and signs `if-none-match` only for write-once grants.

- [ ] **Step 1: Add canonical upload contracts**

In `packages/contracts/src/contracts/partner.ts` add:

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

- [ ] **Step 2: Add tagged read contracts**

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

- [ ] **Step 3: Sign exact PUT headers in `S3StorageService`**

Replace the current `getSignedUrl()` options in `createUpload()` with:

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

Use `contentLength !== undefined`, not a truthy check.

- [ ] **Step 4: Confirm finance compatibility without changing finance**

`tax-document-upload-field.tsx` must still PUT with:

```ts
headers: { 'content-type': file.type, 'if-none-match': '*' }
```

`CreateTaxDocumentUploadUseCase` must still supply `contentLength: input.sizeBytes` and `writeOnce: true`. If either invariant has changed on the implementation branch, stop and reconcile before continuing; the expected current repository state already satisfies both.

- [ ] **Step 5: Run targeted verification**

```bash
pnpm --filter=@booking/contracts build
pnpm --filter=@booking/api typecheck
pnpm --filter=@booking/api build
```

Expected: exit 0.

- [ ] **Step 6: Commit Task 1**

```bash
git add packages/contracts/src/contracts/partner.ts \
  apps/api/src/modules/storage/infrastructure/services/s3-storage.service.ts
git commit -m "fix(storage): enforce signed partner upload headers"
```

---

### Task 2: Add canonical owner-scoped keys and private upload endpoints

**Files:**
- Create: `apps/api/src/modules/partner/domain/partner-document-key.ts`
- Create: `apps/api/src/modules/partner/application/use-cases/create-applicant-document-upload.use-case.ts`
- Create: `apps/api/src/modules/partner/application/use-cases/create-partner-document-upload.use-case.ts`
- Modify: `apps/api/src/modules/partner/infrastructure/http/dto/partner.dto.ts`
- Modify: `apps/api/src/modules/partner/infrastructure/http/partner-application.controller.ts`
- Modify: `apps/api/src/modules/partner/infrastructure/http/partner-profile.controller.ts`
- Modify: `apps/api/src/modules/partner/infrastructure/http/partner.module.ts`

**Interfaces:**
- Produces `applicantPartnerDocumentPrefix(userId)`, `partnerDocumentPrefix(partnerId)`, `isApplicantDocumentKeyForUser(userId, key)`, and `isPartnerDocumentKey(partnerId, key)`.
- Produces `CreateApplicantDocumentUploadUseCase.execute(userId, input)` and `CreatePartnerDocumentUploadUseCase.execute(partnerId, input)` returning `PrivateDocumentUploadResponse`.
- Adds `POST /partners/application-documents/presign` and `POST /partner/profile/documents/presign`.

- [ ] **Step 1: Define strict canonical key helpers**

Create `partner-document-key.ts`:

```ts
const DOCUMENT_FILE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:jpg|png|webp|avif|gif)$/;

export function applicantPartnerDocumentPrefix(userId: string): string {
  return `partner-documents/applicants/${userId}`;
}

export function partnerDocumentPrefix(partnerId: string): string {
  return `partner-documents/partners/${partnerId}`;
}

function belongsToPrefix(prefix: string, key: string): boolean {
  if (!key || key.includes('..') || key.startsWith('/') || key.includes('\\')) return false;
  const expected = `${prefix}/`;
  if (!key.startsWith(expected)) return false;
  return DOCUMENT_FILE.test(key.slice(expected.length));
}

export function isApplicantDocumentKeyForUser(userId: string, key: string): boolean {
  return belongsToPrefix(applicantPartnerDocumentPrefix(userId), key);
}

export function isPartnerDocumentKey(partnerId: string, key: string): boolean {
  return belongsToPrefix(partnerDocumentPrefix(partnerId), key);
}
```

This matches the current `randomUUID()` filename generation in `S3StorageService`; accept exactly one generated filename under the expected owner prefix.

- [ ] **Step 2: Add DTO wrappers**

In `partner.dto.ts`:

```ts
export class PartnerDocumentUploadDto extends createZodDto(partnerDocumentUploadInputSchema) {}
export class PrivateDocumentUploadResponseDto extends createZodDto(
  privateDocumentUploadResponseSchema,
) {}
```

- [ ] **Step 3: Implement applicant private presign**

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

- [ ] **Step 4: Implement existing-partner private presign**

Create `CreatePartnerDocumentUploadUseCase` with the same body, replacing the prefix with `partnerDocumentPrefix(partnerId)`.

- [ ] **Step 5: Add applicant endpoint**

In `PartnerApplicationController` add throttling imports and:

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

- [ ] **Step 6: Add existing-partner endpoint**

In `PartnerProfileController` add:

```ts
@RequirePermissions('partner.profile.manage')
@UseGuards(RequireCurrentAgreementGuard)
@Throttle(THROTTLE_UPLOAD)
@Post('documents/presign')
@HttpCode(200)
@ApiOkResponse({ type: PrivateDocumentUploadResponseDto })
async presignDocument(
  @Body() input: PartnerDocumentUploadDto,
): Promise<PrivateDocumentUploadResponse> {
  return this.createPartnerDocumentUpload.execute(
    this.tenantContext.partnerIdOrThrow(),
    input,
  );
}
```

- [ ] **Step 7: Register providers and run API gates**

Add both use cases to `PartnerModule.providers`, then run:

```bash
pnpm check:module-cycles
pnpm --filter=@booking/api lint
pnpm --filter=@booking/api typecheck
pnpm --filter=@booking/api build
```

Expected: exit 0.

- [ ] **Step 8: Commit Task 2**

```bash
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

**Interfaces:**
- `partnerRegistrationSchema` and `partnerOnboardingProfileSchema` both use `...Key` names for sensitive documents.
- `updatePartnerDocumentsInputSchema` accepts `{ logoUrl?: string; licenseDocumentKeys?: string[] }`.
- Produces `InvalidPartnerDocumentReference` with code `INVALID_PARTNER_DOCUMENT_REFERENCE`, HTTP 400.
- New writes reject legacy sensitive URL fields.

- [ ] **Step 1: Rename sensitive fields in both registration contracts**

In both `partnerRegistrationSchema` and `partnerOnboardingProfileSchema`, replace:

```text
businessLicenseFrontUrl -> businessLicenseFrontKey
businessLicenseBackUrl -> businessLicenseBackKey
identityCardFrontUrl -> identityCardFrontKey
identityCardBackUrl -> identityCardBackKey
```

Use `z.string().min(1)` instead of URL validation for the key fields. Update every `superRefine` path/message reference to the new names.

Change `updatePartnerDocumentsInputSchema` to:

```ts
export const updatePartnerDocumentsInputSchema = z.object({
  logoUrl: z.string().url().or(z.literal('')).optional(),
  licenseDocumentKeys: z.array(z.string().min(1)).max(20).optional(),
});
```

- [ ] **Step 2: Add stable invalid-reference error**

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

Do not include the rejected key in the message.

- [ ] **Step 3: Add businessInfo validation helpers**

Create `partner-document-business-info.ts`:

```ts
const LEGACY_SENSITIVE_FIELDS = [
  'identityCardFrontUrl',
  'identityCardBackUrl',
  'businessLicenseFrontUrl',
  'businessLicenseBackUrl',
  'licenseDocs',
] as const;

export function assertApplicantDocumentReferences(
  userId: string,
  businessInfo: Record<string, unknown>,
): void {
  if (LEGACY_SENSITIVE_FIELDS.some((field) => businessInfo[field] !== undefined)) {
    throw new InvalidPartnerDocumentReference();
  }
  for (const field of [
    'identityCardFrontKey',
    'identityCardBackKey',
    'businessLicenseFrontKey',
    'businessLicenseBackKey',
  ] as const) {
    const value = businessInfo[field];
    if (
      value !== undefined &&
      (typeof value !== 'string' || !isApplicantDocumentKeyForUser(userId, value))
    ) {
      throw new InvalidPartnerDocumentReference();
    }
  }
}

export function assertPartnerDocumentReferences(
  partnerId: string,
  keys: readonly string[],
): void {
  if (!keys.every((key) => isPartnerDocumentKey(partnerId, key))) {
    throw new InvalidPartnerDocumentReference();
  }
}
```

- [ ] **Step 4: Enforce applicant ownership before persistence**

In `ApplyAsPartnerUseCase.execute()` before the tenant transaction:

```ts
const businessInfo = input.businessInfo ?? {};
assertApplicantDocumentReferences(userId, businessInfo);
```

Pass this validated `businessInfo` to `Partner.apply()`.

- [ ] **Step 5: Change the aggregate's document merge intent**

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

Do not delete legacy fields here; Task 7 migration owns cleanup.

- [ ] **Step 6: Enforce existing-partner ownership**

In `UpdatePartnerDocumentsUseCase.execute()` validate `input.licenseDocumentKeys ?? []` with `assertPartnerDocumentReferences(partnerId, ...)` before `mergeDocuments()`.

- [ ] **Step 7: Delete the anonymous partner-document presign route**

Remove `presignPartnerApplication()` from `UploadController` and its unused `@Public()` import. Keep authenticated generic `POST /uploads/presign` unchanged for public media/logo uploads.

- [ ] **Step 8: Run static verification**

```bash
pnpm check:no-tests
pnpm check:module-cycles
pnpm --filter=@booking/contracts build
pnpm --filter=@booking/api lint
pnpm --filter=@booking/api typecheck
pnpm --filter=@booking/api build
```

API/contracts must be green. Frontend typecheck is expected to remain red until Tasks 5-6 consume the renamed contract.

- [ ] **Step 9: Commit Task 3**

```bash
git add packages/contracts/src/contracts/partner.ts \
  apps/api/src/modules/partner/domain/errors/partner-errors.ts \
  apps/api/src/modules/partner/domain/partner-document-business-info.ts \
  apps/api/src/modules/partner/domain/entities/partner.entity.ts \
  apps/api/src/modules/partner/application/use-cases/apply-as-partner.use-case.ts \
  apps/api/src/modules/partner/application/use-cases/update-partner-documents.use-case.ts \
  apps/api/src/modules/storage/infrastructure/http/upload.controller.ts
git commit -m "fix(partner): persist sensitive documents as private keys"
```

---

### Task 4: Add audited permission-gated private document reads

**Files:**
- Extend: `apps/api/src/modules/partner/domain/partner-document-business-info.ts`
- Create: `apps/api/src/modules/partner/application/use-cases/list-partner-documents.use-case.ts`
- Modify: `apps/api/src/modules/partner/infrastructure/http/dto/partner.dto.ts`
- Modify: `apps/api/src/modules/partner/infrastructure/http/partner-profile.controller.ts`
- Modify: `apps/api/src/modules/partner/infrastructure/http/tenant-partner.controller.ts`
- Modify: `apps/api/src/modules/partner/infrastructure/http/partner.module.ts`

**Interfaces:**
- Produces `collectPartnerDocumentReferences(businessInfo)`.
- Produces `ListPartnerDocumentsUseCase.execute(tenantId, partnerId, viewer)` returning `PartnerDocumentReadItem[]`.
- Adds `GET /partner/profile/documents` and `GET /tenant/partners/:id/documents`.

- [ ] **Step 1: Add deterministic reference collection**

Extend `partner-document-business-info.ts` so canonical fields map to kinds:

```text
identityCardFrontKey -> identity_card_front
identityCardBackKey -> identity_card_back
businessLicenseFrontKey -> business_license_front
businessLicenseBackKey -> business_license_back
licenseDocumentKeys[] -> license_document
```

Legacy compatibility maps:

```text
identityCardFrontUrl -> identity_card_front
identityCardBackUrl -> identity_card_back
businessLicenseFrontUrl -> business_license_front
businessLicenseBackUrl -> business_license_back
licenseDocs[] -> license_document
```

Return only valid non-empty strings; preserve array order. Private refs use `{ storage: 'private', kind, key }`, legacy refs use `{ storage: 'legacy_public', kind, url }` internally before signing.

- [ ] **Step 2: Implement audit-before-grant read use case**

Use this interface:

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

Inside `tenantDb.forTenant(tenantId, ...)`:
1. load partner by ID;
2. throw `PartnerNotFound` if absent;
3. collect refs;
4. write one audit event with action `partner.private_documents.self_view_requested` for partner viewers or `partner.private_documents.view_requested` for tenant viewers;
5. audit data is exactly `{ partnerId, documentCount: refs.length, viewerType: viewer.actorType }`.

After the transaction, sign only collected private keys via `createPrivatePresignedDownload({ key })`; pass legacy URLs through as `storage: 'legacy_public'` descriptors. The caller never supplies a key.

- [ ] **Step 3: Add read DTO**

Add `PartnerDocumentReadItemDto extends createZodDto(partnerDocumentReadItemSchema)`.

- [ ] **Step 4: Add partner self-read route**

```ts
@RequirePermissions('partner.profile.manage')
@Get('documents')
@ApiOkResponse({ type: PartnerDocumentReadItemDto, isArray: true })
async documents(
  @CurrentPrincipal() principal: SessionPrincipal,
): Promise<PartnerDocumentReadItem[]> {
  return this.listPartnerDocuments.execute(
    this.tenantContext.tenantIdOrThrow(),
    this.tenantContext.partnerIdOrThrow(),
    { actorType: 'partner', actorId: principal.userId },
  );
}
```

Do not add `RequireCurrentAgreementGuard` to this read route.

- [ ] **Step 5: Add tenant review route**

```ts
@RequirePermissions('tenant.partners.read')
@Get(':id/documents')
@UuidParam()
@ApiOkResponse({ type: PartnerDocumentReadItemDto, isArray: true })
async documents(
  @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
  @CurrentPrincipal() principal: SessionPrincipal,
): Promise<PartnerDocumentReadItem[]> {
  return this.listPartnerDocuments.execute(
    this.tenantContext.tenantIdOrThrow(),
    id,
    { actorType: 'tenant', actorId: principal.userId },
  );
}
```

- [ ] **Step 6: Register provider and run API/RLS gates**

```bash
pnpm check:module-cycles
pnpm --filter=@booking/api lint
pnpm --filter=@booking/api typecheck
pnpm --filter=@booking/api build
pnpm --filter=@booking/api check:rls
```

Expected: exit 0.

- [ ] **Step 7: Commit Task 4**

```bash
git add apps/api/src/modules/partner/domain/partner-document-business-info.ts \
  apps/api/src/modules/partner/application/use-cases/list-partner-documents.use-case.ts \
  apps/api/src/modules/partner/infrastructure/http/dto/partner.dto.ts \
  apps/api/src/modules/partner/infrastructure/http/partner-profile.controller.ts \
  apps/api/src/modules/partner/infrastructure/http/tenant-partner.controller.ts \
  apps/api/src/modules/partner/infrastructure/http/partner.module.ts
git commit -m "feat(partner): gate private document reads"
```

---

### Task 5: Add one shared private-document uploader and move storefront onboarding to it

**Files:**
- Modify: `packages/ui/src/lib/upload.ts`
- Create: `packages/ui/src/components/form/private-document-upload.tsx`
- Modify: `packages/ui/src/components/form/types.ts`
- Modify: `packages/ui/src/components/form/field-renderer.tsx`
- Modify: `apps/storefront/app/constants/api-paths.ts`
- Modify: `apps/storefront/app/constants/paths.ts`
- Modify: `apps/storefront/app/routes.ts`
- Modify: `apps/storefront/app/features/storage/server/partner-upload-presign-route.server.ts`
- Replace route module: `apps/storefront/app/routes/uploads.presign.tsx` only if it is currently dedicated to onboarding; otherwise create `apps/storefront/app/routes/uploads.partner-documents.presign.tsx` and keep generic `/uploads/presign` intact.
- Modify: `apps/storefront/app/features/partner-onboarding/components/partner-profile-fields.tsx`
- Modify: `apps/storefront/app/features/partner-onboarding/server/partner-onboarding-domain.ts`

**Interfaces:**
- `@booking/ui/lib/upload.ts` produces `presignAndPutPrivateDocument(file, options): Promise<{ key: string }>` without depending on `@booking/contracts`.
- `PrivateDocumentUpload` is a shared controlled component that stores opaque keys and uses a transient `URL.createObjectURL(file)` preview only while mounted.
- `FileFieldConfig` gains `uploadMode?: 'public-image' | 'private-document'`, defaulting to `public-image`.
- Storefront private same-origin route is `/uploads/partner-documents/presign`; backend is `/partners/application-documents/presign`.

- [ ] **Step 1: Add shared private transport to `@booking/ui/lib/upload.ts`**

Mirror the response shape locally so `@booking/ui` stays self-contained:

```ts
interface PrivateDocumentPresignGrant {
  uploadUrl: string;
  key: string;
  expiresInSec: number;
  requiredHeaders: {
    'content-type': string;
    'if-none-match': '*';
  };
}

export async function presignAndPutPrivateDocument(
  file: File,
  {
    presignEndpoint,
    signal,
  }: { presignEndpoint: string; signal?: AbortSignal },
): Promise<{ key: string }> {
  const presignRes = await fetch(presignEndpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ contentType: file.type, sizeBytes: file.size }),
    signal,
  });
  if (!presignRes.ok) throw new Error((await safeMessage(presignRes)) ?? 'Không thể tạo liên kết tải lên');
  const grant = await readPrivateDocumentGrant(presignRes);
  const putRes = await fetch(grant.uploadUrl, {
    method: 'PUT',
    headers: grant.requiredHeaders,
    body: file,
    signal,
  });
  if (!putRes.ok) throw new Error(`Tải tệp lên thất bại (${putRes.status})`);
  return { key: grant.key };
}
```

`readPrivateDocumentGrant()` must validate non-empty `uploadUrl`/`key`, positive finite `expiresInSec`, matching non-empty `content-type`, and literal `if-none-match === '*'`.

- [ ] **Step 2: Add controlled `PrivateDocumentUpload` component**

Create `packages/ui/src/components/form/private-document-upload.tsx` with props:

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

Behavior:
- reject MIME not in `accept`;
- reject `file.size <= 0` or `file.size > maxSizeMb * 1024 * 1024`;
- call `presignAndPutPrivateDocument()`;
- persist only returned `key` through `onChange`;
- show a local object URL preview while mounted, revoke the old URL on replacement/unmount;
- if a persisted key exists but no local preview exists, show a neutral “Tài liệu đã tải lên” state rather than trying to resolve the key publicly.

- [ ] **Step 3: Wire private mode into `FieldRenderer`**

In `FileFieldConfig` add:

```ts
uploadMode?: 'public-image' | 'private-document';
```

In `FieldRenderer`, when `field.uploadMode === 'private-document'`, render `PrivateDocumentUpload` and require `field.presignEndpoint`; otherwise render existing `ImageUpload` unchanged. Do not add auth/business semantics to `ImageUpload`.

- [ ] **Step 4: Add storefront path constants**

In `api-paths.ts`:

```ts
partner: {
  apply: '/partners/apply',
  applicationDocumentPresign: '/partners/application-documents/presign',
},
```

Remove the old `/uploads/partner-applications/presign` constant.

In `paths.ts` add:

```ts
partnerDocumentUploadPresign: '/uploads/partner-documents/presign',
```

- [ ] **Step 5: Make the storefront BFF authenticated and phase-aware**

Refactor `partner-upload-presign-route.server.ts` so its handler:
1. calls `requirePartnerPhase(request, 'partner_registration_profile', locale)` using the existing onboarding flow conventions;
2. obtains the current session with `requireAuth(...)`;
3. body-limits with `MAX_PRESIGN_REQUEST_BYTES`;
4. parses `partnerDocumentUploadInputSchema`;
5. calls authenticated `apiPost<PrivateDocumentUploadResponse>` with `auth.session.accessToken` to `apiPaths.partner.applicationDocumentPresign` and validates `privateDocumentUploadResponseSchema`;
6. validates returned `uploadUrl` with `allowedStorageUploadUrl()`;
7. returns the private grant with no `publicUrl`.

Do not use `publicPost`.

- [ ] **Step 6: Register a dedicated same-origin resource route**

Create `routes/uploads.partner-documents.presign.tsx` as a thin action calling the handler and register:

```ts
route('uploads/partner-documents/presign', 'routes/uploads.partner-documents.presign.tsx'),
```

Keep existing generic `/uploads/presign` for public media.

- [ ] **Step 7: Change onboarding fields and payload mapping**

In `partner-profile-fields.tsx`, use:

```text
businessLicenseFrontKey
businessLicenseBackKey
identityCardFrontKey
identityCardBackKey
```

Set each document field to:

```ts
uploadMode: 'private-document',
presignEndpoint: storefrontPaths.partnerDocumentUploadPresign,
accept: PARTNER_DOCUMENT_UPLOAD_ACCEPT,
maxSizeMb: MAX_PARTNER_DOCUMENT_SIZE_BYTES / (1024 * 1024),
variant: 'document',
```

In `partner-onboarding-domain.ts`, write the same `...Key` names into `businessInfo`; emit no legacy sensitive URL fields.

- [ ] **Step 8: Run UI/storefront gates**

```bash
pnpm --filter=@booking/ui lint
pnpm --filter=@booking/ui typecheck
pnpm check:frontend-structure
pnpm --filter=@booking/storefront security
pnpm --filter=@booking/storefront lint
pnpm --filter=@booking/storefront typecheck
pnpm --filter=@booking/storefront build
```

Expected: exit 0.

- [ ] **Step 9: Commit Task 5**

Stage only Task 5 files and commit:

```bash
git commit -m "fix(storefront): upload partner documents privately"
```

---

### Task 6: Split dashboard logo/public media from private legal documents

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
- Modify: tenant partner document display component(s) currently fed from `identityPhotos` / `licensePhotos`.

**Interfaces:**
- Dashboard private same-origin route proxies to `POST /partner/profile/documents/presign`.
- Partner profile loader consumes `GET /partner/profile/documents`.
- Tenant detail loader consumes `GET /tenant/partners/:id/documents`.
- Logo remains on existing generic public `/uploads/presign`.

- [ ] **Step 1: Add unambiguous dashboard API constants**

Add:

```ts
partner: {
  ...,
  profileDocumentPresign: partnerPath('/profile/documents/presign'),
  profileDocumentList: partnerPath('/profile/documents'),
},
tenant: {
  ...,
  partnerDocuments: (partnerId: string) => tenantPath(`/partners/${segment(partnerId)}/documents`),
},
```

Keep the existing PATCH constant for `/partner/profile/documents` under its current name or rename it to `profileDocumentsPatch`; GET and PATCH call sites must be distinguishable by constant name.

- [ ] **Step 2: Add same-origin private-presign route**

Create `routes/uploads.partner-documents.presign.tsx`. Its action calls `requirePartner(request)`, parses `partnerDocumentUploadInputSchema`, posts to `apiPaths.partner.profileDocumentPresign`, validates `privateDocumentUploadResponseSchema`, and returns the grant.

Register a dashboard route such as:

```ts
route('uploads/partner-documents/presign', 'routes/uploads.partner-documents.presign.tsx'),
```

and add the matching `dashboardPaths` constant used by the component.

- [ ] **Step 3: Split partner document card**

In `ProfileDocumentsCard`:
- keep `logoUrl` in the existing generic `FileFieldConfig` with `target: 'partners'`;
- replace the `licenseDocs` public file field with shared `PrivateDocumentUpload`;
- submit newly uploaded private keys as `licenseDocumentKeys`;
- display existing `PartnerDocumentReadItem[]` from loader data: `downloadUrl` for `private`, `url` for `legacy_public`;
- never persist either display URL.

- [ ] **Step 4: Update append/delete actions to canonical keys**

In `profile-actions.server.ts`:
- parse `licenseDocumentKeys` from `updatePartnerDocumentsInputSchema`;
- append to existing `businessInfo.licenseDocumentKeys`, cap at 20;
- for private deletion, post a hidden opaque `key` and filter only canonical `licenseDocumentKeys`;
- keep legacy URL deletion as compatibility-only behavior using legacy `licenseDocs` until Task 7 removes those fields from deployed data.

- [ ] **Step 5: Load partner self-read descriptors**

In `routes/partner/profile.tsx`, fetch `PartnerDocumentReadItem[]` from `apiPaths.partner.profileDocumentList` in the existing loader parallelism. Pass descriptors to `ProfileDocumentsCard`. A document-list failure should degrade only the document section; do not fail the core profile load.

- [ ] **Step 6: Load tenant review descriptors**

In `routes/tenant/partners/detail.tsx`, fetch `PartnerDocumentReadItem[]` from `apiPaths.tenant.partnerDocuments(params.partnerId)` under existing `tenant.partners.read` auth and pass them to the identity/legal cards.

Refactor `partner-business-info.ts` so it reads non-document legal text/logo only. Sensitive document display must come from the gated document endpoint, not direct raw `businessInfo` URLs.

- [ ] **Step 7: Run dashboard gates**

```bash
pnpm check:frontend-structure
pnpm --filter=@booking/dashboard lint
pnpm --filter=@booking/dashboard typecheck
pnpm --filter=@booking/dashboard build
```

Expected: exit 0.

- [ ] **Step 8: Commit Task 6**

Stage only dashboard files touched by this task and commit:

```bash
git commit -m "fix(dashboard): consume private partner document grants"
```

---

### Task 7: Add idempotent legacy public-document remediation tooling

**Files:**
- Create: `apps/api/scripts/migrate-private-partner-documents.ts`
- Modify: `apps/api/package.json`

**Interfaces:**
- Adds `pnpm --filter=@booking/api migrate:partner-documents -- --dry-run` and `--apply`.
- Script imports `s3ConfigFromEnv()` and uses AWS SDK commands directly for operational copy/head/delete; it does not widen `StoragePort`.
- It never fetches arbitrary external URLs.

- [ ] **Step 1: Follow existing script lifecycle conventions**

Mirror env/exit/Prisma cleanup style from `apps/api/scripts/bootstrap-storage.ts`, `check-rls.ts`, and tax operational scripts. Do not add a CLI dependency.

- [ ] **Step 2: Build dry-run discovery**

Enumerate partner rows whose `businessInfo` contains any legacy field:

```text
identityCardFrontUrl
identityCardBackUrl
businessLicenseFrontUrl
businessLicenseBackUrl
licenseDocs
```

Default invocation and explicit `--dry-run` both perform no writes. Count only:

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

- [ ] **Step 3: Restrict source URL resolution to BookingOS storage origin**

Use configured `S3_PUBLIC_URL` plus `S3_BUCKET`/endpoint semantics to resolve a source key only when the legacy URL belongs to BookingOS-managed public storage. External URLs are reported `external_url` and never requested.

- [ ] **Step 4: Use deterministic private destination keys**

Destination prefix:

```text
partner-documents/legacy/<partnerId>/
```

Filename: SHA-256 hex digest of the normalized source object key plus the validated original image extension. This guarantees reruns choose the same destination.

Use AWS SDK `HeadObjectCommand` to verify source existence, allowed image content type, and `ContentLength <= MAX_PARTNER_DOCUMENT_SIZE_BYTES`; use `CopyObjectCommand` to copy from public bucket to private bucket.

- [ ] **Step 5: Update JSONB through tenant-scoped DB access**

After a successful copy, update only that partner's `businessInfo` canonical field inside the normal tenant-scoped DB transaction. Preserve unrelated fields. If the canonical key already matches the deterministic destination, treat it as idempotent success.

Legacy mapping is exact:

```text
identityCardFrontUrl -> identityCardFrontKey
identityCardBackUrl -> identityCardBackKey
businessLicenseFrontUrl -> businessLicenseFrontKey
businessLicenseBackUrl -> businessLicenseBackKey
licenseDocs[] -> licenseDocumentKeys[]
```

- [ ] **Step 6: Delete public source only after DB commit**

Use `DeleteObjectCommand` on the public bucket after the DB update commits. On deletion failure, report `delete_pending`; a subsequent `--apply` must detect canonical DB state and retry source deletion without recopying or corrupting keys.

Do not log full source URLs, destination keys, or document bytes.

- [ ] **Step 7: Add package script**

```json
"migrate:partner-documents": "node --env-file-if-exists=../../.env ./node_modules/ts-node/dist/bin.js --transpile-only scripts/migrate-private-partner-documents.ts"
```

- [ ] **Step 8: Verify dry-run/apply/idempotence on disposable data**

Disposable data must contain exactly these categories: one valid BookingOS legacy image, one external URL, one oversized BookingOS object, one missing BookingOS object. Verify:
1. dry-run changes nothing;
2. first `--apply` migrates only the valid object;
3. canonical DB key exists and public source is deleted;
4. second `--apply` produces no duplicate object/key changes.

- [ ] **Step 9: Commit Task 7**

```bash
git add apps/api/scripts/migrate-private-partner-documents.ts apps/api/package.json
git commit -m "feat(ops): add legacy partner document migration"
```

---

### Task 8: Run disposable end-to-end security/runtime smoke

**Files:**
- Create temporarily: `.github/workflows/sec-002-private-partner-documents-smoke.yml`
- Delete before final CI: `.github/workflows/sec-002-private-partner-documents-smoke.yml`
- No permanent test files.

**Interfaces:**
- In this execution environment, use a temporary GitHub Actions workflow because the working session does not have the full local service stack.
- Workflow uses disposable PostgreSQL, Redis, and MinIO/S3-compatible buckets only.
- It verifies all 16 acceptance cases from the approved spec.

- [ ] **Step 1: Create disposable services and build the app**

The temporary workflow starts PostgreSQL, Redis, and MinIO; creates distinct public/private buckets; runs Prisma migrate/generate; builds contracts/API/frontends as needed; boots API/storefront/dashboard only against disposable services.

- [ ] **Step 2: Verify auth and size rejection**

Assert:
1. unauthenticated applicant presign -> 401;
2. authenticated `sizeBytes = 5 * 1024 * 1024 + 1` -> 400;
3. valid grant has no `publicUrl`, includes required headers, and key starts with the caller's applicant prefix.

- [ ] **Step 3: Verify exact signed length and write-once**

Assert:
1. exact-size PUT with returned headers succeeds;
2. fresh grant declared for one byte length rejects a body of a different length;
3. second PUT to an already-created key using the same write-once grant fails.

Log status/error code only, never the presigned URL.

- [ ] **Step 4: Verify private bucket isolation**

Confirm object exists in private bucket and the equivalent public bucket/public origin cannot return it.

- [ ] **Step 5: Verify applicant ownership**

User A uploads. User B applies with A's key -> 400 `INVALID_PARTNER_DOCUMENT_REFERENCE` and no partner row. User A applies with A's key -> canonical key persisted.

- [ ] **Step 6: Verify tenant and public read boundaries**

Assert:
- authorized tenant reviewer obtains working short-lived private grant;
- unauthorized caller cannot obtain it;
- cross-tenant partner lookup remains blocked by existing RLS/not-found behavior;
- public partner endpoint exposes neither private keys nor private grants.

- [ ] **Step 7: Verify partner self-service ownership**

Partner A uploads/attaches/reads own private document. Attaching Partner B's key -> 400.

- [ ] **Step 8: Verify public logo regression**

Existing generic partner logo upload still returns a public URL and writes to the public bucket.

- [ ] **Step 9: Verify legacy compatibility and migration**

Seed one legacy URL record. Before migration, authorized read returns `storage: 'legacy_public'`. Run disposable migration; afterward read returns `storage: 'private'`, canonical DB key exists, and public source is gone.

- [ ] **Step 10: Verify finance regression**

Run existing tax PDF presign/PUT flow with `content-type` and `if-none-match: *`; exact-length upload must still succeed under the new generic signed-header behavior.

- [ ] **Step 11: Remove temporary workflow**

Delete the smoke workflow and verify final diff contains no temporary fault-injection/debug artifacts.

- [ ] **Step 12: Record evidence**

Record workflow run ID, exact source head SHA, and PASS/FAIL for each acceptance case for the PR body. Do not record secrets, private keys, or presigned URLs.

---

### Task 9: Run final repository gates and prepare a reviewable source-only head

**Files:**
- No new product files expected.
- Update stale docs/comments only where they incorrectly describe current behavior after Tasks 1-8.

**Interfaces:**
- Produces a source-only head with all static/CI gates green and runtime evidence already captured.

- [ ] **Step 1: Search for stale public-document semantics**

```bash
rg "partner-applications/presign|identityCardFrontUrl|identityCardBackUrl|businessLicenseFrontUrl|businessLicenseBackUrl|licenseDocs|no server-side cap exists yet" \
  apps packages docs TONG-QUAN.md
```

Every remaining hit must be classified as deliberate legacy compatibility/migration code or historical documentation. Fix any active new-write code/comment that still treats sensitive partner documents as public URLs.

- [ ] **Step 2: Run full required verification**

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

Also require normal CI's storefront security, frontend-structure, tenant-surface/theme, and other repository checks to pass.

- [ ] **Step 3: Review final diff for security/scope**

Confirm:
- no automated test files/runners added;
- no temporary workflow remains;
- no credentials, real PII, presigned URLs, or full private keys committed;
- logo upload remains public;
- public partner contracts expose no `businessInfo`, private key, or private grant;
- no new-write route accepts legacy sensitive URL fields.

- [ ] **Step 4: Review against every spec section**

Check private storage, signed MIME/length/write-once, owner-scoped attach, partner/tenant authorization, audit logging, storefront/dashboard behavior, legacy migration, and completion criteria. Fix every mismatch before readiness claim.

- [ ] **Step 5: Run final normal CI on the exact final source-only head**

Do not rely on a green run from before temporary workflow deletion or review fixes.

- [ ] **Step 6: Prepare PR only after separate explicit PR-creation authorization**

Suggested title:

```text
fix(partner): keep verification documents private
```

PR body includes root cause, public-PII blocker, architecture summary, exact CI/runtime evidence, no-deploy statement, and the operational caveat that privacy closure requires the deployed-environment legacy audit/migration.

Do not merge without separate explicit merge authorization.
