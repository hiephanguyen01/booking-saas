# SEC-002 — Private Partner Documents and Upload Size Enforcement

**Status:** Proposed design, approved in chat on 2026-08-21. Implementation has not started.

## Problem

The current partner-document upload path combines three security problems in one flow:

1. `POST /uploads/partner-applications/presign` is public, so an unauthenticated caller can mint direct-to-storage upload grants subject only to throttling.
2. The partner flow does not submit the file size to the API, so the existing `StoragePort` `contentLength` capability is unused and the 5 MiB UI limit is only client-side.
3. Identity cards, business-license scans, and additional legal documents are uploaded through `createPresignedUpload()` to the public bucket and persisted in `Partner.businessInfo` as public URLs.

The third item is more serious than the original SEC-002 storage-cost finding because the affected files contain identity and legal-document PII.

The partner profile step already requires an authenticated user before these documents are submitted, so anonymous document upload is not required by the current onboarding architecture. The repository also already has a separate private bucket and short-lived private download grants for sensitive tax documents.

## Goals

This change must:

- make new partner identity/legal documents private at rest;
- remove anonymous partner-document presign grants;
- enforce a 5 MiB maximum at the API boundary;
- bind each presigned PUT to the declared byte length and MIME type;
- make document uploads write-once;
- prevent one applicant or partner from attaching another caller's uploaded object;
- keep partner logos public;
- expose private documents only through permission-gated, short-lived download grants;
- preserve read compatibility with legacy partner records that still contain public document URLs;
- provide an operational path to remove legacy public PII before the system is considered production-ready.

## Non-goals

This design does not add OCR, malware scanning, eKYC, image transcoding, or document-content classification. It does not introduce a new relational document table. It does not redesign the generic public image-upload system for listings, groups, tenant media, or avatars. It does not add PDF support to partner identity documents; the existing image formats remain the supported document formats.

Object lifecycle cleanup for abandoned onboarding uploads is also not part of SEC-002. The existing presign throttle remains required, and a bucket lifecycle rule may be added later for stale unreferenced staging objects.

## Current architecture

The storage abstraction already supports the primitives this design needs:

```ts
interface CreateUploadInput {
  keyPrefix: string;
  contentType: string;
  contentLength?: number;
  writeOnce?: boolean;
}
```

`S3StorageService.createPrivatePresignedUpload()` targets `S3_PRIVATE_BUCKET`, while `createPresignedUpload()` targets the public bucket and returns a public CDN/storage URL.

The finance module already demonstrates the desired sensitive-document pattern: it supplies both `contentLength` and `writeOnce: true`, stores an opaque key, and later returns a short-lived private download URL only after authorization.

Partner onboarding currently does the opposite: the storefront uploads scans through the public partner presign route, receives `publicUrl`, and stores that URL inside `businessInfo`. Tenant dashboard code later reads those values as identity and license photos.

## Decision

Partner-document business semantics move into the Partner module. The Storage module remains a business-agnostic primitive provider.

There will be two private-upload scopes:

- **Applicant documents:** authenticated users who have not yet created the Partner record.
- **Partner-profile documents:** existing partner owners updating their own legal documents.

Both use `StoragePort.createPrivatePresignedUpload()` with an exact content length and write-once semantics. The object key namespace identifies the upload scope and prevents cross-owner attachment.

Public partner logos continue through the existing public image-upload path.

## Canonical storage keys

New private objects use these prefixes:

```text
partner-documents/applicants/<userId>/<uuid>.<ext>
partner-documents/partners/<partnerId>/<uuid>.<ext>
```

Applicant documents are allowed to stay under the applicant prefix after the Partner record is created. They become authoritative only after `ApplyAsPartnerUseCase` validates that every submitted applicant key belongs to the authenticated `userId` and persists the keys in that Partner's `businessInfo`.

Existing-partner document uploads use the partner-scoped prefix. `UpdatePartnerDocumentsUseCase` accepts only keys under the current `partnerId` prefix.

