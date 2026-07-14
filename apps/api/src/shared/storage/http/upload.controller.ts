import { type PresignUploadResponse } from '@booking/contracts';
import { Body, Controller, HttpCode, Inject, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthenticatedOnly } from '../../../modules/identity-access/infrastructure/http/decorators/authenticated-only.decorator';
import { STORAGE_PORT, type StoragePort } from '../storage.port';
import { PresignUploadDto, PresignUploadResponseDto } from './dto/upload.dto';

/**
 * Direct-to-storage upload grants (§4.2). Any authenticated actor can mint a
 * presigned PUT URL; the object only becomes visible once its key is attached to
 * a listing/group the actor is allowed to edit (those writes are permission-gated).
 */
@ApiTags('uploads')
@Controller('uploads')
export class UploadController {
  constructor(@Inject(STORAGE_PORT) private readonly storage: StoragePort) {}

  @AuthenticatedOnly()
  @Post('presign')
  @HttpCode(200)
  @ApiOperation({ summary: 'Mint a presigned PUT URL for a direct-to-storage upload' })
  @ApiOkResponse({ type: PresignUploadResponseDto })
  async presign(@Body() input: PresignUploadDto): Promise<PresignUploadResponse> {
    return this.storage.createPresignedUpload({
      keyPrefix: input.target,
      contentType: input.contentType,
    });
  }
}
