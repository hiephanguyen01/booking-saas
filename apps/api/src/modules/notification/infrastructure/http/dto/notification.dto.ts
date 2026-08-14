import { createZodDto } from 'nestjs-zod';
import {
  markAllNotificationsReadInputSchema,
  notificationListResponseSchema,
  notificationsQuerySchema,
  unreadCountResponseSchema,
} from '@booking/contracts';

export class NotificationsQueryDto extends createZodDto(notificationsQuerySchema) {}
export class MarkAllNotificationsReadDto extends createZodDto(markAllNotificationsReadInputSchema) {}
export class NotificationListResponseDto extends createZodDto(notificationListResponseSchema) {}
export class UnreadCountResponseDto extends createZodDto(unreadCountResponseSchema) {}
