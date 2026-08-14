import type {
  NotificationListResponse,
  NotificationResponse,
  NotificationTargetType,
  UnreadCountResponse,
} from '@booking/contracts';
import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UuidParam } from '../../../../shared/openapi/decorators';
import { toPaginated } from '../../../../shared/pagination/pagination';
import { TenantContextService } from '../../../../shared/tenant-context/tenant-context.service';
import type { SessionPrincipal } from '../../../../shared/http/session-principal';
import { AuthenticatedOnly } from '../../../../shared/http/authenticated-only.decorator';
import { CurrentPrincipal } from '../../../../shared/http/current-principal.decorator';
import { CountUnreadNotificationsUseCase } from '../../application/use-cases/count-unread-notifications.use-case';
import { ListNotificationsUseCase } from '../../application/use-cases/list-notifications.use-case';
import { MarkAllNotificationsReadUseCase } from '../../application/use-cases/mark-all-notifications-read.use-case';
import { MarkNotificationReadUseCase } from '../../application/use-cases/mark-notification-read.use-case';
import type { InboxRowRecord } from '../../domain/ports/notification-inbox-repository.port';
import { ResolveNotificationTenantContextGuard } from './guards/resolve-notification-tenant-context.guard';
import {
  MarkAllNotificationsReadDto,
  NotificationListResponseDto,
  NotificationsQueryDto,
  UnreadCountResponseDto,
} from './dto/notification.dto';

/**
 * The caller's own in-app inbox. `@AuthenticatedOnly` throughout: reading your
 * own mail is not an RBAC question, and inventing a permission key would force
 * a seed run on every environment. The recipient always comes from the session
 * principal, never from a parameter.
 */
@ApiTags('notifications')
@Controller('notifications')
@UseGuards(ResolveNotificationTenantContextGuard)
export class NotificationController {
  constructor(
    private readonly listNotifications: ListNotificationsUseCase,
    private readonly countUnread: CountUnreadNotificationsUseCase,
    private readonly markRead: MarkNotificationReadUseCase,
    private readonly markAllRead: MarkAllNotificationsReadUseCase,
    private readonly tenantContext: TenantContextService,
  ) {}

  @AuthenticatedOnly()
  @Get()
  @ApiOperation({ summary: 'One page of the caller own notifications for an area' })
  @ApiOkResponse({ type: NotificationListResponseDto })
  async list(
    @Query() query: NotificationsQueryDto,
    @CurrentPrincipal() principal: SessionPrincipal,
  ): Promise<NotificationListResponse> {
    const page = await this.listNotifications.execute(
      this.tenantContext.tenantIdOrThrow(),
      principal.userId,
      query,
    );
    return toPaginated(query, page, toNotificationResponse);
  }

  @AuthenticatedOnly()
  @Get('unread-count')
  @ApiOperation({ summary: 'Unread count for one area — the dashboard poll' })
  @ApiOkResponse({ type: UnreadCountResponseDto })
  async unreadCount(
    @Query() query: NotificationsQueryDto,
    @CurrentPrincipal() principal: SessionPrincipal,
  ): Promise<UnreadCountResponse> {
    return {
      count: await this.countUnread.execute(
        this.tenantContext.tenantIdOrThrow(),
        principal.userId,
        query.area,
      ),
    };
  }

  @AuthenticatedOnly()
  @Post(':id/read')
  @UuidParam()
  @HttpCode(204)
  @ApiOperation({ summary: 'Mark one of the caller own notifications read' })
  @ApiNoContentResponse()
  async read(
    @Param('id') id: string,
    @CurrentPrincipal() principal: SessionPrincipal,
  ): Promise<void> {
    await this.markRead.execute(this.tenantContext.tenantIdOrThrow(), principal.userId, id);
  }

  @AuthenticatedOnly()
  @Post('read-all')
  @HttpCode(204)
  @ApiOperation({ summary: 'Mark every unread notification in one area read' })
  @ApiNoContentResponse()
  async readAll(
    @Body() input: MarkAllNotificationsReadDto,
    @CurrentPrincipal() principal: SessionPrincipal,
  ): Promise<void> {
    await this.markAllRead.execute(
      this.tenantContext.tenantIdOrThrow(),
      principal.userId,
      input.area,
    );
  }
}

function toNotificationResponse(row: InboxRowRecord): NotificationResponse {
  return {
    id: row.id,
    area: row.area,
    eventType: row.eventType,
    title: row.title,
    body: row.body,
    targetType: row.targetType as NotificationTargetType,
    targetId: row.targetId,
    readAt: row.readAt ? row.readAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}