Download authorization never trusts a prefix alone. The requested object must also be referenced by the target Partner's canonical document fields.

## Canonical `businessInfo` fields

New writes use opaque object keys for sensitive documents and keep only the logo public:

```ts
{
  logoUrl?: string;

  identityCardFrontKey?: string;
  identityCardBackKey?: string;
  businessLicenseFrontKey?: string;
  businessLicenseBackKey?: string;
  licenseDocumentKeys?: string[];

  // existing non-document fields remain unchanged
}
```

Legacy fields remain read-only compatibility inputs during migration:

```ts
identityCardFrontUrl
identityCardBackUrl
businessLicenseFrontUrl
businessLicenseBackUrl
licenseDocs
```

No new code may write sensitive documents to the legacy `...Url` or `licenseDocs` fields.

No Prisma schema migration is required because `businessInfo` is already JSONB.

## Shared contracts

Add a dedicated private partner-document upload contract rather than reusing `presignUploadInputSchema`, because a private grant has different security requirements and must not expose `publicUrl`.

```ts
export const MAX_PARTNER_DOCUMENT_SIZE_BYTES = 5 * 1024 * 1024;

export const partnerDocumentUploadInputSchema = z.object({
  contentType: photoUploadContentTypeSchema,
  sizeBytes: z.number().int().min(1).max(MAX_PARTNER_DOCUMENT_SIZE_BYTES),
});

export const privateDocumentUploadResponseSchema = z.object({
  uploadUrl: z.string().url(),
  key: z.string().min(1),
  expiresInSec: z.number().int().positive(),
  requiredHeaders: z.object({
    'content-type': photoUploadContentTypeSchema,
    'if-none-match': z.literal('*'),
  }),
});
```

`photoUploadContentTypeSchema` is the existing photo/image allowlist without favicon-only ICO types. The client sends `sizeBytes = file.size` and the API independently rejects anything above 5 MiB.

The browser cannot set `Content-Length` directly; the browser/network stack computes it from the request body. The grant therefore returns only headers the browser must explicitly provide.

## S3 signature requirements

Supplying `ContentLength` or `ContentType` to `PutObjectCommand` is not sufficient unless the generated presigned request signs the relevant headers.

AWS SDK for JavaScript v3's S3 presigner explicitly excludes `content-type` from signing by default. `content-length` is not in that exclusion set, but this design makes the signed-header intent explicit.

When an upload specifies `contentLength`, `S3StorageService` must generate the URL with the appropriate `signableHeaders` so the signature includes:

```text
content-type
content-length
if-none-match   // when writeOnce is true
```

For partner private documents the `PutObjectCommand` contains:

```ts
{
  ContentType: input.contentType,
  ContentLength: input.contentLength,
  IfNoneMatch: '*',
}
```

The client PUT sends the returned `content-type` and `if-none-match: *` headers. The browser supplies the computed `content-length`. A payload whose byte count differs from the signed value must fail signature validation. A second successful PUT to the same key must fail the `If-None-Match: *` condition.

This signing change should be implemented generically inside the storage adapter for uploads that provide these fields, but it must not add `If-None-Match` to grants where `writeOnce` is false.

## API endpoints

### Applicant document upload

Add to `PartnerApplicationController`:

```text
POST /partners/application-documents/presign
```

Security:

- `@AuthenticatedOnly()`;
- `@Throttle(THROTTLE_UPLOAD)`;
- `@CurrentPrincipal()` supplies `userId`;
- body is `partnerDocumentUploadInputSchema`;
- object prefix is `partner-documents/applicants/<userId>`;
- storage call uses `contentLength: sizeBytes` and `writeOnce: true`.

The API response is a private upload grant and contains no `publicUrl`.

The API does not need to understand the storefront onboarding phase. The storefront BFF still requires the `partner_registration_profile` phase before it calls this endpoint.

### Existing partner document upload

Add to `PartnerProfileController`:

