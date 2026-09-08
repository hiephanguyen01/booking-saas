import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import type Redis from 'ioredis';
import { Public } from '../../modules/identity-access/infrastructure/http/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS } from '../redis/redis.module';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Liveness probe' })
  @ApiOkResponse({ schema: { properties: { status: { type: 'string', example: 'ok' } } } })
  liveness() {
    return { status: 'ok' };
  }

  @Public()
  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe (DB + Redis with latency measurement)' })
  @ApiOkResponse({
    schema: {
      properties: {
        status: { type: 'string', example: 'ok' },
        db: { type: 'string', example: 'up' },
        redis: { type: 'string', example: 'up' },
        dbLatencyMs: { type: 'number', example: 2 },
        redisLatencyMs: { type: 'number', example: 1 },
      },
    },
  })
  @ApiServiceUnavailableResponse({ description: 'DB or Redis is down' })
  async readiness() {
    let dbLatencyMs: number | undefined;
    let redisLatencyMs: number | undefined;

    const startDb = Date.now();
    const dbPromise = this.prisma.admin.$queryRaw`SELECT 1`.then(() => {
      dbLatencyMs = Date.now() - startDb;
    });

    const startRedis = Date.now();
    const redisPromise = this.redis.ping().then(() => {
      redisLatencyMs = Date.now() - startRedis;
    });

    const [db, redis] = await Promise.allSettled([dbPromise, redisPromise]);
    const result = {
      db: db.status === 'fulfilled' ? 'up' : 'down',
      redis: redis.status === 'fulfilled' ? 'up' : 'down',
      ...(dbLatencyMs !== undefined ? { dbLatencyMs } : {}),
      ...(redisLatencyMs !== undefined ? { redisLatencyMs } : {}),
    };
    if (result.db === 'down' || result.redis === 'down') {
      throw new ServiceUnavailableException(result);
    }
    return { status: 'ok', ...result };
  }
}
