import { Injectable } from '@nestjs/common';
import { Resolver, resolveTxt } from 'node:dns/promises';
import type { IDnsVerifier } from '../../domain/ports/dns-verifier.port';

/** Strip the FQDN dot and case so an answer compares equal to a configured target. */
function normalizeAnswer(value: string): string {
  return value.trim().toLowerCase().replace(/\.$/, '');
}

/**
 * Resolves DNS via the OS resolver; a lookup failure means "not found" — an
 * NXDOMAIN and a resolver timeout are the same answer to the caller (nothing is
 * published yet), and neither is worth a 500.
 *
 * TXT verification runs in a background worker, so it keeps the default resolver
 * timeouts. The two point-at-us lookups run inline in a request the tenant is
 * watching, so they get their own resolver bounded to one 3s try.
 */
@Injectable()
export class NodeDnsVerifier implements IDnsVerifier {
  private readonly resolver = new Resolver({ timeout: 3_000, tries: 1 });

  async hasTxtRecord(name: string, expectedValue: string): Promise<boolean> {
    try {
      const records = await resolveTxt(name);
      // Each record is an array of string chunks that must be concatenated.
      return records.some((chunks) => chunks.join('') === expectedValue);
    } catch {
      return false;
    }
  }

  async resolveCname(hostname: string): Promise<string | null> {
    try {
      const [target] = await this.resolver.resolveCname(hostname);
      return target ? normalizeAnswer(target) : null;
    } catch {
      return null;
    }
  }

  async resolveIpv4(hostname: string): Promise<string[]> {
    try {
      return await this.resolver.resolve4(hostname);
    } catch {
      return [];
    }
  }
}
