import type { Locale } from '@booking/contracts';
import { LegalDefaultLocaleRequired, LegalTranslationImmutable } from '../errors/legal-errors';

export interface VersionSnapshot {
  versionNo: number;
  publishedAt: Date | null;
  isMaterialChange: boolean;
  locales: readonly string[];
}

export class LegalDocument {
  /** Every publish creates a new row — cosmetic or material alike. */
  static nextVersionNo(versions: readonly VersionSnapshot[]): number {
    return versions.reduce((max, v) => Math.max(max, v.versionNo), 0) + 1;
  }

  /** The gate keys on the default locale, so a draft without it cannot publish. */
  static assertPublishable(draftLocales: readonly string[], defaultLocale: Locale): void {
    if (!draftLocales.includes(defaultLocale)) throw new LegalDefaultLocaleRequired();
  }

  /**
   * Adding a locale a published version never had is allowed — nobody has read
   * it. Editing one that exists is not: someone may have accepted against that
   * exact text, and the whole point of storing an acceptance is being able to
   * reproduce what was on screen.
   */
  static assertTranslationEditable(
    publishedAt: Date | null,
    existingLocales: readonly string[],
    locale: Locale,
  ): void {
    if (publishedAt && existingLocales.includes(locale)) throw new LegalTranslationImmutable();
  }

  /** Re-acceptance bar: the newest MATERIAL version, not the newest version. */
  static materialWatermark(versions: readonly VersionSnapshot[]): number {
    return versions
      .filter((v) => v.publishedAt !== null && v.isMaterialChange)
      .reduce((max, v) => Math.max(max, v.versionNo), 0);
  }
}