```text
POST /partner/profile/documents/presign
```

Security:

- `@RequirePermissions('partner.profile.manage')`;
- `RequireCurrentAgreementGuard`, matching the existing document-update write boundary;
- `@Throttle(THROTTLE_UPLOAD)`;
- `TenantContextService.partnerIdOrThrow()` determines the prefix;
- object prefix is `partner-documents/partners/<partnerId>`;
- body and storage requirements are the same as applicant upload.

### Private document reads

Add dedicated read endpoints instead of putting expiring private URLs into the general `PartnerResponse` contract:

```text
GET /partner/profile/documents
GET /tenant/partners/:id/documents
```

Authorization:

- partner self-service: `partner.profile.manage`;
- tenant review: `tenant.partners.read` and normal tenant scoping/RLS.

Each endpoint loads the Partner record, collects the canonical private document keys actually referenced by that record, and returns short-lived download grants produced by `createPrivatePresignedDownload()`.

A response item carries a stable document kind plus the temporary read URL:

```ts
{
  kind:
    | 'identity_card_front'
    | 'identity_card_back'
    | 'business_license_front'
    | 'business_license_back'
    | 'license_document';
  key: string;
  downloadUrl: string;
  expiresInSec: number;
}
```

The endpoints may also return legacy public document entries during the compatibility period, clearly marked as `storage: 'legacy_public'`, so existing records remain reviewable while migration is pending. New private entries are marked `storage: 'private'`.

Private keys must never be resolved by a generic unauthenticated storage endpoint.

## Attach validation

`ApplyAsPartnerUseCase` already receives the authenticated user ID. Before persisting `businessInfo`, it validates every applicant document key with a pure helper equivalent to:

```ts
isApplicantDocumentKeyForUser(userId, key)
```

A key from another user's applicant prefix, a public-bucket URL, a partner-scoped prefix, traversal-like value, or any noncanonical path is rejected.

`UpdatePartnerDocumentsUseCase` validates every new `licenseDocumentKeys` value against:

```ts
isPartnerDocumentKey(partnerId, key)
```

It keeps `logoUrl` as a public URL but does not accept new sensitive-document URLs.

The download-list use case resolves only keys already referenced by the Partner record. A caller cannot supply an arbitrary private key and obtain a signed GET URL.

## Frontend/BFF changes

### Storefront onboarding

The existing partner-document fields stop using the generic public `presignAndPut()` helper.

A private-document helper will:

1. validate MIME and file size client-side for fast feedback;
2. POST `{ contentType, sizeBytes }` through an authenticated same-origin BFF route;
3. receive `{ uploadUrl, key, requiredHeaders, expiresInSec }`;
4. PUT the exact `File` body with the required headers;
5. return the opaque `key`, not a public URL.

The BFF requires both the storefront auth session and `partner_registration_profile` flow phase, then replays the access token to `/partners/application-documents/presign`. The old `publicPost` path is removed for partner documents.

The onboarding form field names change to the canonical `...Key` names. The UI may use a local `URL.createObjectURL(file)` preview while the current page is open, but it must not persist that local preview URL.

### Partner dashboard

The partner logo remains on the existing public upload path.

Additional legal documents move to a purpose-built private-document uploader and persist `licenseDocumentKeys`. Existing private documents are displayed using the short-lived URLs returned by `GET /partner/profile/documents`.

The tenant partner-review UI uses `GET /tenant/partners/:id/documents` rather than reading document URLs directly from `businessInfo`.

The shared generic image uploader should not be made responsible for private-document authorization. Reuse low-level visual primitives where useful, but keep private document behavior explicit.

## Audit logging

Private-document read endpoints expose identity/legal PII and should follow the tax-document precedent.

Before minting read grants, write one sanitized audit record for the request. The record may contain `partnerId`, actor ID/type, and document count, but must not contain presigned URLs or raw object keys.

Suggested action names:

```text
partner.private_documents.view_requested
partner.private_documents.self_view_requested
```

