/**
 * Shared type definitions for the BFF HTTP client.
 *
 * These are framework-agnostic — no React Router, no Express, no NestJS.
 * Both dashboard and storefront reference these types.
 */

export interface ApiResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  /** RFC7807 `message` from the backend on error. */
  error?: string;
  /** Field-level errors when the backend returns a zod flatten shape. */
  errors?: Record<string, string[]>;
  /** Stable machine code from the API (e.g. `SLOT_TAKEN`, `VALIDATION_ERROR`). */
  code?: string;
  /** Per-field messages from a zod `VALIDATION_ERROR` (`details.fieldErrors`). */
  fieldErrors?: Record<string, string[]>;
}

export interface ApiAuth {
  /** Backend access token (the `sid` cookie value). */
  token: string;
  /** Backend refresh token (the `rid` cookie value) — enables auto-refresh on 401. */
  refreshToken?: string;
  /** Invoked with rotated tokens after a successful silent refresh. */
  onRefreshed?: (tokens: RefreshedTokens) => void;
  /** Scope headers required by the PermissionsGuard for tenant/partner routes. */
  tenantId?: string;
  partnerId?: string;
}

/** Either a bare access token or the full auth descriptor (for refresh + scope). */
export type Auth = string | ApiAuth;

export interface RefreshedTokens {
  accessToken: string;
  refreshToken: string;
}

export interface BackendLoginResult {
  ok: boolean;
  status: number;
  /** Token values lifted from the backend's Set-Cookie headers. */
  tokens?: RefreshedTokens;
  user?: { id: string };
  /** Backend error code (e.g. ACCOUNT_LOCKED) when !ok. */
  code?: string;
}
