import { Body, Controller, HttpCode, Inject, Post } from '@nestjs/common';
import {
  presignUploadInputSchema,
  type PresignUploadInput,
  type PresignUploadResponse,
} from '@booking/shared';
import { ZodValidationPipe } from '../../validation/zod-validation.pipe';
import { AuthenticatedOnly } from '../../../modules/identity-access/infrastructure/http/decorators/authenticated-only.decorator';
import { STORAGE_PORT, type StoragePort } from '../storage.port';

/**
 * Direct-to-storage upload grants (§4.2). Any authenticated actor can mint a
 * presigned PUT URL; the object only becomes visible once its key is attached to
 * a listing/group the actor is allowed to edit (those writes are permission-gated).
 */
@Controller('uploads')
export class UploadController {
  constructor(@Inject(STORAGE_PORT) private readonly storage: StoragePort) {}

  @AuthenticatedOnly()
  @Post('presign')
  @HttpCode(200)
  async presign(
    @Body(new ZodValidationPipe(presignUploadInputSchema)) input: PresignUploadInput,
  ): Promise<PresignUploadResponse> {
    return this.storage.createPresignedUpload({
      keyPrefix: input.target,
      contentType: input.contentType,
    });
  }
}
