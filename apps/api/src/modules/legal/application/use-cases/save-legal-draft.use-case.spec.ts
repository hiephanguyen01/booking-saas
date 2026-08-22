import { describe, expect, it } from 'vitest';
import type { LegalDocumentType, SaveLegalDraftInput } from '@booking/contracts';
import { fakePort, fakeTenantDb } from '~testing';
import type {
  ILegalDocumentRepository,
  UpsertDraftData,
} from '../../domain/ports/legal-document-repository.port';
import { SaveLegalDraftUseCase } from './save-legal-draft.use-case';

describe('SaveLegalDraftUseCase', () => {
  it('upserts the single draft for THIS document type, in the tenant scope', async () => {
    // A draft is not published text, so there is nothing to guard here — but it
    // must land on the right document, and inside the tenant's own scope.
    const saved: UpsertDraftData[] = [];
    const tenantDb = fakeTenantDb();
    const useCase = new SaveLegalDraftUseCase(
      fakePort<ILegalDocumentRepository>({
        upsertDraft: (_tx, data) => {
          saved.push(data);
          return Promise.resolve('version-draft');
        },
      }),
      tenantDb.service,
    );

    const translations = [{ locale: 'vi', title: 'Điều khoản', bodyMd: '# Nội dung' }];
    await useCase.execute('tenant-1', 'partner_terms' as LegalDocumentType, {
      translations,
    } as SaveLegalDraftInput);

    expect(tenantDb.openedFor).toEqual(['tenant-1']);
    expect(saved).toEqual([
      { tenantId: 'tenant-1', docType: 'partner_terms', translations },
    ]);
  });
});
