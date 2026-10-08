import { Global, Injectable, Module } from '@nestjs/common';
import type { AutomationEvent, WebhookEvent } from '@staffos/shared';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

export type DomainEventName = AutomationEvent | WebhookEvent;
export type DomainEventHandler = (payload: Record<string, unknown>) => Promise<void>;

/**
 * In-process domain events (e.g. INVOICE_ISSUED). Emit only after the change has committed.
 * The automations and webhooks modules subscribe; a failing subscriber is logged and never
 * affects the emitter (CLAUDE.md §7).
 */
@Injectable()
export class DomainEventsService {
  private readonly handlers = new Map<DomainEventName, DomainEventHandler[]>();

  constructor(@InjectPinoLogger(DomainEventsService.name) private readonly logger: PinoLogger) {}

  on(event: DomainEventName, handler: DomainEventHandler): void {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]);
  }

  async emit(event: DomainEventName, payload: Record<string, unknown>): Promise<void> {
    this.logger.info({ event, ...payload }, 'Domain event');
    for (const handler of this.handlers.get(event) ?? []) {
      try {
        await handler(payload);
      } catch (err) {
        this.logger.error({ err, event }, 'Domain event handler failed');
      }
    }
  }
}

@Global()
@Module({ providers: [DomainEventsService], exports: [DomainEventsService] })
export class DomainEventsModule {}
