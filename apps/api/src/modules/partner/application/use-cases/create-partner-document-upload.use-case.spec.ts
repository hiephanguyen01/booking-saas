import { describe, expect, it } from 'vitest';
import type { PartnerDocumentUploadInput } from '@booking/contracts';
import { fakePort } from '~testing';
import type { StoragePort } from '../../../storage/domain/ports/storage.port';
import { CreatePartnerDocumentUploadUseCase } from './create-partner-document-upload.use-case';

const PARTNER_ID = 'partner-1';

const input: PartnerDocumentUploadInput = {
  contentType: 'image/png',
  sizeBytes: 2 * 1024 * 1024,
};

describe('CreatePartnerDocumentUploadUseCase', () => {
  it('creates presigned upload scoped to the partner prefix', async () => {
    const uploadCalls: unknown[] = [];
    const useCase = new CreatePartnerDocumentUploadUseCase(
      fakePort<StoragePort>({
        createPrivatePresignedUpload: (opts) => {
          uploadCalls.push(opts);
          return Promise.resolve({
            uploadUrl: 'https://storage/upload-partner',
            key: `partner-documents/partners/${PARTNER_ID}/11111111-1111-4111-8111-111111111111.png`,
            expiresInSec: 300,
          });
        },
      }),
    );

    const result = await useCase.execute(PARTNER_ID, input);

    expect(uploadCalls).toEqual([
      {
        keyPrefix: `partner-documents/partners/${PARTNER_ID}`,
        contentType: 'image/png',
        contentLength: 2 * 1024 * 1024,
        writeOnce: true,
      },
    ]);
    expect(result.uploadUrl).toBe('https://storage/upload-partner');
    expect(result.requiredHeaders).toEqual({
      'content-type': 'image/png',
      'if-none-match': '*',
    });
  });
});
