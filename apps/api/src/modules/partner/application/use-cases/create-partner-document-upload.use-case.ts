import type {
  PartnerDocumentUploadInput,
  PrivateDocumentUploadResponse,
} from '@booking/contracts';
import { Inject, Injectable } from '@nestjs/common';
import {
  STORAGE_PORT,
  type StoragePort,
} from '../../../storage/domain/ports/storage.port';
import { partnerDocumentPrefix } from '../../domain/partner-document-key';

@Injectable()
export class CreatePartnerDocumentUploadUseCase {
  constructor(@Inject(STORAGE_PORT) private readonly storage: StoragePort) {}

  async execute(
    partnerId: string,
    input: PartnerDocumentUploadInput,
  ): Promise<PrivateDocumentUploadResponse> {
    const grant = await this.storage.createPrivatePresignedUpload({
      keyPrefix: partnerDocumentPrefix(partnerId),
      contentType: input.contentType,
      contentLength: input.sizeBytes,
      writeOnce: true,
    });

    return {
      ...grant,
      requiredHeaders: {
        'content-type': input.contentType,
        'if-none-match': '*',
      },
    };
  }
}
