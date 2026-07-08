# Task 2.4 — MoMo + VNPay gateway adapters

**Phase:** 2 — Marketplace Depth · **Design refs:** TONG-QUAN.md §11

## Goal
Two more gateways behind the same `PaymentGateway` port — proving the plug-in architecture.

## Scope
- [ ] MoMo adapter: checkout, webhook (signature verify, idempotent), refund capability mapping
- [ ] VNPay adapter: same surface
- [ ] Tenant-level gateway configuration/selection
- [ ] Reconciliation job support for both

## Definition of Done
- Contract test suite (shared across adapters) passes for payos, momo, vnpay, mock
