import { PrismaClient } from '@prisma/client';

/**
 * One client for the whole seed, on the MIGRATE connection: it bypasses RLS, so
 * the seed may write across tenants. Never reuse this in application code.
 */
export const prisma = new PrismaClient({
  datasources: { db: { url: process.env.MIGRATE_DATABASE_URL } },
});
