export const TENANCY_CONFIG = Symbol('TENANCY_CONFIG');

export interface TenancyConfig {
  /** Base domain for auto-provisioned tenant subdomains, e.g. `bookingos.vn`. */
  baseDomain: string;
}
