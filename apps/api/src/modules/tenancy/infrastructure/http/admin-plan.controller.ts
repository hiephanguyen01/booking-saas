import { uuidSchema, type PlanResponse } from '@booking/contracts';
import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { UuidParam } from '../../../../shared/openapi/decorators';
import { ZodValidationPipe } from '../../../../shared/validation/zod-validation.pipe';
import { RequirePermissions } from '../../../identity-access/infrastructure/http/decorators/require-permissions.decorator';
import { toPlanResponse } from '../../application/tenancy.mapper';
import { CreatePlanUseCase } from '../../application/use-cases/create-plan.use-case';
import { DeletePlanUseCase } from '../../application/use-cases/delete-plan.use-case';
import { ListPlansUseCase } from '../../application/use-cases/list-plans.use-case';
import { UpdatePlanUseCase } from '../../application/use-cases/update-plan.use-case';
import { CreatePlanDto, PlanResponseDto, UpdatePlanDto } from './dto/tenancy.dto';

/** Platform-admin subscription plans (§19 `/admin/plans`). */
@ApiTags('admin: plans')
@Controller('admin/plans')
export class AdminPlanController {
  constructor(
    private readonly createPlan: CreatePlanUseCase,
    private readonly listPlans: ListPlansUseCase,
    private readonly updatePlan: UpdatePlanUseCase,
    private readonly deletePlan: DeletePlanUseCase,
  ) {}

  @RequirePermissions('platform.plans.manage')
  @Post()
  @ApiOperation({ summary: 'Create a subscription plan' })
  @ApiCreatedResponse({ type: PlanResponseDto })
  async create(@Body() input: CreatePlanDto): Promise<PlanResponse> {
    // A plan that did not exist a moment ago has no subscribers — not a default,
    // a fact; nothing can reference it until it is assigned.
    return toPlanResponse({ plan: await this.createPlan.execute(input), subscriberCount: 0 });
  }

  @RequirePermissions('platform.plans.manage')
  @Get()
  @ApiOperation({ summary: 'List all subscription plans with subscriber count + MRR' })
  @ApiOkResponse({ type: [PlanResponseDto] })
  async list(): Promise<PlanResponse[]> {
    return (await this.listPlans.execute()).map(toPlanResponse);
  }

  @RequirePermissions('platform.plans.manage')
  @Patch(':id')
  @ApiOperation({
    summary: 'Update a subscription plan',
    description:
      'A price change re-prices live subscribers (subscriptions store no price snapshot), so it ' +
      'is refused with 409 PLAN_HAS_SUBSCRIBERS unless repriceExistingSubscribers is true.',
  })
  @UuidParam()
  @ApiOkResponse({ type: PlanResponseDto })
  @ApiConflictResponse({ description: 'PLAN_NAME_TAKEN | PLAN_HAS_SUBSCRIBERS' })
  async update(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body() input: UpdatePlanDto,
  ): Promise<PlanResponse> {
    return toPlanResponse(await this.updatePlan.execute(id, input));
  }

  @RequirePermissions('platform.plans.manage')
  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Delete a subscription plan',
    description:
      'Only a plan nothing references can be deleted. Live subscribers or past subscriptions ' +
      'both yield 409 — deactivate the plan instead.',
  })
  @UuidParam()
  @ApiNoContentResponse()
  @ApiConflictResponse({ description: 'PLAN_HAS_SUBSCRIBERS | PLAN_HAS_SUBSCRIPTION_HISTORY' })
  async remove(@Param('id', new ZodValidationPipe(uuidSchema)) id: string): Promise<void> {
    await this.deletePlan.execute(id);
  }
}
