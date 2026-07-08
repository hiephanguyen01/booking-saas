import { Injectable } from '@nestjs/common';
import type { OutboxHandler } from './outbox.types';

/**
 * Modules subscribe to domain events here (e.g. finance listens to
 * BookingCompleted) — never by calling each other's services directly.
 */
@Injectable()
export class OutboxHandlerRegistry {
  private readonly handlers = new Map<string, OutboxHandler[]>();

  register(eventType: string, handler: OutboxHandler): void {
    const list = this.handlers.get(eventType) ?? [];
    list.push(handler);
    this.handlers.set(eventType, list);
  }

  handlersFor(eventType: string): OutboxHandler[] {
    return this.handlers.get(eventType) ?? [];
  }
}
