### Task 4: Làm rõ action label mập mờ ở tenant listings queue

**Files:**
- Modify: `apps/dashboard/app/routes/tenant/listings/_index.tsx:142-153`

**Interfaces:** — (chỉ nhãn nút)

- [ ] **Step 1: Đổi nhãn "Xem" → rõ nghĩa**

Nút hiện: `pending_review` → "Duyệt" (ClipboardCheck), else "Xem" (Eye) — cả hai vào `/review` (nơi có thể publish/hide). Đổi nhánh else thành `"Xem & xử lý"` (giữ icon Eye) để lộ rằng trang đích cũng để thao tác kiểm duyệt. Giữ nhánh "Duyệt" cho `pending_review`.

- [ ] **Step 2: Verify + Commit**

```bash
pnpm turbo lint typecheck build --filter=@booking/dashboard
git add apps/dashboard/app/routes/tenant/listings/_index.tsx
git commit -m "fix(dashboard): làm rõ nút 'Xem & xử lý' ở queue duyệt tin đăng"
```

---

# ĐỢT 2 — Thiếu info & giải thích quan hệ (P1)

