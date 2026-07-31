import type { Locale } from '@booking/contracts';

export interface ResolvedLegalLocale {
  locale: Locale;
  fellBack: boolean;
}

/**
 * One rule, used by the public page AND every consent gate: the requested
 * locale, else the tenant default (which the gate guarantees exists). A contract
 * silently appearing in the wrong language is how someone ends up agreeing to
 * something they could not read, so the caller must surface `fellBack`.
 */
export function resolveLegalLocale(
  requested: Locale,
  defaultLocale: Locale,
  available: readonly string[],
): ResolvedLegalLocale {
  if (available.includes(requested)) return { locale: requested, fellBack: false };
  if (available.includes(defaultLocale)) return { locale: defaultLocale, fellBack: true };
  const first = available[0];
  if (!first) throw new Error('resolveLegalLocale: version has no translations');
  return { locale: first as Locale, fellBack: first !== requested };
}
