import { Injectable } from '@nestjs/common';
import {
  paymentMethodRouteSchema,
  type CustomerPaymentMethod,
  type GatewayKey,
  type PaymentMethodRoute,
} from '@booking/contracts';
import type { PaymentGateway, TenantPaymentMethodRoute } from '@prisma/client';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type { IPaymentMethodRouteRepository } from '../../domain/ports/payment-method-route-repository.port';

@Injectable()
export class PrismaPaymentMethodRouteRepository implements IPaymentMethodRouteRepository {
  private toRecord(row: TenantPaymentMethodRoute): PaymentMethodRoute {
    return paymentMethodRouteSchema.parse({
      method: row.method,
      gateway: row.gateway,
      enabled: row.enabled,
    });
  }

  async list(tx: PrismaTx, tenantId: string): Promise<PaymentMethodRoute[]> {
    const rows = await tx.tenantPaymentMethodRoute.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((row) => this.toRecord(row));
  }

  async findEnabledByMethod(
    tx: PrismaTx,
    tenantId: string,
    method: CustomerPaymentMethod,
  ): Promise<PaymentMethodRoute | null> {
    const row = await tx.tenantPaymentMethodRoute.findUnique({
      where: { tenantId_method: { tenantId, method } },
    });
    return row?.enabled ? this.toRecord(row) : null;
  }

  async replaceAll(
    tx: PrismaTx,
    tenantId: string,
    routes: PaymentMethodRoute[],
  ): Promise<PaymentMethodRoute[]> {
    const methods = routes.map((route) => route.method);
    await tx.tenantPaymentMethodRoute.deleteMany({
      where: {
        tenantId,
        ...(methods.length > 0 ? { method: { notIn: methods } } : {}),
      },
    });

    for (const route of routes) {
      await tx.tenantPaymentMethodRoute.upsert({
        where: { tenantId_method: { tenantId, method: route.method } },
        create: {
          tenantId,
          method: route.method,
          gateway: route.gateway as PaymentGateway,
          enabled: route.enabled,
        },
        update: {
          gateway: route.gateway as PaymentGateway,
          enabled: route.enabled,
        },
      });
    }
    return this.list(tx, tenantId);
  }

  async hasConfiguredRoutes(tx: PrismaTx, tenantId: string): Promise<boolean> {
    return (await tx.tenantPaymentMethodRoute.count({ where: { tenantId } })) > 0;
  }

  async listEffective(
    tx: PrismaTx,
    tenantId: string,
    activeGateways: ReadonlySet<GatewayKey>,
  ): Promise<PaymentMethodRoute[]> {
    return (await this.list(tx, tenantId)).filter(
      (route) => route.enabled && activeGateways.has(route.gateway),
    );
  }
}
