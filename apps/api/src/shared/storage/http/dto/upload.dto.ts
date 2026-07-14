import { createZodDto } from 'nestjs-zod';
import { presignUploadInputSchema, presignUploadResponseSchema } from '@booking/shared';

export class PresignUploadDto extends createZodDto(presignUploadInputSchema) {}
export class PresignUploadResponseDto extends createZodDto(presignUploadResponseSchema) {}
