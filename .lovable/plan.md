## Phạm vi rất lớn — đề xuất chia 4 phase, mỗi phase deliver được ngay

Toàn bộ yêu cầu (31 mục) tương đương xây thêm ~15 trang, 1 role mới, 1 bảng mới, refactor RLS, KPI engine đa kỳ, screenshot/copy. Nếu làm 1 lượt sẽ rất khó review và dễ vỡ phần đang chạy. Tôi sẽ làm tuần tự theo đúng thứ tự ưu tiên bạn đã ghi (Phase 1 → 4) và sau **mỗi phase** bạn xác nhận trước khi tôi sang phase tiếp theo.

---

### Phase 1 — UX báo cáo + Card Zalo (làm ngay sau khi bạn duyệt plan)

**Files chỉnh:**
- `src/routes/_authenticated/employee/report.tsx` — input rỗng + placeholder "0", auto-select on focus, chặn số âm, `inputMode="numeric"`, không reset cursor.
- `src/lib/reports.ts` — thêm `fmtVndDong` (`1.000.000đ`), `fmtPctValue`.
- Đổi label đúng tiếng Việt như spec; thứ tự field; chỉ số tự tính dùng đúng công thức (đặc biệt: tỉ lệ chốt × 100, doanh số chốt lại có cảnh báo đỏ khi âm).
- Validation cảnh báo (không chặn submit): tổng DS < DS data ngày, ads>0 mà mess=data=0, đơn chốt > data, tổng đơn < đơn chốt data.
- Sau submit thành công: toast + tự nhảy sang slot kế tiếp (slot cuối → "Bạn đã hoàn thành báo cáo hôm nay").

**Component mới:**
- `src/components/SubmittedReportCard.tsx` — card "BÁO CÁO ĐÃ GỬI" với header (nhân viên, ngày, khung giờ, thời gian gửi), 15 dòng số liệu, format VND/%, nền sáng tối ưu mobile.
- 2 nút: **Chụp màn hình** (dùng `html-to-image` → PNG, file `report-{slug}-{date}-{slot}.png`) và **Copy nội dung** (text plain theo format spec).
- Cài thêm: `bun add html-to-image`.

**Bảng history (employee/leader/admin):** cập nhật cột đúng 19 cột theo thứ tự spec.

---

### Phase 2 — Role `marketing_manager` + RLS

**Migration:**
- Thêm value `marketing_manager` vào enum `app_role`.
- Tạo bảng `manager_team_assignments` (manager_id, team_id, is_active, assigned_by, assigned_at, timestamps) + RLS.
- Helper SQL: `is_marketing_manager()`, `manager_leads_team(uuid)`, `can_view_team(uuid)`, `can_view_user(uuid)`, `can_manage_team_kpi(uuid)`.
- Mở rộng RLS hiện có cho `teams`, `profiles`, `team_memberships`, `slot_reports`, `kpi_targets` để manager xem được team được assign.

**Code:**
- `src/lib/auth.tsx` — thêm role `marketing_manager`, label tiếng Việt.
- `src/routes/_authenticated.tsx` — redirect `marketing_manager → /manager/dashboard`.
- `src/components/AppLayout.tsx` — sidebar 4 role theo spec mục #28.
- Trang `/admin/manager-assignments` để admin gán team.

---

### Phase 3 — KPI engine đa kỳ

**Migration:**
- Mở rộng enum `period_type`: `day | week | month | quarter | year`.
- Thêm cột `kpi_targets`: `target_scope` (employee/leader/team/manager/system), `recovered_revenue_target`, `note`, `created_by`. `user_id`/`team_id` đã nullable.
- RLS cho phép leader/manager tạo KPI trong phạm vi.

**Code:**
- `src/lib/kpi.ts` — completion engine, 4 mức màu (≥100 / 80–99 / 50–79 / <50), trả "Chưa đặt KPI" khi target=0.
- `/admin/kpi` (CRUD đầy đủ + clone từ kỳ trước + filter).
- `/leader/kpi` (CRUD trong team).
- `/employee/kpi` (read-only theo ngày/tuần/tháng/quý/năm).

---

### Phase 4 — Performance dashboards + Manager pages

- `/employee/performance` — filter tuần/tháng/quý/năm, charts Recharts (DS, Data+Đơn, Ads, KPI progress, ROAS trend).
- `/leader/performance` — tương tự + breakdown theo nhân viên.
- `/manager/dashboard` — cards tổng quan + charts theo team + ranking.
- `/manager/teams`, `/manager/kpi`, `/manager/reports`, `/manager/zalo-report`, `/manager/rankings`.
- `/manager/zalo-report` — header tổng hợp + bảng theo team + nút chụp/copy (tái dùng component Phase 1).

---

### Giữ nguyên (không đụng)
Login username, Supabase Auth, slots 11h55/13h55/16h55/21h00, admin tạo user/team, công thức `recovered_revenue` generated column, export CSV hiện có.

---

### Bạn duyệt giúp tôi 2 điểm

1. **Đồng ý chia 4 phase và làm tuần tự**, mỗi phase tôi báo "xong" rồi bạn OK mới sang phase kế? (Khuyến nghị, vì 1 phase đã rất nặng.)
2. **Thư viện screenshot**: dùng `html-to-image` (nhẹ, hỗ trợ mobile tốt) — OK chứ?

Sau khi bạn duyệt, tôi bắt đầu Phase 1 ngay.