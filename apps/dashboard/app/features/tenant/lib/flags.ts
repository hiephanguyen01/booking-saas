import { apiPaths } from '~/constants/api-paths';
/**
 * Tenant feature flags (§12.2) — path + read-state derivation, kept out of the
 * route module so both are unit-testable without a server.
 */

/**
 * Where the API actually mounts tenant feature flags: `TenantSettingsController`
 * is `@Controller('tenant')` with `@Get('flags')`/`@Patch('flags')`.
 *
 * This constant exists because that is easy to get wrong: the dashboard used to
 * call `/tenant/settings/flags`, which 404s. The loader swallowed the 404 and fed
 * the Switch a `?? false`, so the toggle rendered "Đang tắt" no matter what the
 * tenant had actually set, and every write 404'd in silence — the marketplace flag
 * was inert in both directions. Read and write MUST use this one constant.
 */
export const TENANT_FLAGS_PATH = apiPaths.tenant.flags;

export interface TenantFlags {
  partnerPromotionsEnabled: boolean;
}

/** The subset of `ApiResult` this derivation needs. */
export interface FlagsReadResult {
  ok: boolean;
  data: TenantFlags | null;
  error?: string;
}

/**
 * The flag as read, or an explicit failure. There is deliberately no "assume off"
 * branch: a flag that could not be read is NOT a flag that is off, and rendering it
 * as off would misreport tenant configuration.
 */
export type PartnerPromotionsState =
  | { ok: true; enabled: boolean }
  | { ok: false; error: string };

export const FLAGS_READ_ERROR = 'Không đọc được cài đặt marketplace. Thử tải lại trang.';

/**
 * Derives the toggle state from the flags read.
 *
 * @param res the API result, or `null` when the caller lacks `tenant.settings.manage`
 *            (the section is hidden entirely — not an error).
 */
export function toPartnerPromotionsState(res: FlagsReadResult | null): PartnerPromotionsState | null {
  if (!res) return null;
  // A 2xx with no body is still a failed read — treat it like any other failure
  // rather than letting `?? false` invent an answer.
  if (!res.ok || !res.data) return { ok: false, error: res.error ?? FLAGS_READ_ERROR };
  return { ok: true, enabled: res.data.partnerPromotionsEnabled === true };
}
