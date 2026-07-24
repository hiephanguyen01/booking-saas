import { Inject, Injectable } from '@nestjs/common';
import type { UpdateGatewayPaymentSettingsInput } from '@booking/contracts';
import { TenantContextService } from '../../../../shared/tenant-context/tenant-context.service';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { AUDIT_WRITER, type IAuditWriter } from '../../../../shared/audit/audit-writer.port';
import { TenantGatewayConfigs } from '../../domain/entities/tenant-gateway-configs.entity';
import { GatewayConfigNotFound } from '../../domain/errors/gateway-config-errors';
import {
  GATEWAY_CONFIG_REPOSITORY,
  type GatewayConfigRecord,
  type IGatewayConfigRepository,
} from '../../domain/ports/gateway-config-repository.port';

/** Update non-secret checkout/refund policy without forcing a credential rotation. */
@Injectable()
export class UpdateGatewayPaymentSettingsUseCase {
  constructor(
    @Inject(GATEWAY_CONFIG_REPOSITORY) private readonly configs: IGatewayConfigRepository,
    @Inject(AUDIT_WRITER) private readonly audit: IAuditWriter,
    private readonly tenantContext: TenantContextService,
    private readonly tenantDb: TenantDbService,
  ) {}

  execute(
    input: UpdateGatewayPaymentSettingsInput,
    actorUserId: string | null,
  ): Promise<GatewayConfigRecord> {
    const tenantId = this.tenantContext.tenantIdOrThrow();
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      TenantGatewayConfigs.assertMethodsSupported(input.gateway, input.enabledMethods);
      const updated = await this.configs.updateSettings(tx, tenantId, input.gateway, {
        enabledMethods: input.enabledMethods,
        refundStrategy: input.refundStrategy,
        manualRefundSlaHours: input.manualRefundSlaHours,
      });
      if (!updated) {
        throw new GatewayConfigNotFound();
      }
      await this.audit.write(tx, {
        tenantId,
        actorUserId,
        action: 'payment.settings_updated',
        entityType: 'tenant_gateway_config',
        entityId: updated.id,
        data: input,
      });
      return updated;
    });
  }
}
