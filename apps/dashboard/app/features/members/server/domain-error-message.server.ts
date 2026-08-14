import type { ApiResult } from '~/lib/api.server';

/**
 * Vietnamese copy for the backend `DomainError` codes the tenant AND partner
 * staff/role write paths can come back with (`tenant-member.controller.ts` /
 * `tenant-role.controller.ts` / `partner-member.controller.ts`). Both tiers'
 * `*-actions.server.ts` route every write intent's failure branch through
 * this ONE table rather than each growing its own — a raw `res.error` is
 * `DomainError.message` straight from the backend (English), unreadable on
 * these Vietnamese-hardcoded screens.
 *
 * Moved here out of `features/tenant/server/members-actions.server.ts` when
 * the partner tier (Task 7) needed the identical mapping — the codes below
 * are shared by both controllers' use-cases, so a second copy would have had
 * to repeat itself or drift. Several codes are only reachable from more than
 * one intent (`LAST_MANAGER_REMOVED` from `update-role`, `set-roles` and
 * `remove-member`; `ROLE_NOT_FOUND` from `invite`, `set-roles` and
 * `update-role`).
 *
 *  - `LAST_MANAGER_REMOVED` (409): the write would strip the "manage
 *    members"/"manage roles" permission from the last person who holds it —
 *    the tenant/partner would lock itself out of its own staff/role
 *    management. The operator needs to understand *that* consequence, not
 *    see a generic "save failed".
 *  - `SYSTEM_ROLE_IMMUTABLE` (409): defensive only — no form in either tier
 *    ever targets a system role, so this is normally unreachable, but a
 *    stale tab or a direct POST should still get a readable answer instead
 *    of the raw English message.
 *  - `ROLE_IN_USE` (409, tenant-tier delete-role only): the tenant
 *    `roles-table.tsx` already disables "Xóa" once `memberCount > 0`, so
 *    this should be rare — a member joined the role between page load and
 *    this click — but when the backend does refuse (the FK cascade would
 *    otherwise silently strip every holder), the operator sees exactly how
 *    many people are affected, read from the error's `details.memberCount`,
 *    never a raw English sentence.
 *  - `CANNOT_EDIT_SELF` (409, set-roles/remove-member): the signed-in user's
 *    own row hides these actions (`members-table.tsx`), so this is normally
 *    unreachable too — same defensive reasoning as `SYSTEM_ROLE_IMMUTABLE`.
 *  - `PERMISSION_ESCALATION` (400, invite/set-roles): the caller tried to
 *    grant a permission they do not themselves hold.
 *  - `INVITATION_ALREADY_PENDING` (409, invite): the email already has an
 *    unexpired, unrevoked invitation outstanding.
 *  - `ROLE_NOT_FOUND` / `MEMBER_NOT_FOUND` / `INVITATION_NOT_PENDING` (404/409):
 *    the target row was deleted, removed, or resolved by someone else between
 *    page load and this submit.
 *
 * A code with no case here (or no `res.code` at all — a network/transport
 * failure) falls back to `fallback`, which is always a readable Vietnamese
 * sentence, never a blank.
 */
export function domainErrorMessage(res: ApiResult<unknown>, fallback: string): string {
  switch (res.code) {
    case 'LAST_MANAGER_REMOVED':
      return 'Không thể lưu — thao tác này sẽ gỡ quyền "Quản lý nhân sự" khỏi người cuối cùng còn giữ quyền đó, khiến việc tự quản lý nhân sự bị mất. Hãy giữ lại quyền này cho ít nhất một người.';
    case 'SYSTEM_ROLE_IMMUTABLE':
      return 'Vai trò hệ thống không thể chỉnh sửa hoặc xoá.';
    case 'ROLE_IN_USE': {
      const memberCount = res.details?.memberCount;
      return typeof memberCount === 'number'
        ? `Không thể xoá — vai trò này đang được ${memberCount} thành viên sử dụng. Hãy gỡ vai trò khỏi họ trước.`
        : 'Không thể xoá — vai trò này vẫn đang được thành viên sử dụng.';
    }
    case 'CANNOT_EDIT_SELF':
      return 'Bạn không thể tự sửa vai trò hoặc tự gỡ chính mình.';
    case 'PERMISSION_ESCALATION':
      return 'Bạn không thể cấp quyền mà chính mình không có.';
    case 'INVITATION_ALREADY_PENDING':
      return 'Địa chỉ email này đã có một lời mời đang chờ xử lý.';
    case 'ROLE_NOT_FOUND':
      return 'Không tìm thấy vai trò này — có thể đã bị xoá.';
    case 'MEMBER_NOT_FOUND':
      return 'Không tìm thấy thành viên này — có thể đã bị gỡ.';
    case 'INVITATION_NOT_PENDING':
      return 'Lời mời này không còn hiệu lực.';
    default:
      return res.error ?? fallback;
  }
}
