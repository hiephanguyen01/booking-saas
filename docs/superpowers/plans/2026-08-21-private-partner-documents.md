# Private Partner Documents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make all new partner identity/legal documents authenticated, 5 MiB size-bound, write-once, private at rest, owner-scoped, and readable only through permission-gated short-lived grants while preserving public partner logos and legacy read compatibility.

**Architecture:** Keep S3/MinIO mechanics in the Storage module and move partner-document semantics into the Partner module. New sensitive uploads use canonical owner-scoped private keys, exact signed PUT headers, and `businessInfo` key fields; partner/tenant read endpoints resolve only keys already referenced by the partner and emit audited short-lived private GET grants. Storefront and dashboard use purpose-built private-document transport, while a separate idempotent operational script remediates legacy public URLs.

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
- At execution time, create/use an isolated implementation branch/worktree named `fix/sec-002-private-partner-documents` from the approved design branch head; refresh against `main` first if `main` has moved.

---

### Task 1: Contract the private-document protocol and enforce signed PUT headers

**Files:**
- Modify: `packages/contracts/src/contracts/partner.ts`
- Modify: `apps/api/src/modules/storage/infrastructure/services/s3-storage.service.ts`
- Verify compatibility: `apps/dashboard/app/features/tenant/components/finance/tax-document-upload-field.tsx`
- Verify compatibility: `apps/api/src/modules/finance/application/use-cases/create-tax-document-upload.use-case.ts`

**Interfaces:**
- Produces `partnerDocumentContentTypeSchema`, `PARTNER_DOCUMENT_UPLOAD_ACCEPT`, `MAX_PARTNER_DOCUMENT_SIZE_BYTES`, `partnerDocumentUploadInputSchema`, `privateDocumentUploadResponseSchema`, `partnerDocumentKindSchema`, and `partnerDocumentReadItemSchema` in `@booking/contracts`.
- Preserves existing `StoragePort.createPrivatePresignedUpload(CreateUploadInput)` signature.
- Changes `S3StorageService.createUpload()` so a provided `contentLength` is signed as `content-length`, `content-type` is signed, and `if-none-match` is signed only when `writeOnce === true`.

- [ ] **Step 1: Add the canonical partner-document upload contract**

In `packages/contracts/src/contracts/partner.ts`, add these definitions near the partner document inputs:

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

- [ ] **Step 2: Add the tagged private/legacy document-read contract**

In the same file add:

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

- [ ] **Step 3: Make signed-header intent explicit in the S3 adapter**

In `S3StorageService.createUpload()`, construct the signable set from the actual command inputs:

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

Do not use a truthy check for `contentLength`; valid callers already reject zero, and `!== undefined` accurately reflects whether the caller requested a signed length.

- [ ] **Step 4: Verify the finance write-once client already sends the headers this change will sign**

Read `apps/dashboard/app/features/tenant/components/finance/tax-document-upload-field.tsx` and confirm its PUT still sends:

```ts
headers: { 'content-type': file.type, 'if-none-match': '*' }
```

Do not change finance unless this invariant has drifted. The tax use case already supplies both `contentLength` and `writeOnce: true`.

- [ ] **Step 5: Run targeted static verification**

Run:

```bash
pnpm --filter=@booking/contracts build
pnpm --filter=@booking/api typecheck
pnpm --filter=@booking/api build
```

Expected: all commands exit 0; no contract or AWS SDK type errors.

- [ ] **Step 6: Commit Task 1**

Stage only the confirmed Task 1 files and commit:

```bash
git add packages/contracts/src/contracts/partner.ts \
  apps/api/src/modules/storage/infrastructure/services/s3-storage.service.ts
git commit -m "fix(storage): enforce signed partner upload headers"
```

---

### Task 2: Add canonical partner-document keys and private upload endpoints

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
- Adds authenticated API endpoints `POST /partners/application-documents/presign` and `POST /partner/profile/documents/presign`.

- [ ] **Step 1: Define canonical key helpers**

Create `partner-document-key.ts` with owner-scoped prefix builders and strict generated-key validation:

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

Use the repository's actual UUID format if source inspection shows generated keys differ; preserve the invariant that only exactly one generated filename under the expected owner prefix is accepted.

- [ ] **Step 2: Add DTOs for the dedicated upload contract**

In `partner.dto.ts`, add Zod DTO wrappers for `partnerDocumentUploadInputSchema` and `privateDocumentUploadResponseSchema`:

