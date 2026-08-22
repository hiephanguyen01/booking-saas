import { describe, expect, it } from 'vitest';
import { fakePort } from '~testing';
import type { PresignedUpload, StoragePort } from '../../domain/ports/storage.port';
import { CreatePresignedUploadUseCase } from './create-presigned-upload.use-case';

describe('CreatePresignedUploadUseCase', () => {
  it('mints the grant under the requested folder and content type', async () => {
    // The grant is not an authorisation: any authenticated actor can mint one, and
    // the object only becomes visible once its key is attached to something the
    // actor may edit. So the only contract here is that the target folder and the
    // content type reach the storage adapter unchanged.
    const calls: unknown[] = [];
    const grant: PresignedUpload = {
      uploadUrl: 'https://s3/put',
      key: 'listings/abc.jpg',
      publicUrl: 'https://cdn/listings/abc.jpg',
      expiresInSec: 900,
    };
    const useCase = new CreatePresignedUploadUseCase(
      fakePort<StoragePort>({
        createPresignedUpload: (input) => {
          calls.push(input);
          return Promise.resolve(grant);
        },
      }),
    );

    await expect(useCase.execute({ target: 'listings', contentType: 'image/jpeg' })).resolves.toBe(
      grant,
    );
    expect(calls).toEqual([{ keyPrefix: 'listings', contentType: 'image/jpeg' }]);
  });
});
