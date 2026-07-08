import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import type Redis from 'ioredis';
import { Public } from '../../modules/identity-access/infrastructure/http/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS } from '../redis/redis.module';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  @Public()
  @Get()
  liveness() {
    return { status: 'ok' };
  }

  @Public()
  @Get('ready')
  async readiness() {
    const [db, redis] = await Promise.allSettled([
      this.prisma.admin.$queryRaw`SELECT 1`,
      this.redis.ping(),
    ]);
    const result = {
      db: db.status === 'fulfilled' ? 'up' : 'down',
      redis: redis.status === 'fulfilled' ? 'up' : 'down',
    };
    if (result.db === 'down' || result.redis === 'down') {
      throw new ServiceUnavailableException(result);
    }
    return { status: 'ok', ...result };
  }
}
