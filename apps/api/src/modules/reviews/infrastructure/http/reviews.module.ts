import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../../shared/prisma/prisma.module';
import { TenantContextModule } from '../../../../shared/tenant-context/tenant-context.module';
import { ADMIN_REVIEW_READER } from '../../domain/ports/admin-review-reader.port';
import { REVIEW_REPOSITORY } from '../../domain/ports/review-repository.port';
import { REVIEW_TENANT_READER } from '../../domain/ports/review-tenant-reader.port';
import { CreateReviewUseCase } from '../../application/use-cases/create-review.use-case';
import { ListAdminReviewsUseCase } from '../../application/use-cases/list-admin-reviews.use-case';
import { ListCustomerReviewsUseCase } from '../../application/use-cases/list-customer-reviews.use-case';
import { ListPartnerReviewsUseCase } from '../../application/use-cases/list-partner-reviews.use-case';
import { ListPublicReviewsUseCase } from '../../application/use-cases/list-public-reviews.use-case';
import { ListTenantReviewsUseCase } from '../../application/use-cases/list-tenant-reviews.use-case';
import { ReplyReviewUseCase } from '../../application/use-cases/reply-review.use-case';
import { PrismaAdminReviewReader } from '../repositories/prisma-admin-review.reader';
import { PrismaReviewRepository } from '../repositories/prisma-review.repository';
import { PrismaReviewTenantReader } from '../repositories/prisma-review-tenant.reader';
import { AdminReviewController } from './admin-review.controller';
import { CustomerReviewController } from './customer-review.controller';
import { PartnerReviewController } from './partner-review.controller';
import { PublicReviewController } from './public-review.controller';
import { TenantReviewController } from './tenant-review.controller';

@Module({
  imports: [PrismaModule, TenantContextModule],
  controllers: [
    PublicReviewController,
    CustomerReviewController,
    PartnerReviewController,
    TenantReviewController,
    AdminReviewController,
  ],
  providers: [
    { provide: REVIEW_REPOSITORY, useClass: PrismaReviewRepository },
    { provide: REVIEW_TENANT_READER, useClass: PrismaReviewTenantReader },
    { provide: ADMIN_REVIEW_READER, useClass: PrismaAdminReviewReader },
    CreateReviewUseCase,
    ListCustomerReviewsUseCase,
    ListPublicReviewsUseCase,
    ListPartnerReviewsUseCase,
    ListTenantReviewsUseCase,
    ListAdminReviewsUseCase,
    ReplyReviewUseCase,
  ],
})
export class ReviewsModule {}
