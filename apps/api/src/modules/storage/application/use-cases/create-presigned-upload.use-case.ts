import { Inject, Injectable } from '@nestjs/common';
import { STORAGE_PORT, type PresignedUpload, type StoragePort } from '../../domain/ports/storage.port';

/** Input for minting an upload grant — `target` is the logical folder (§4.2). */
export interface CreatePresignedUploadCommand {
  target: string;
  contentType: string;
}

/**
 * Mint a short-lived presigned PUT URL for a direct-to-storage upload (§4.2).
 * Any authenticated actor may request one; the object only becomes visible once
 * its key is attached to a resource the actor is permitted to edit.
 */
@Injectable()
export class CreatePresignedUploadUseCase {
  constructor(@Inject(STORAGE_PORT) private readonly storage: StoragePort) {}

  execute(input: CreatePresignedUploadCommand): Promise<PresignedUpload> {
    return this.storage.createPresignedUpload({
      keyPrefix: input.target,
      contentType: input.contentType,
    });
  }
}