## Legacy public-document remediation

Read compatibility alone does not close the privacy exposure. Existing public objects, if any, remain globally reachable until copied to the private bucket and removed from the public bucket.

Before production readiness is declared, the deployed environment must be checked for legacy fields:

```text
identityCardFrontUrl
identityCardBackUrl
businessLicenseFrontUrl
businessLicenseBackUrl
licenseDocs
```

If no rows contain those fields, no data migration is required.

If rows exist, use an idempotent administrative migration with a dry-run mode:

1. identify only URLs under the configured BookingOS public storage/CDN origin; never fetch arbitrary external URLs;
2. resolve the source object key and verify it is an allowed image object;
3. reject/flag objects above the new 5 MiB limit for manual handling;
4. copy the object into `S3_PRIVATE_BUCKET` under a deterministic partner legacy prefix;
5. update that Partner's `businessInfo` to the canonical `...Key` fields inside the normal tenant-scoped DB boundary;
6. only after the DB update succeeds, delete the old public object;
7. make reruns safe when a destination copy or DB update already exists;
8. report every migrated, skipped, oversized, missing, and failed object without logging document bytes or sensitive query data.

The compatibility reader stays in place for one release after successful migration so rollback does not make historical records unreadable. New writes remain key-only throughout.

## Error handling

Use stable application/domain errors for security-relevant validation:

- unsupported MIME type -> 400;
- `sizeBytes < 1` or `sizeBytes > 5 MiB` -> 400;
- malformed/cross-owner applicant key -> 400;
- malformed/cross-partner profile key -> 400;
- unauthenticated applicant presign -> 401;
- missing partner permission -> 403;
- tenant cannot access another tenant's partner -> existing not-found/RLS behavior;
- private storage failure -> existing storage/service error handling without exposing bucket names, credentials, or signed URL internals.

Client error messages may be localized, but server logs must not include presigned URLs, document bytes, identity numbers, or full object keys.

## Verification

ADR 0005 forbids adding automated test files/runners, so verification follows repository policy plus focused disposable runtime smoke.

### Static/repository gates

Run at minimum:

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

Also run the existing storefront security/structure/tenant-surface gates included by normal CI.

### Disposable storage/runtime smoke

Use disposable PostgreSQL, Redis, API, and MinIO/S3-compatible buckets only. Do not use staging or production.

Required acceptance cases:

1. unauthenticated applicant presign is rejected;
2. authenticated applicant presign above 5 MiB is rejected before a grant is minted;
3. a valid grant returns no `publicUrl` and uses the caller's applicant prefix;
4. an exact-size PUT with the required headers succeeds;
5. reusing that grant with a different payload byte length fails because signed `content-length` no longer matches;
6. a second PUT to the same key fails because `If-None-Match: *` is signed and enforced;
7. the object exists only in the private bucket and cannot be read from the public storage/CDN origin;
8. user B cannot attach user A's applicant key during partner application;
9. a valid applicant key can be persisted, and an authorized tenant reviewer receives a working short-lived download grant;
10. an unauthorized caller cannot obtain a private-document read grant;
11. partner self-service cannot attach a key from another partner prefix;
12. partner self-service can upload, attach, and read its own private document;
13. public partner-logo upload remains unchanged;
14. legacy URL fields remain readable by authorized review UI during the compatibility period;
15. normal CI passes on the final source-only head after any temporary verification workflow is removed.

## Rollout and completion criteria

The code change may merge after static CI and disposable runtime smoke pass.

SEC-002 is considered code-complete when new partner documents are authenticated, size-bound, write-once, private, owner-scoped, and permission-gated for reads.

The broader privacy blocker is considered operationally closed only after the deployed environment has been checked for legacy public document fields and either:

- no legacy public partner documents exist; or
- the migration has copied them to private storage, updated `businessInfo`, and removed the public originals.

No deploy is part of implementing or reviewing this spec unless separately authorized.
