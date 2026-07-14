import { type PlanResponse } from '@booking/contracts';
import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../../identity-access/infrastructure/http/decorators/require-permissions.decorator';
import { toPlanResponse } from '../../application/tenancy.mapper';
import { CreatePlanUseCase } from '../../application/use-cases/create-plan.use-case';
import { ListPlansUseCase } from '../../application/use-cases/list-plans.use-case';
import { CreatePlanDto, PlanResponseDto } from './dto/tenancy.dto';

/** Platform-admin subscription plans (§19 `/admin/plans`). */
@ApiTags('admin: plans')
@Controller('admin/plans')
export class AdminPlanController {
  constructor(
    private readonly createPlan: CreatePlanUseCase,
    private readonly listPlans: ListPlansUseCase,
  ) {}

  @RequirePermissions('platform.plans.manage')
  @Post()
  @ApiOperation({ summary: 'Create a subscription plan' })
  @ApiCreatedResponse({ type: PlanResponseDto })
  async create(@Body() input: CreatePlanDto): Promise<PlanResponse> {
    return toPlanResponse(await this.createPlan.execute(input));
  }

  @RequirePermissions('platform.plans.manage')
  @Get()
  @ApiOperation({ summary: 'List all subscription plans' })
  @ApiOkResponse({ type: [PlanResponseDto] })
  async list(): Promise<PlanResponse[]> {
    return (await this.listPlans.execute()).map(toPlanResponse);
  }
}
