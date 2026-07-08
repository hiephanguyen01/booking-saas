import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Two connection pools per TONG-QUAN.md §6.3:
 *  - `app`   → Postgres role `app_user`, bound by RLS (FORCE) — all tenant-scoped work
 *  - `admin` → Postgres role `app_admin`, BYPASSRLS — platform admin, workers,
 *              cross-tenant lookups (e.g. webhook txn → tenant resolution)
 */
@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  readonly app: PrismaClient;
  readonly admin: PrismaClient;

  constructor() {
    this.app = new PrismaClient({
      datasources: { db: { url: process.env.DATABASE_URL } },
    });
    this.admin = new PrismaClient({
      datasources: { db: { url: process.env.ADMIN_DATABASE_URL } },
    });
  }

  async onModuleInit() {
    await Promise.all([this.app.$connect(), this.admin.$connect()]);
  }

  async onModuleDestroy() {
    await Promise.all([this.app.$disconnect(), this.admin.$disconnect()]);
  }
}