```ts
export class PartnerDocumentUploadDto extends createZodDto(partnerDocumentUploadInputSchema) {}
export class PrivateDocumentUploadResponseDto extends createZodDto(
  privateDocumentUploadResponseSchema,
) {}
```

- [ ] **Step 3: Implement applicant private presign**

Create `CreateApplicantDocumentUploadUseCase`:

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

Create `CreatePartnerDocumentUploadUseCase` with the same response shape, using `partnerDocumentPrefix(partnerId)`.

- [ ] **Step 5: Add the authenticated applicant endpoint**

In `PartnerApplicationController`, inject `CreateApplicantDocumentUploadUseCase` and add:

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

Import `Throttle`, `THROTTLE_UPLOAD`, `HttpCode`, and the contract response type using existing repository conventions.

- [ ] **Step 6: Add the partner-profile private endpoint**

In `PartnerProfileController`, inject `CreatePartnerDocumentUploadUseCase` and add:

```ts
@RequirePermissions('partner.profile.manage')
@UseGuards(RequireCurrentAgreementGuard)
@Throttle(THROTTLE_UPLOAD)
@Post('documents/presign')
@HttpCode(200)
@ApiOkResponse({ type: PrivateDocumentUploadResponseDto })
async presignDocument(@Body() input: PartnerDocumentUploadDto): Promise<PrivateDocumentUploadResponse> {
  return this.createPartnerDocumentUpload.execute(
    this.tenantContext.partnerIdOrThrow(),
    input,
  );
}
```

- [ ] **Step 7: Register both use cases in `PartnerModule`**

Add both classes to `providers`; do not import Storage module directly because `StorageModule` is already global and exports `STORAGE_PORT`.

- [ ] **Step 8: Run targeted API verification**

Run:

```bash
pnpm check:module-cycles
pnpm --filter=@booking/api lint
pnpm --filter=@booking/api typecheck
pnpm --filter=@booking/api build
```

Expected: exit 0.

- [ ] **Step 9: Commit Task 2**

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

### Task 3: Make canonical keys the only new sensitive-document persistence format

**Files:**
- Modify: `packages/contracts/src/contracts/partner.ts`
- Modify: `apps/api/src/modules/partner/domain/errors/partner-errors.ts`
- Modify: `apps/api/src/modules/partner/domain/entities/partner.entity.ts`
- Modify: `apps/api/src/modules/partner/application/use-cases/apply-as-partner.use-case.ts`
- Modify: `apps/api/src/modules/partner/application/use-cases/update-partner-documents.use-case.ts`
- Create: `apps/api/src/modules/partner/domain/partner-document-business-info.ts`
- Modify: `apps/api/src/modules/storage/infrastructure/http/upload.controller.ts`

**Interfaces:**
- `partnerOnboardingProfileSchema` uses `identityCardFrontKey`, `identityCardBackKey`, optional `businessLicenseFrontKey`, and optional `businessLicenseBackKey`.
- `updatePartnerDocumentsInputSchema` accepts `{ logoUrl?: string; licenseDocumentKeys?: string[] }` and no longer accepts `licenseDocs` for new writes.
- Produces `InvalidPartnerDocumentReference extends DomainError` with wire code `INVALID_PARTNER_DOCUMENT_REFERENCE`, HTTP 400.
- Produces pure validators that reject legacy sensitive URL fields on new writes and validate owner prefixes.

- [ ] **Step 1: Change new-write contracts from URL fields to key fields**

In `partnerOnboardingProfileSchema`, rename the four sensitive fields and validation paths/messages:

```ts
businessLicenseFrontKey: z.string().min(1).optional(),
businessLicenseBackKey: z.string().min(1).optional(),
identityCardFrontKey: z.string().min(1),
identityCardBackKey: z.string().min(1),
```

Update the company `superRefine` required-field checks to the `...Key` names.

For the older `partnerRegistrationSchema`, do not allow it to remain a hidden writer of public sensitive URLs: either rename the same sensitive fields to `...Key` if the schema is still consumed, or remove/deprecate the unused sensitive fields after confirming code search has no runtime consumer. Do not leave a supported new-write path that accepts CCCD/GPKD public URLs.

Update `updatePartnerDocumentsInputSchema` to:

