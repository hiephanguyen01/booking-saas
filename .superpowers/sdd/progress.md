# SDD progress — dashboard-ux-review

BASE branch-start: faa43ed81a71c3bf438417ae428313db2888790e

Task 1: complete (commits 1a8fd2f..71d0ab7, review clean)
Task 2: complete (commits 71d0ab7..8ec5ef3, review clean after fix pass; MINOR: partner-moderation-actions.tsx:198 'đăng tin đăng' clunky — final-review polish)
Task 3: complete (commits 8ec5ef3..0b99f33, review clean after fix pass: 3 Important + 3 Minor all fixed & verified)
Task 4: complete (commit 9245428, verified by controller — 1-line label)
--- ĐỢT 1 (P0) DONE: Tasks 1-4 ---
Task 5: complete (commit dc62b89, review clean, no findings)
Task 6: complete (commit afe2abf, review clean; MINOR follow-up: add dashboardPaths.tenant.listingGroupReview helper, backfill raw-string links)
Task 7: complete (commit d804e7d, review clean; KNOWN-LIMITATION for PR: partner listing on a deactivated type shows '—' — no /partner/listing-types/:id endpoint)
Task 8: complete (commit 5b2f648, controller-verified diff clean — verbatim code + typecheck-validated enum binding)
Task 9: complete (commits 5b2f648..bf17317, review clean after fix pass)
  FOLLOW-UP (product gap, pre-existing, surface to user): partner group readiness can show 100%/ready while a child lacks a cancellation policy that the TENANT reviewer enforces — partner card doesn't check cancellation_policy. Consider adding that check or keep softened title.
Task 10: complete (commit e7491c0, review clean, no findings)
Task 11: complete (commit bcdcb46, review clean, no findings; added dashboardPaths.partner.newListingGroup helper)
--- ĐỢT 2 DONE: Tasks 5-11 ---
Task 12: complete (commit ebdf9e8, controller-verified: InfoHint matches contract, root TooltipProvider added)
Task 13: complete (commit 7319c91, review clean; StatCard label widened string→ReactNode, verified safe across 16 call sites)
Task 14: complete (commits 7319c91..06c5a20, review clean after fix; also fixed stray EN 'Listing' on admin/tenants/detail.tsx)
Task 15: complete (commit 6a60bf4, review clean; MINOR: calendar-day-grid empty view shows 2 identical 'Chặn lịch' buttons — polish nit for final review)
Task 16: complete (commit 751f600, review clean, no findings; minor: 'webhook' kept as loanword — acceptable)
--- ĐỢT 3 DONE: Tasks 12-16 ---
REMAINING: Task 17 (dedup, P2 cleanup) + Task 18 (merge queue — NEEDS USER DECISION: full-merge chạm-BE vs 18b bước-đệm)
USER DECISION (sửa luôn đi): do Task 17 (dedup) + Task 18b (bước-đệm, NO backend). Full-merge (18) deferred.
Task 17: complete (commit ef9cc10, review clean, no findings; deduped child-row helpers + media-detail-sections; skipped moderation-log & cancellation with sound reasons)
Task 18b: complete (commit 87905ce, review clean, no findings; no status tabs — endpoint has no status param, correct for no-BE scope)
=== ALL TASKS COMPLETE (1-17 + 18b). Next: final whole-branch review + finishing. ===
