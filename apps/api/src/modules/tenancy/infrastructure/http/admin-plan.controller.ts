import { Body, Controller, Get, Post } from '@nestjs/common';
import {
  createPlanInputSchema,
  type CreatePlanInput,
  type PlanResponse,
} from '@booking/shared';
import { ZodValidationPipe } from '../../../../shared/validation/zod-validation.pipe';
import { RequirePermissions } from '../../../identity-access/infrastructure/http/decorators/require-permissions.decorator';
import { CreatePlanUseCase } from '../../application/use-cases/create-plan.use-case';
import { ListPlansUseCase } from '../../application/use-cases/list-plans.use-case';
import { toPlanResponse } from '../../application/tenancy.mapper';

/** Platform-admin subscription plans (§19 `/admin/plans`). */
@Controller('admin/plans')
export class AdminPlanController {
  constructor(
    private readonly createPlan: CreatePlanUseCase,
    private readonly listPlans: ListPlansUseCase,
  ) {}

  @RequirePermissions('platform.plans.manage')
  @Post()
  async create(
    @Body(new ZodValidationPipe(createPlanInputSchema)) input: CreatePlanInput,
  ): Promise<PlanResponse> {
    return toPlanResponse(await this.createPlan.execute(input));
  }

  @RequirePermissions('platform.plans.manage')
  @Get()
  async list(): Promise<PlanResponse[]> {
    return (await this.listPlans.execute()).map(toPlanResponse);
  }
}
