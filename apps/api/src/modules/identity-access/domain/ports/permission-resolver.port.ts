export const PERMISSION_RESOLVER = Symbol('PERMISSION_RESOLVER');

export interface PermissionScope {
  tenantId?: string;
  partnerId?: string;
}

export interface IPermissionResolver {
  /** All permission keys the user holds within the given scope. */
  resolve(userId: string, scope: PermissionScope): Promise<Set<string>>;
  /** Drops cached permissions (called on role/assignment changes). */
  invalidate(userId: string): Promise<void>;
}
