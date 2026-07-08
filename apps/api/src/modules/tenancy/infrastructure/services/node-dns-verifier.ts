import { Injectable } from '@nestjs/common';
import { promises as dns } from 'node:dns';
import type { IDnsVerifier } from '../../domain/ports/dns-verifier.port';

/** Resolves TXT records via the OS resolver; a lookup failure means "not found". */
@Injectable()
export class NodeDnsVerifier implements IDnsVerifier {
  async hasTxtRecord(name: string, expectedValue: string): Promise<boolean> {
    try {
      const records = await dns.resolveTxt(name);
      // Each record is an array of string chunks that must be concatenated.
      return records.some((chunks) => chunks.join('') === expectedValue);
    } catch {
      return false;
    }
  }
}
