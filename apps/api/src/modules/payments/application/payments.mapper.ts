import type { GatewayConfigResponse } from '@booking/contracts';
import type { GatewayConfigRecord } from '../domain/ports/gateway-config-repository.port';

/**
 * Public shape of a stored gateway config (§11.1). Credentials are never exposed;
 * a stored config is active by definition (there is no disabled state on the record).
 */
export function toGatewayConfigResponse(config: GatewayConfigRecord): GatewayConfigResponse {
  return { gateway: config.gateway, environment: config.environment, isActive: true };
}
