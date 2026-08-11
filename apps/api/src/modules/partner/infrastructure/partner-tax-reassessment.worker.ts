import { Injectable, Logger, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { ReassessPartnerTaxThresholdUseCase } from '../application/use-cases/reassess-partner-tax-threshold.use-case';

const REASSESS_INTERVAL_MS = 24 * 60 * 60 * 1000;
const BATCH_SIZE = 200;

/** Daily legal-rule/backfill sweep. Each partner is one short RLS transaction. */
@Injectable()
export class PartnerTaxReassessmentWorker implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(PartnerTaxReassessmentWorker.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly reassess: ReassessPartnerTaxThresholdUseCase,
  ) {}

  onModuleInit(): void {
    setTimeout(() => void this.run(), 15_000).unref();
    this.timer = setInterval(() => void this.run(), REASSESS_INTERVAL_MS);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      let cursor: string | undefined;
      do {
        const rows = await this.prisma.admin.partner.findMany({
          where: {
            isHouse: false,
            taxStatus: { in: ['household_below_threshold', 'household_declaring'] },
          },
          select: { id: true, tenantId: true },
          orderBy: { id: 'asc' },
          take: BATCH_SIZE,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        });
        for (const row of rows) {
          try {
            await this.reassess.execute(row.tenantId, row.id);
          } catch (error) {
            this.logger.error(`tax reassessment failed for partner ${row.id}`, error);
          }
        }
        cursor = rows.length === BATCH_SIZE ? rows.at(-1)?.id : undefined;
      } while (cursor);
    } finally {
      this.running = false;
    }
  }
}