```ts
export const updatePartnerDocumentsInputSchema = z.object({
  logoUrl: z.string().url().or(z.literal('')).optional(),
  licenseDocumentKeys: z.array(z.string().min(1)).max(20).optional(),
});
```

- [ ] **Step 2: Add the stable domain error**

In `partner-errors.ts`:

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

Do not include the rejected key in the error message.

- [ ] **Step 3: Add businessInfo document helpers**

Create `partner-document-business-info.ts` with two validation helpers and no storage/network calls:

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
    if (value !== undefined && (typeof value !== 'string' || !isApplicantDocumentKeyForUser(userId, value))) {
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

- [ ] **Step 4: Enforce applicant ownership before `Partner.apply()`**

In `ApplyAsPartnerUseCase.execute()`, before entering the tenant transaction, validate:

```ts
const businessInfo = input.businessInfo ?? {};
assertApplicantDocumentReferences(userId, businessInfo);
```

Pass the validated `businessInfo` into `Partner.apply()` unchanged. This keeps key validation outside storage and prevents a caller from attaching user B's applicant key.

- [ ] **Step 5: Update the Partner aggregate merge intent**

Change `Partner.mergeDocuments()` to:

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

Do not delete legacy fields here; compatibility/migration owns cleanup.

- [ ] **Step 6: Enforce partner-prefix ownership before profile persistence**

In `UpdatePartnerDocumentsUseCase.execute()`, after loading `partnerId` and before calling `mergeDocuments`, validate `input.licenseDocumentKeys ?? []` with `assertPartnerDocumentReferences(partnerId, ...)`.

- [ ] **Step 7: Remove the anonymous public partner-document presign endpoint**

Delete only `presignPartnerApplication()` from `UploadController` and its now-unused `@Public()` import. Keep authenticated generic `POST /uploads/presign` unchanged for public images/logos.

- [ ] **Step 8: Run contract/API static verification**

Run:

```bash
pnpm check:no-tests
pnpm check:module-cycles
pnpm --filter=@booking/contracts build
pnpm --filter=@booking/api lint
pnpm --filter=@booking/api typecheck
pnpm --filter=@booking/api build
```

Expected: exit 0. Frontend typecheck may now fail because the contract changed; that is expected until Tasks 5-6 and must not be reported as final green yet.

- [ ] **Step 9: Commit Task 3**

```bash
git add packages/contracts/src/contracts/partner.ts \
  apps/api/src/modules/partner/domain/errors/partner-errors.ts \
  apps/api/src/modules/partner/domain/entities/partner.entity.ts \
  apps/api/src/modules/partner/domain/partner-document-business-info.ts \
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
- Modify: `apps/api/src/modules/partner/infrastructure/http/partner-profile.controller.ts`
- Modify: `apps/api/src/modules/partner/infrastructure/http/tenant-partner.controller.ts`
- Modify: `apps/api/src/modules/partner/infrastructure/http/dto/partner.dto.ts`
- Modify: `apps/api/src/modules/partner/infrastructure/http/partner.module.ts`

**Interfaces:**
- Produces `collectPartnerDocumentReferences(businessInfo)` returning canonical private keys plus legacy public URLs with `PartnerDocumentKind`.
- Produces `ListPartnerDocumentsUseCase.execute(tenantId, partnerId, viewer)` returning `PartnerDocumentReadItem[]`.
- Adds `GET /partner/profile/documents` (`partner.profile.manage`) and `GET /tenant/partners/:id/documents` (`tenant.partners.read`).

- [ ] **Step 1: Define a deterministic reference collector**

Extend `partner-document-business-info.ts` with a pure collector that maps canonical fields:

```ts
identityCardFrontKey -> identity_card_front
identityCardBackKey -> identity_card_back
businessLicenseFrontKey -> business_license_front
businessLicenseBackKey -> business_license_back
licenseDocumentKeys[] -> license_document
```

and legacy fields:

```ts
identityCardFrontUrl -> identity_card_front
identityCardBackUrl -> identity_card_back
businessLicenseFrontUrl -> business_license_front
businessLicenseBackUrl -> business_license_back
licenseDocs[] -> license_document
```

Ignore malformed values rather than trying to sign them. Preserve array order for `licenseDocumentKeys`/`licenseDocs`.

- [ ] **Step 2: Implement the read use case with audit-before-grant semantics**

Create `ListPartnerDocumentsUseCase` with dependencies on `PARTNER_REPOSITORY`, `TenantDbService`, `STORAGE_PORT`, and `AUDIT_WRITER`.

Use this public interface:

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

Inside `tenantDb.forTenant(tenantId, ...)`:
1. load the partner by ID;
2. throw `PartnerNotFound` if absent;
3. collect references;
4. write one audit record with action `partner.private_documents.self_view_requested` for partner viewers or `partner.private_documents.view_requested` for tenant viewers and data `{ partnerId, documentCount: refs.length, viewerType: viewer.actorType }`;
5. return the collected references only.

After the transaction, map private refs through `storage.createPrivatePresignedDownload({ key })`; legacy public refs return `{ storage: 'legacy_public', kind, url }` without private signing.

Never accept an arbitrary key from the caller.

- [ ] **Step 3: Add response DTO**

In `partner.dto.ts` add a DTO for one `partnerDocumentReadItemSchema` and use `@ApiOkResponse({ type: ..., isArray: true })` on controllers.

- [ ] **Step 4: Add partner self-read endpoint**

In `PartnerProfileController`:

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

Do not apply `RequireCurrentAgreementGuard` to this read route; the existing controller deliberately keeps sensitive read routes available while writes are agreement-gated.

- [ ] **Step 5: Add tenant review endpoint**

In `TenantPartnerController`:

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

- [ ] **Step 6: Register the use case and run RLS/static verification**

Run:

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
  apps/api/src/modules/partner/infrastructure/http/partner-profile.controller.ts \
  apps/api/src/modules/partner/infrastructure/http/tenant-partner.controller.ts \
  apps/api/src/modules/partner/infrastructure/http/dto/partner.dto.ts \
  apps/api/src/modules/partner/infrastructure/http/partner.module.ts
git commit -m "feat(partner): gate private document reads"
```

---

### Task 5: Move storefront onboarding to authenticated private document transport

**Files:**
- Modify: `apps/storefront/app/constants/api-paths.ts`
- Modify: `apps/storefront/app/constants/paths.ts`
- Modify: `apps/storefront/app/routes.ts`
- Create: `apps/storefront/app/routes/uploads.partner-documents.presign.tsx`
- Replace/rename behavior: `apps/storefront/app/features/storage/server/partner-upload-presign-route.server.ts`
- Create: `apps/storefront/app/features/storage/lib/private-document-upload.ts`
- Modify: `apps/storefront/app/features/partner-onboarding/components/partner-profile-fields.tsx`
- Modify: `apps/storefront/app/features/partner-onboarding/server/partner-onboarding-domain.ts`
- Modify shared field support only where required: `packages/ui/src/components/form/types.ts`, `packages/ui/src/components/form/field-renderer.tsx`, `packages/ui/src/components/form/image-upload.tsx`

**Interfaces:**
- Storefront same-origin route becomes `/uploads/partner-documents/presign`.
- Backend path becomes `/partners/application-documents/presign`.
- Browser helper `presignAndPutPrivateDocument(file, options)` returns `{ key: string }` and never returns a public URL.
- Onboarding form stores `...Key` values.

- [ ] **Step 1: Add the new backend and same-origin path constants**

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

- [ ] **Step 2: Replace the public BFF with authenticated phase-aware BFF**

Refactor `partner-upload-presign-route.server.ts` (or rename it consistently) so `handlePartnerDocumentUploadPresignAction(request)`:
1. requires the current storefront auth session with `requireAuth(...)`;
2. requires `partner_registration_profile` via `requirePartnerPhase(...)`;
3. limits JSON body size with the existing `MAX_PRESIGN_REQUEST_BYTES` helper;
4. parses `partnerDocumentUploadInputSchema`;
5. calls `apiPost<PrivateDocumentUploadResponse>(..., auth.session.accessToken, { schema: privateDocumentUploadResponseSchema })` against `apiPaths.partner.applicationDocumentPresign`;
6. validates the returned storage origin with `allowedStorageUploadUrl()`;
7. returns no `publicUrl`.

Do not use `publicPost` for this route.

- [ ] **Step 3: Add the thin React Router resource route and register it**

Create `routes/uploads.partner-documents.presign.tsx` as a thin `action` delegating to the server handler. In `routes.ts`, replace the old onboarding use of generic `/uploads/presign` only where appropriate; keep generic public-image routes for avatars/other media.

- [ ] **Step 4: Add a private document browser helper**

Create `features/storage/lib/private-document-upload.ts` with:

```ts
export async function presignAndPutPrivateDocument(
  file: File,
  { presignEndpoint, signal }: { presignEndpoint: string; signal?: AbortSignal },
): Promise<{ key: string }> {
  // validate against PARTNER_DOCUMENT_UPLOAD_ACCEPT and MAX_PARTNER_DOCUMENT_SIZE_BYTES
  // POST { contentType: file.type, sizeBytes: file.size }
  // parse privateDocumentUploadResponseSchema
  // PUT file with grant.requiredHeaders
  // return { key: grant.key }
}
```

The PUT must use exactly:

```ts
headers: grant.requiredHeaders
```

and `body: file`. Do not manually set `content-length` in browser code.

- [ ] **Step 5: Give the shared file field an explicit private-document mode without making it own auth**

Add one explicit field config discriminator rather than overloading the generic public image path. For example:

```ts
uploadMode?: 'public-image' | 'private-document';
```

Default remains `public-image`. In `FieldRenderer`/`ImageUpload`, when `uploadMode === 'private-document'`, call `presignAndPutPrivateDocument` through a provided callback/helper boundary and persist the returned key as the field value. Keep existing image preview behavior local-only (object URL) for private documents.

If importing the storefront feature helper into `@booking/ui` would violate package boundaries, keep the low-level private uploader in `@booking/ui/lib` using only contract-shaped local types, or create a small injected `upload(file)` callback on `FileFieldConfig`; choose the option that preserves current package dependency rules and `check:frontend-structure`.

- [ ] **Step 6: Change onboarding fields and payload mapping to key names**

In `partner-profile-fields.tsx`, change document field names to:

```ts
businessLicenseFrontKey
businessLicenseBackKey
identityCardFrontKey
identityCardBackKey
```

Set `presignEndpoint: storefrontPaths.partnerDocumentUploadPresign` and the private-document mode.

In `partner-onboarding-domain.ts`, build `businessInfo` with the same `...Key` names; do not emit legacy `...Url` fields.

- [ ] **Step 7: Run storefront/package verification**

Run:

```bash
pnpm check:frontend-structure
pnpm --filter=@booking/storefront security
pnpm --filter=@booking/storefront lint
pnpm --filter=@booking/storefront typecheck
pnpm --filter=@booking/storefront build
pnpm --filter=@booking/ui typecheck
```

Use the repository's actual `@booking/ui` verification command if that package has no standalone `typecheck`; do not invent a script.

- [ ] **Step 8: Commit Task 5**

Stage only the storefront/UI files touched by this task and commit:

```bash
git commit -m "fix(storefront): upload partner documents privately"
```

---

### Task 6: Split dashboard logo upload from private legal documents and consume read grants

**Files:**
- Modify: `apps/dashboard/app/constants/api-paths.ts`
- Modify: `apps/dashboard/app/constants/paths.ts`
- Modify: `apps/dashboard/app/routes.ts`
- Create: `apps/dashboard/app/routes/uploads.partner-documents.presign.tsx`
- Create: `apps/dashboard/app/features/partner/components/profile/private-document-upload.tsx`
- Modify: `apps/dashboard/app/features/partner/components/profile/profile-documents-card.tsx`
- Modify: `apps/dashboard/app/features/partner/server/profile-actions.server.ts`
- Modify: `apps/dashboard/app/routes/partner/profile.tsx`
- Modify: `apps/dashboard/app/features/tenant/lib/partner-business-info.ts`
- Modify: `apps/dashboard/app/routes/tenant/partners/detail.tsx`
- Modify the tenant document display component(s) that currently receive `identityPhotos` / `licensePhotos`.

**Interfaces:**
- Dashboard same-origin private presign route calls backend `POST /partner/profile/documents/presign`.
- Partner profile loader fetches `GET /partner/profile/documents` as `PartnerDocumentReadItem[]`.
- Tenant detail loader fetches `GET /tenant/partners/:id/documents` as `PartnerDocumentReadItem[]`.
- `logoUrl` stays on the existing generic `/uploads/presign` public path; only `licenseDocumentKeys` use private upload.

- [ ] **Step 1: Add dashboard API path constants**

Add:

```ts
partner: {
  ...,
  profileDocumentPresign: partnerPath('/profile/documents/presign'),
  profileDocuments: partnerPath('/profile/documents'),
},
tenant: {
  ...,
  partnerDocuments: (partnerId: string) => tenantPath(`/partners/${segment(partnerId)}/documents`),
},
```

Keep existing `profileDocuments` PATCH path semantics by naming the read constant unambiguously if necessary (for example `profileDocumentList`) so GET and PATCH call sites are obvious.

- [ ] **Step 2: Add a same-origin partner private-presign route**

Use `requirePartner(request)` and `apiPost` to proxy `partnerDocumentUploadInputSchema` to `apiPaths.partner.profileDocumentPresign`. Return a response validated by `privateDocumentUploadResponseSchema`.

- [ ] **Step 3: Add a purpose-built private document uploader component**

Create a small component used only by the partner profile document card. It validates MIME/size, requests the private grant, PUTs with `requiredHeaders`, and returns the opaque `key`. It must not reuse `PhotoStrip` with a persisted public URL for newly uploaded private documents.

- [ ] **Step 4: Split the partner profile card**

Keep the logo field using the existing generic `file`/`target: 'partners'` public uploader. Replace the `licenseDocs` GenericForm field with the private uploader and submit new keys as `licenseDocumentKeys`.

Existing documents shown on the card come from loader-provided `PartnerDocumentReadItem[]`:
- `private` entries display their temporary `downloadUrl`;
- `legacy_public` entries display their legacy `url` during compatibility.

Do not persist either display URL back to `businessInfo`.

- [ ] **Step 5: Update profile actions to append/delete keys, not URLs**

For `intent === 'documents'`, append parsed `licenseDocumentKeys` to existing canonical keys from `PartnerResponse.businessInfo.licenseDocumentKeys`, capped at 20.

For delete, post a hidden opaque `key` for private entries and update the array by key. Legacy URL deletion remains compatibility-only if the existing UI exposes it; do not turn a legacy URL into a new key.

- [ ] **Step 6: Load private read descriptors for partner self-service**

In `routes/partner/profile.tsx`, fetch `apiPaths.partner.profileDocumentList` in the existing `Promise.all` and pass the result to `ProfileDocumentsCard`. If the document-list request fails, show a localized document-section error without exposing storage internals; do not fail the entire profile page if the core partner profile loaded.

- [ ] **Step 7: Load private read descriptors for tenant review**

In `routes/tenant/partners/detail.tsx`, include `apiGet<PartnerDocumentReadItem[]>(apiPaths.tenant.partnerDocuments(params.partnerId), auth)` in the loader's parallel reads and pass descriptors to the identity/legal document cards.

Refactor `partner-business-info.ts` so it remains responsible only for non-document legal text and logo compatibility. Stop treating raw `businessInfo` sensitive URLs as the primary document display source; document display comes from the gated endpoint.

- [ ] **Step 8: Run dashboard verification**

Run:

```bash
pnpm check:frontend-structure
pnpm --filter=@booking/dashboard lint
pnpm --filter=@booking/dashboard typecheck
pnpm --filter=@booking/dashboard build
```

Expected: exit 0.

- [ ] **Step 9: Commit Task 6**

Stage only dashboard files touched by Task 6 and commit:

```bash
git commit -m "fix(dashboard): consume private partner document grants"
```

---

### Task 7: Add idempotent legacy public-document remediation tooling

**Files:**
- Create: `apps/api/scripts/migrate-private-partner-documents.ts`
- Modify: `apps/api/package.json`
- Extend as needed: `apps/api/src/modules/storage/infrastructure/services/s3-storage.service.ts` and/or `apps/api/src/modules/storage/domain/ports/storage.port.ts` only if the script cannot safely reuse existing S3 primitives without business leakage.

**Interfaces:**
- Adds `pnpm --filter=@booking/api migrate:partner-documents -- --dry-run` for audit-only mode.
- Adds `pnpm --filter=@booking/api migrate:partner-documents -- --apply` for explicit mutation mode.
- Script only migrates URLs under the configured BookingOS public storage/CDN origin and never fetches arbitrary external URLs.

- [ ] **Step 1: Inspect existing operational script conventions**

Follow `apps/api/scripts/bootstrap-storage.ts`, `check-rls.ts`, and tax audit/verify scripts for env loading, Prisma lifecycle, logging, and exit-code conventions. Reuse helpers rather than introducing a new CLI framework.

- [ ] **Step 2: Implement dry-run discovery**

The script must enumerate partner rows containing any legacy field:

```text
identityCardFrontUrl
identityCardBackUrl
businessLicenseFrontUrl
businessLicenseBackUrl
licenseDocs
```

For each candidate, parse only URLs whose origin/path matches configured `S3_PUBLIC_URL` / public bucket mapping. Record counters only: `eligible`, `external_url`, `missing`, `oversized`, `already_migrated`, `failed`.

Default mode is dry-run. Running without `--apply` must perform no object copy, DB update, or deletion.

- [ ] **Step 3: Implement deterministic destination keys and safe copy**

Destination prefix is:

```text
partner-documents/legacy/<partnerId>/
```

Use a deterministic destination filename derived from the source object key identity (for example a SHA-256 digest plus the validated image extension) so reruns converge on the same destination instead of creating duplicates.

Before copy:
- verify source exists;
- verify allowed image content type;
- verify size `<= MAX_PARTNER_DOCUMENT_SIZE_BYTES`.

- [ ] **Step 4: Update `businessInfo` inside the tenant-scoped DB boundary**

For each successfully copied object, map legacy fields to canonical key fields. Update only that partner's JSON inside `TenantDbService.forTenant(tenantId, ...)` / equivalent script-safe RLS boundary; preserve unrelated keys.

If canonical destination fields already contain the deterministic key, treat as idempotent success.

- [ ] **Step 5: Delete the old public object only after DB success**

After the DB update commits, delete the source public object. If deletion fails, report `delete_pending` and make the next `--apply` run retry deletion without reverting the canonical DB key.

Never log full document URL query strings, signed URLs, or private destination keys. Partner ID and status counters are sufficient.

- [ ] **Step 6: Add package script**

In `apps/api/package.json`:

```json
"migrate:partner-documents": "node --env-file-if-exists=../../.env ./node_modules/ts-node/dist/bin.js --transpile-only scripts/migrate-private-partner-documents.ts"
```

- [ ] **Step 7: Verify dry-run against disposable seeded data only**

Use disposable Postgres/MinIO data with one valid legacy object, one external URL, one oversized object, and one missing object. Run dry-run and verify no DB/object changes. Then run `--apply`, verify canonical keys + private copies + public deletion, and run `--apply` a second time to verify idempotence.

Do not point this command at staging/production during implementation.

- [ ] **Step 8: Commit Task 7**

```bash
git add apps/api/scripts/migrate-private-partner-documents.ts apps/api/package.json
git commit -m "feat(ops): add legacy partner document migration"
```

---

### Task 8: Run focused disposable security/runtime smoke

**Files:**
- Temporary only if needed: `.github/workflows/sec-002-private-partner-documents-smoke.yml`
- No permanent test files.

**Interfaces:**
- Verifies the 16 acceptance cases from the approved spec using disposable PostgreSQL, Redis, API, and MinIO/S3-compatible buckets.
- Temporary workflow must be removed before final source-only CI.

- [ ] **Step 1: Prepare isolated runtime services**

Use only disposable service containers/resources. Create separate public and private MinIO buckets matching `S3_BUCKET` and `S3_PRIVATE_BUCKET`; ensure they are distinct. Configure the public origin only for the public bucket.

- [ ] **Step 2: Verify authentication and size rejection**

Assert:
1. unauthenticated `POST /partners/application-documents/presign` returns 401;
2. authenticated request with `sizeBytes = 5 * 1024 * 1024 + 1` returns 400 and no usable grant;
3. valid request returns no `publicUrl`, returns `requiredHeaders`, and the key starts with the authenticated user's applicant prefix.

- [ ] **Step 3: Verify signed exact-length and write-once behavior**

With a valid grant:
1. PUT exact bytes with `content-type` and `if-none-match: *` succeeds;
2. obtain a fresh grant for a known different declared length and PUT a body whose size does not match; assert storage rejects it;
3. reuse the first successful grant/key for a second PUT and assert the `If-None-Match: *` condition rejects overwrite.

Capture HTTP status and S3 error code only; do not print presigned query strings.

- [ ] **Step 4: Verify private-bucket isolation**

Assert the uploaded object exists in the private bucket and the equivalent public-bucket/public-origin path does not return the object.

- [ ] **Step 5: Verify applicant attach ownership**

Create user A and user B. Upload under A, then attempt partner application as B with A's key; assert `INVALID_PARTNER_DOCUMENT_REFERENCE` / 400 and no partner is created. Apply as A with A's key and assert the partner persists the canonical key.

- [ ] **Step 6: Verify gated read grants and cross-tenant protection**

Assert:
- authorized tenant reviewer can `GET /tenant/partners/:id/documents` and the returned private download URL works;
- unauthenticated/unauthorized caller cannot obtain a read grant;
- tenant B cannot read tenant A's partner through existing RLS/not-found behavior;
- `GET /public/partners/:slug` (or the canonical public partner endpoint) exposes neither private keys nor download grants.

- [ ] **Step 7: Verify existing-partner self-service ownership**

As partner A, upload and attach a partner-scoped key and read it back through `GET /partner/profile/documents`. Attempt to attach partner B's key and assert 400.

- [ ] **Step 8: Verify public logo regression**

Use existing public logo upload path and confirm it still returns/serves a public URL. This must not use the private bucket.

- [ ] **Step 9: Verify legacy compatibility and migration script**

Seed one partner with legacy public fields. Confirm authorized partner/tenant document reads return `storage: 'legacy_public'`; then run disposable migration and confirm the read changes to `storage: 'private'`, the DB contains canonical keys, and the public original is gone.

- [ ] **Step 10: Verify finance regression**

Run the existing tax-document upload path with its PDF client/header shape. Confirm exact-length write-once upload still succeeds after the generic S3 signing change.

- [ ] **Step 11: Remove temporary workflow/harness changes**

Delete `.github/workflows/sec-002-private-partner-documents-smoke.yml` and any temporary fault-injection/debug files. Final source diff must contain only product/docs/ops changes intended for merge.

- [ ] **Step 12: Record runtime evidence in the eventual PR body**

Record concise PASS/FAIL results by case, workflow run ID if GitHub Actions was used, and exact source head SHA. Do not include secrets, presigned URLs, or object keys.

---

### Task 9: Run final repository gates, review the diff, and prepare merge-ready branch

**Files:**
- No new product files expected.
- Update docs/comments only if static review finds stale statements such as “public partner documents” or “no server-side cap exists yet”.

**Interfaces:**
- Produces a source-only feature head with no temporary workflow, all required CI/static gates green, and runtime smoke evidence tied to that exact head or to a merge-ref that contains it plus current `main`.

- [ ] **Step 1: Search for stale public-document semantics**

Run searches equivalent to:

```bash
rg "partner-applications/presign|identityCardFrontUrl|identityCardBackUrl|businessLicenseFrontUrl|businessLicenseBackUrl|licenseDocs|no server-side cap exists yet" \
  apps packages docs TONG-QUAN.md
```

Classify every remaining hit as one of:
- deliberate legacy compatibility/migration code;
- historical documentation intentionally describing old state;
- stale new-write code/comment that must be fixed before completion.

- [ ] **Step 2: Run the full repository verification required by the spec**

Run:

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

Also ensure normal CI includes and passes storefront security, frontend-structure, tenant-surface/theme gates, and any other repository-required checks.

- [ ] **Step 3: Inspect the final diff for scope and secret leakage**

Confirm:
- no test files/runners were added;
- no workflow smoke file remains;
- no credentials, presigned URLs, real PII, or object keys appear in committed fixtures/docs;
- public logo behavior is unchanged;
- public partner response contract still excludes `businessInfo`/private document data;
- no sensitive new-write route accepts legacy public URL fields.

- [ ] **Step 4: Perform code review against the approved spec**

Review each spec section against the final diff: private storage, signed size/MIME/write-once, owner-scoped attach, partner/tenant read authorization, audit logging, storefront/dashboard behavior, legacy migration, and completion criteria. Fix any mismatch before declaring the branch ready.

- [ ] **Step 5: Run final CI on the source-only head after all fixes**

The final normal CI run must target the exact final head SHA after temporary workflow removal and review fixes. Do not rely on an older green run.

- [ ] **Step 6: Prepare the PR only after explicit PR-creation authorization**

Suggested title:

```text
fix(partner): keep verification documents private
```

PR body must include:
- SEC-002 root cause;
- public-PII blocker discovered during analysis;
- architecture summary;
- exact static/CI evidence;
- disposable runtime smoke cases and run ID;
- explicit statement that no deploy was performed;
- operational note: privacy blocker remains open until legacy-field audit/migration is completed in the deployed environment.

Do not merge without separate explicit merge authorization.
