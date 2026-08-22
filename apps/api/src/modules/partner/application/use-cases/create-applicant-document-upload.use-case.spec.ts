import { describe, expect, it } from 'vitest';
import type { PartnerDocumentUploadInput } from '@booking/contracts';
import { fakePort } from '~testing';
import type { StoragePort } from '../../../storage/domain/ports/storage.port';
import { CreateApplicantDocumentUploadUseCase } from './create-applicant-document-upload.use-case';

const USER_ID = 'user-1';

const input: PartnerDocumentUploadInput = {
  contentType: 'image/png',
  sizeBytes: 1024 * 1024,
};

describe('CreateApplicantDocumentUploadUseCase', () => {
  it('creates presigned upload scoped to the applicant prefix', async () => {
    const uploadCalls: unknown[] = [];
    const useCase = new CreateApplicantDocumentUploadUseCase(
      fakePort<StoragePort>({
        createPrivatePresignedUpload: (opts) => {
          uploadCalls.push(opts);
          return Promise.resolve({
            uploadUrl: 'https://storage/upload',
            key: `partner-documents/applicants/${USER_ID}/11111111-1111-4111-8111-111111111111.png`,
            expiresInSec: 300,
          });
        },
      }),
    );

    const result = await useCase.execute(USER_ID, input);

    expect(uploadCalls).toEqual([
      {
        keyPrefix: `partner-documents/applicants/${USER_ID}`,
        contentType: 'image/png',
        contentLength: 1024 * 1024,
        writeOnce: true,
      },
    ]);
    expect(result.uploadUrl).toBe('https://storage/upload');
    expect(result.requiredHeaders).toEqual({
      'content-type': 'image/png',
      'if-none-match': '*',
    });
  });
});
