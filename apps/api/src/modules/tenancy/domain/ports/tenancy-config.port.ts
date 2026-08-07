export const TENANCY_CONFIG = Symbol('TENANCY_CONFIG');

export interface TenancyConfig {
  /** Base domain for auto-provisioned tenant subdomains, e.g. `bookingos.vn`. */
  baseDomain: string;
  /**
   * Hostname a tenant points a *subdomain* at with a CNAME, e.g.
   * `connect.stg.bookingos.vn`. It is only a CNAME target — it is not a tenant
   * domain and never terminates TLS itself.
   */
  storefrontCname: string;
  /**
   * Public IPv4 a tenant points an *apex* domain at with an A record. Apex
   * records cannot be CNAMEs, and using the tenant's own root domain is common
   * here, so both targets have to be published.
   */
  storefrontIpv4: string;
}
