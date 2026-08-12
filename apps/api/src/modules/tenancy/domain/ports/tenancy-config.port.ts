export const TENANCY_CONFIG = Symbol('TENANCY_CONFIG');

export interface TenancyConfig {
  /** Base domain for auto-provisioned tenant subdomains, e.g. `bookingos.vn`. */
  baseDomain: string;
  /**
   * Hostname a tenant points a *subdomain* at with a CNAME, e.g.
   * `connect.stg.bookingos.vn`. It is only a CNAME target — it is not a tenant
   * domain and never terminates TLS itself.
   *
   * Named for the storefront, but correct for a console host too: both surfaces
   * sit behind the same ingress, so both point here. The env var
   * (`PLATFORM_STOREFRONT_CNAME`) is deliberately not renamed — that is a real
   * ops step on a running stack, bought for nothing but a tidier name.
   */
  storefrontCname: string;
  /**
   * Public IPv4 a tenant points an *apex* domain at with an A record. Apex
   * records cannot be CNAMEs, and using the tenant's own root domain is common
   * here, so both targets have to be published. Shared with console hosts for the
   * same reason as `storefrontCname`.
   */
  storefrontIpv4: string;
}
