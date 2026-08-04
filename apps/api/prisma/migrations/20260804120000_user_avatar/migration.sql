-- Signed-in users can set a profile photo from the storefront account centre.
-- Stores the presign `publicUrl` (§4.2), same as listing photos and partner logos.
-- `users` is a global (non-tenant) table with no RLS policy, so adding a nullable
-- column needs no policy change.

ALTER TABLE "users"
  ADD COLUMN "avatar_url" TEXT;
