# Task 2.7 — In-app chat customer↔partner

**Phase:** 2 — Marketplace Depth · **Design refs:** TONG-QUAN.md §7 (anti-disintermediation)

## Goal
Customers and partners communicate in-app, reducing the pull toward Zalo (disintermediation risk #1).

## Scope
- [ ] Conversation per booking (or per listing inquiry); message store + unread counts
- [ ] Real-time delivery (SSE/WebSocket) + email fallback notification
- [ ] Contact-info masking policy pre-confirmation, consistent with listing scanning rules
- [ ] Moderation/report hooks for tenant

## Definition of Done
- Chat works across storefront and partner dashboard; pre-confirmation messages with phone numbers are flagged/masked
