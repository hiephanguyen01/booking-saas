import { Global, Module } from '@nestjs/common';
import { OutboxHandlerRegistry } from './outbox-handler.registry';
import { OutboxRelayWorker } from './outbox-relay.worker';
import { OutboxService } from './outbox.service';

@Global()
@Module({
  providers: [OutboxService, OutboxHandlerRegistry, OutboxRelayWorker],
  exports: [OutboxService, OutboxHandlerRegistry],
})
export class OutboxModule {}
