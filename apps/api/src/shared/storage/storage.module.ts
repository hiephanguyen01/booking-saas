import { Global, Module } from '@nestjs/common';
import { STORAGE_PORT } from './storage.port';
import { S3StorageService, s3ConfigFromEnv } from './s3-storage.service';
import { CreatePresignedUploadUseCase } from './application/create-presigned-upload.use-case';
import { UploadController } from './http/upload.controller';

/**
 * Object storage (§4.2). Global so any module can inject STORAGE_PORT to presign
 * uploads. The MinIO/S3 config is read from env at boot.
 */
@Global()
@Module({
  controllers: [UploadController],
  providers: [
    { provide: STORAGE_PORT, useFactory: () => new S3StorageService(s3ConfigFromEnv()) },
    CreatePresignedUploadUseCase,
  ],
  exports: [STORAGE_PORT],
})
export class StorageModule {}
