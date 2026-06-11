# Workspace MIZ Project Brief

Cập nhật: 09/06/2026

## Project Overview

Workspace MIZ là nền tảng vận hành nội bộ cho Performance Marketing, Sales Operations và quản trị đội nhóm của DASNOTRI/MKTRe. Hệ thống tập trung giải quyết các bài toán vận hành hàng ngày: nhập báo cáo theo ca, theo dõi KPI, quản lý data thả nổi, đồng bộ tài khoản quảng cáo Meta, quản lý nguồn marketing, liên hệ khách hàng, công việc/checklist, đào tạo, điểm danh, tài sản, sản phẩm và hóa đơn bán hàng.

Định vị hiện tại của dự án không phải là ERP tổng quát như Odoo. Workspace MIZ phù hợp hơn với vai trò **Performance Marketing & Sales Operations Platform**: hệ thống giúp đội Marketing/Sale vận hành nhanh, đo lường sát, kiểm soát dữ liệu quảng cáo và báo cáo nội bộ theo đúng nghiệp vụ riêng.

Đối tượng sử dụng chính:

- Admin vận hành toàn hệ thống.
- Manager theo dõi hiệu suất và đội nhóm.
- Leader Marketing quản lý báo cáo, KPI, công việc, data và tài khoản ads của team Marketing.
- Nhân viên Marketing nhập báo cáo, quản lý Ads Dashboard, nguồn marketing, liên hệ khách hàng, ngân sách, công việc và data.
- Leader Sale quản lý báo cáo, KPI, dashboard, công việc và kho data của team Sale.
- Nhân viên Sale nhập báo cáo, nhận data, tạo hóa đơn, xem sản phẩm, công việc và đào tạo.

## User Roles

| Role | Mã trong hệ thống | Phạm vi chính | Trạng thái |
| --- | --- | --- | --- |
| Admin | `admin` | Toàn quyền quản trị người dùng, team, báo cáo, KPI, Ads Dashboard, sản phẩm, hóa đơn, công việc, tài sản, đào tạo | Completed |
| Manager | `manager` | Theo dõi dashboard, KPI, báo cáo, task, attendance, ranking, team và nhân sự cấp quản lý | Mostly Completed |
| Leader Marketing | `leader` | Quản lý team Marketing, báo cáo, Ads Dashboard, KPI, kho thả nổi, task, tài sản, ranking, đào tạo | Mostly Completed |
| Nhân viên Marketing | `employee` | Nhập báo cáo, Ads Dashboard, nguồn marketing, liên hệ khách hàng, ngân sách, data, KPI cá nhân, task, tài sản, đào tạo | Mostly Completed |
| Leader Sale | `leader_sale` | Quản lý team Sale, báo cáo team, KPI team, dashboard sale, kho thả nổi, task, hóa đơn, sản phẩm, đào tạo | Mostly Completed |
| Nhân viên Sale | `sale` | Nhập báo cáo sale, nhận data, KPI sale, kho thả nổi, tạo hóa đơn, xem sản phẩm, task, đào tạo | Mostly Completed |

## Current Navigation by Role

### Admin

- Tổng quan
- Báo cáo
- KPI
- Điểm danh
- Thông báo
- Sản phẩm
- Hoá đơn
- Quản lý
  - Người dùng
  - Quản lý team
- Marketing
  - ADS Dashboard
  - Công việc
  - Tài sản
  - Ranking Marketing
  - Đào tạo Marketing
- Sale
  - Kho thả nổi
  - Công việc
  - Đào tạo Sale

### Manager

- Tổng quan
- KPI
- Công việc
- Điểm danh
- Thông báo
- Tài sản
- Ranking Marketing
- Team
- Đào tạo

### Leader Marketing

- Tổng quan
- Báo cáo Marketing
- Ads Dashboard
- Báo cáo theo ngày
- Kho thả nổi
- KPI
- Công việc
- Điểm danh
- Tài sản
- Ranking Marketing
- Đào tạo

### Nhân viên Marketing

- Tổng quan
- Ads Dashboard
- Nguồn Marketing
- Liên hệ khách hàng
- Ngân sách
- Nhập báo cáo
- Kho thả nổi
- KPI
- Công việc
- Điểm danh
- Tài sản
- Ranking Marketing
- Đào tạo

### Sale / Leader Sale

- Tổng quan
- Báo cáo sale
- KPI sale
- Điểm danh
- Kho thả nổi
- Công việc
- Sản phẩm
- Hoá đơn
- Đào tạo sale

## Main Features

| Module | Ai dùng | Chức năng chính | Dữ liệu liên quan | Trạng thái | Ghi chú |
| --- | --- | --- | --- | --- | --- |
| Auth, Role, Profile | Tất cả role | Đăng nhập, điều hướng theo role, hồ sơ cá nhân, Telegram link, mã nhân viên, công ty | `profiles`, `team_memberships` | Mostly Completed | User cũ có thể thiếu `employee_code`/`company_name`, UI cho phép Admin cập nhật |
| Quản lý User | Admin | Tạo/sửa user, role, department, trạng thái, team, tài sản cố định, mã NV, công ty | `profiles`, `teams`, Edge Functions admin | Mostly Completed | Modal đã có layout mới, công ty chuẩn hiện tại là `DASNOTRI-01` |
| Quản lý Team | Admin | Tạo/sửa team Marketing/Sale, leader, thành viên, công ty | `teams`, `team_memberships` | Mostly Completed | Team có `company_name`; user inactive bị loại khỏi danh sách vận hành |
| Báo cáo Marketing | Admin, Manager, Leader Marketing, Employee Marketing | Nhập báo cáo Marketing, tổng hợp ngày/khoảng, team/leader/nhân viên, screenshot/report slot | Marketing report tables, `profiles`, `teams` | Mostly Completed | Logic inactive: hôm nay chỉ active, lịch sử vẫn giữ nếu có dữ liệu |
| Báo cáo Sale | Admin, Leader Sale, Sale | Báo cáo theo khung 11h50/17h20/20h45, preview ảnh, copy/tải ảnh, team report, pivot ngang/dọc | `sale_reports` | Mostly Completed | Khung 1 mở từ 00:00 và cập nhật đến 15:50; báo cáo team lấy mỗi Sale 1 row theo khung mới nhất |
| Dashboard Sale | Admin, Leader Sale, Sale | Tổng doanh số, data nhận/chốt, tỉ lệ chốt, TB đơn, ranking, chart, bảng hiệu suất | `sale_reports`, team scope | Mostly Completed | Leader Sale chỉ thấy Sale active trong team, không thấy leader/inactive/team khác |
| KPI Marketing | Admin, Manager, Leader Marketing, Employee Marketing | KPI cá nhân/team/toàn hệ thống, kỳ năm/quý/tháng/tuần, KPI chiến lược toàn hệ thống | KPI target tables, reports | Mostly Completed | Popup tạo/sửa KPI đã refactor theo kỳ; KPI hệ thống chiến lược tách khỏi KPI cá nhân/team |
| KPI Sale | Admin, Leader Sale, Sale | KPI team/cá nhân Sale, doanh số, tổng đơn, tỉ lệ chốt, TB đơn, progress | `sale_kpi_targets`, `sale_reports` | Mostly Completed | Leader được tạo/sửa KPI trong team theo scope |
| Ads Dashboard Marketing | Admin, Leader Marketing, Employee Marketing | Quản lý account ads, cập nhật token, sync Meta, filter ngày, campaign table, pause adsets, account limit card | `marketing_ads_accounts`, snapshots, assignments, system tokens | Mostly Completed | Card account limit lấy account-level metrics; pause adsets có Edge Function riêng |
| Admin Ads Dashboard | Admin | Xem tất cả account ads, chọn account bằng dropdown, sync, xoá account thật | Ads tables, `admin-delete-ads-account`, `sync-ads-account` | Mostly Completed | Không có dashboard tổng team ads ở phase này |
| Nguồn Marketing | Employee Marketing | Tạo nguồn lead, sinh API ingest URL thật, copy URL, xem chi tiết, bật/tắt nguồn | `lead_sources`, `/api/leads/ingest/:sourceToken` | Partial | Backend ingest đã có; chưa có pipeline chia Sale hoàn chỉnh |
| Liên hệ khách hàng | Employee Marketing | CRM mini cho MKT xem lead/contact, filter saved preset, kanban, cấu hình cột, popup chi tiết, note history read-only | `marketing_contacts`, `contact_notes`, `lead_sources` | Partial | Marketing chỉ xem, không xử lý như Sale; cần nối dữ liệu phân phối Sale/order thật sâu hơn |
| Contact Notes | Admin/Marketing owner/Leader scope/Sale future | Lịch sử ghi chú thật, soft delete, fallback từ raw payload | `contact_notes` | Partial | Service đã chuẩn bị create/update/delete cho Sale dùng sau; Marketing chưa có quyền sửa |
| Kho thả nổi Marketing | Admin, Leader Marketing, Employee Marketing | Upload/đẩy data thả nổi, filter, thống kê, leader scope theo team | `floating_leads` | Mostly Completed | Leader Marketing dùng layout giống Admin/Marketing và scope team |
| Kho thả nổi Sale | Admin, Leader Sale, Sale | Sale nhận data, cuộc gọi 1/2/3, trạng thái, release/reclaim theo nghiệp vụ | `floating_leads` | Mostly Completed | Không sửa auto distribution nâng cao trong phase hiện tại |
| Ngân sách Marketing | Employee Marketing | UI theo dõi tiền nhận/chi, phí dịch vụ, phí ngân hàng, link hóa đơn, filter thời gian/account | Local/UI state hoặc service hiện có | Partial | Chưa có DB/RLS/export; hiện là phase UI/local state |
| Công việc / Checklist | Admin, Manager, Leader, Employee, Sale, Leader Sale | Task board, checklist, giao việc, gửi duyệt, duyệt/từ chối, screenshot, department marketing/sale | task tables, notifications, Telegram | Mostly Completed | Marketing và Sale dùng chung engine nhưng tách department |
| Notification | Tất cả role | Dropdown thông báo, approval action, resolved state, task/onboarding/report/asset/leave hooks | `notifications`, related metadata | Mostly Completed | Đã có logic tránh notification pending sau khi entity được xử lý |
| Telegram Integration | Admin/Manager/Leader/Employee/Sale | Link Telegram, gửi thông báo, webhook, group reminders, approval callback | Telegram Edge Functions, `telegram.ts` | Mostly Completed | Cần kiểm thử production bot/webhook thực tế |
| Điểm danh / Nghỉ phép | Tất cả role vận hành | Check-in, leave request, attendance list, team filter, pagination | attendance/leave tables | Mostly Completed | GPS Checkin chưa hoàn thiện, nên xem là planned |
| Tài sản | Admin, Manager, Marketing | Quản lý tài sản cố định/linh động, team/user owner, filter, pagination | asset tables | Mostly Completed | User/team inactive bị loại khỏi danh sách vận hành |
| Sản phẩm | Admin, Sale, Leader Sale | Admin CRUD bảng giá/combo/quà/voucher; Sale xem read-only | `products` | Mostly Completed | Có seed sản phẩm; chưa phải inventory/stock |
| Hoá đơn bán hàng | Sale, Leader Sale, Admin | Sale tạo invoice và preview ảnh; Admin xem danh sách, filter/search/export Excel, chi tiết | `invoices`, `invoice_items`, `xlsx` | Mostly Completed | Chưa phải kế toán/đối soát vận chuyển đầy đủ |
| Đào tạo / Onboarding | Admin, Manager, Leader, Employee, Sale | Tài liệu đào tạo Marketing/Sale, onboarding, pinned docs | resource/training tables | Mostly Completed | Admin sidebar đã tách Đào tạo Marketing và Đào tạo Sale |
| Ranking Marketing | Admin, Manager, Leader, Employee | Bảng xếp hạng KPI/hiệu suất Marketing | reports/KPI derived data | Mostly Completed | Sale ranking mới nằm trong dashboard/KPI Sale, chưa thành module riêng độc lập |
| Products / Invoice bridge | Admin, Sale | Chọn sản phẩm/combo từ catalog để tạo hóa đơn | `products`, `invoice_items` | Mostly Completed | Không quản lý tồn kho |

## User Flows

### Nhân viên Marketing nhập báo cáo

1. Điểm danh nếu nghiệp vụ yêu cầu.
2. Vào `Nhập báo cáo`.
3. Nhập số liệu theo khung/ngày.
4. Chụp/tải ảnh báo cáo nếu cần.
5. Leader/Admin xem tổng hợp theo ngày/khoảng và team.

### Nhân viên Sale nhập báo cáo

1. Điểm danh để mở khóa báo cáo.
2. Chọn khung 11h50, 17h20 hoặc 20h45.
3. Nhập data mới, data thả nổi, data tiếp cận, kết bạn Zalo, video call, doanh số, ghi chú.
4. Gửi báo cáo trực tiếp, không cần xác nhận lại trong preview.
5. Leader Sale/Admin xem báo cáo team, mỗi Sale một dòng theo khung mới nhất hoặc filter khung cụ thể.

### Leader/Admin xem KPI

1. Chọn kỳ năm/quý/tháng/tuần.
2. Chọn team/nhân sự theo scope.
3. Xem KPI chiến lược toàn hệ thống, KPI team tự tính từ cá nhân, KPI cá nhân.
4. Admin và leader được tạo/sửa KPI theo quyền.

### Ads Dashboard Marketing

1. Marketing thêm tài khoản quảng cáo, chỉ nhập số ID; hệ thống chuẩn hóa `act_`.
2. Cập nhật token/account token hoặc dùng system token.
3. Chọn filter nhanh hoặc tùy chỉnh.
4. Sync Meta, đọc snapshot campaign theo dataset độc lập.
5. Xem Camp ON, Adset ON, account spend limit, campaign table, pause adsets nếu cần.
6. Admin có dashboard riêng để xem/sync/xóa account trong toàn hệ thống.

### Nguồn Marketing và Liên hệ khách hàng

1. Nhân viên Marketing tạo nguồn trong `Nguồn Marketing`.
2. Hệ thống sinh API URL `/api/leads/ingest/:sourceToken`.
3. Landing Page/Form/Hotline gửi lead vào endpoint.
4. API chuẩn hóa số điện thoại, kiểm tra trùng 7 ngày và insert vào `marketing_contacts`.
5. Marketing xem data trong `Liên hệ khách hàng`, dùng filter saved preset, kanban/table, popup chi tiết, lịch sử ghi chú read-only.

### Kho thả nổi

1. Marketing/Leader Marketing tạo hoặc quản lý data thả nổi trong scope team.
2. Sale/Leader Sale xem kho data Sale và nhận/xử lý theo nghiệp vụ.
3. Admin xem toàn bộ.

### Công việc / Checklist

1. Admin/Leader tạo checklist/task theo department Marketing hoặc Sale.
2. Nhân viên thấy task theo scope.
3. Nhân viên gửi duyệt.
4. Leader/Admin duyệt/từ chối.
5. Notification và Telegram đồng bộ trạng thái.

### Hoá đơn bán hàng

1. Sale/Leader Sale chọn sản phẩm/combo.
2. Nhập thông tin khách hàng.
3. Bấm tạo hóa đơn, lưu DB trước rồi mở preview ảnh.
4. Admin vào `Hoá đơn` để xem danh sách, filter/search/export Excel và xem chi tiết.

## Database / Backend

Backend chính dùng Supabase PostgreSQL, Supabase Auth/RLS, Supabase Edge Functions và route server của TanStack Start/Vite cho lead ingest.

Nhóm bảng chính:

- Người dùng/team: `profiles`, `teams`, `team_memberships`.
- Báo cáo Marketing: các bảng report/slot/audit liên quan Marketing.
- Báo cáo Sale: `sale_reports`.
- KPI: KPI target tables, `sale_kpi_targets`, period metadata.
- Ads Dashboard: `marketing_ads_accounts`, `marketing_ads_account_assignments`, `marketing_ads_campaign_snapshots`, `marketing_ads_accounts_public`, `marketing_ads_system_tokens`.
- Floating leads: `floating_leads`.
- Nguồn/Contact Marketing: `lead_sources`, `marketing_contacts`, `contact_notes`.
- Product/Invoice: `products`, `invoices`, `invoice_items`.
- Task/Checklist: task template/completion/approval tables.
- Attendance/Leave: attendance and leave request tables.
- Notifications/Telegram: `notifications` and Telegram link/config related tables.
- Assets/Resources/Ranking: asset/resource/ranking related tables.

Backend/API đáng chú ý:

- `/api/leads/ingest/:sourceToken`: nhận lead từ Landing Page/Form, chuẩn hóa số, duplicate 7 ngày, insert `marketing_contacts`, trả JSON mọi lỗi.
- `sync-ads-account`: đồng bộ Meta Ads account/campaign/adset insights.
- `pause-adsets`: pause adsets bằng Meta Marketing API, ưu tiên system token.
- `admin-delete-ads-account`: admin xóa thật tài khoản ads.
- `upsert-ads-account-test`: thêm account ads.
- `update-ads-account-token`: cập nhật token account.
- `admin-upsert-ads-system-token`, `admin-delete-ads-system-token`: quản lý system token Meta.
- `admin-create-user`, `admin-update-user`, `bootstrap-admin`: quản trị user.
- `telegram-webhook`, `telegram-send`, `telegram-dispatch-notifications`, `telegram-group-reminders`: tích hợp Telegram.
- `facebook-ad-spend-sync`: đồng bộ spend Facebook nếu dùng job riêng.

RLS/phân quyền:

- Admin/manager có quyền rộng theo từng module.
- Leader Marketing/Leader Sale đọc dữ liệu theo team scope.
- Employee Marketing đọc/ghi dữ liệu của chính mình hoặc team theo policy.
- Sale/Leader Sale đọc/ghi báo cáo, hóa đơn và data theo scope Sale.
- Token Meta không expose ra frontend; frontend dùng public views hoặc Edge Functions.
- `contact_notes` dùng soft delete; Marketing chỉ đọc, Sale sẽ được chuẩn bị quyền ghi theo contact được phân phối.

## Integrations

| Integration | Mục đích | Trạng thái |
| --- | --- | --- |
| Meta Marketing API | Sync Ads Dashboard, account limit, campaign/adset metrics, pause adsets | Mostly Completed |
| Telegram Bot/Webhook | Thông báo, reminders, approval action | Mostly Completed |
| Landing Page/Form API | Ingest lead từ nguồn marketing vào Workspace | Partial |
| Supabase Auth/Postgres/RLS/Edge Functions | Auth, DB, server-side secure operations | Completed |
| Excel/XLSX | Export hóa đơn và một số danh sách | Mostly Completed |
| html-to-image | Chụp báo cáo, hóa đơn, checklist thành ảnh | Mostly Completed |
| Cloudflare/Vite/TanStack Start | Frontend/server route deployment target | Partial, cần xác nhận production |

## Current Development Stage

Workspace MIZ đang ở giai đoạn **internal operations platform / beta vận hành nội bộ**. Nhiều module nghiệp vụ lõi đã có UI và data thật, đặc biệt ở Marketing/Sale reporting, KPI, Ads Dashboard, task/checklist, attendance, training, products và invoices.

Các module mới như `Nguồn Marketing`, `Liên hệ khách hàng`, `Ngân sách Marketing`, contact notes và lead ingest đang ở trạng thái chuyển từ UI/mock sang backend thật từng phần. Hệ thống đủ mạnh để dùng nội bộ và demo case study, nhưng chưa nên định vị là ERP/CRM hoàn chỉnh để bán rộng nếu chưa hoàn thiện phân phối Sale, pipeline CRM, bảo mật production và audit logs.

## Completed Modules

- Role-based layout và navigation chính.
- Admin user/team management cơ bản.
- Báo cáo Sale theo khung và team scope.
- KPI Marketing/Sale theo team/cá nhân/toàn hệ thống ở mức vận hành.
- Ads Dashboard Marketing/Admin với sync Meta, token update, system token, delete account, pause adsets.
- Sản phẩm catalog cho Admin và Sale read-only.
- Hóa đơn bán hàng: Sale tạo, Admin xem/export.
- Training/Resources Marketing/Sale.
- Task/Checklist shared engine cho Marketing/Sale.
- Attendance/Leave cơ bản.
- Notification và Telegram integration ở mức vận hành.

## In-progress / Partial Modules

- Liên hệ khách hàng: UI nâng cao, contact notes thật, saved filters, kanban; chưa phải CRM Sale đầy đủ.
- Nguồn Marketing và API ingest: có backend thật, nhưng chưa có module chia số Sale hoàn chỉnh.
- Ngân sách Marketing: chủ yếu UI/local flow, chưa có DB/RLS/export chính thức.
- Contact notes: DB/service đã có, UI Marketing read-only; Sale UI ghi chú chưa gắn.
- Manager analytics/revenue/salary: có route/module, cần xác nhận mức hoàn thiện nghiệp vụ.
- Floating pool advanced automation: có nền tảng, nhưng auto distribution và lifecycle sâu còn cần hoàn thiện.

## Planned / Not Started Modules

- GPS Checkin thực địa: planned, chưa coi là completed.
- CRM Sale đầy đủ sau khi lead được chia: planned/partial.
- Order fulfillment/logistics/kho vận: not started.
- Accounting/finance chính thức: not started.
- Inventory/stock management: not started.
- Customer portal/public CRM: not started.
- Full Odoo replacement: not started và không nên định vị ở giai đoạn hiện tại.

## Missing Modules Compared With Odoo

Workspace MIZ hiện chưa thay thế được các mảng Odoo/ERP sau:

- CRM pipeline đầy đủ từ lead, opportunity, quotation, sales order đến after-sale.
- Sales ERP gồm báo giá, hợp đồng, chiết khấu phức tạp, công nợ.
- Inventory/kho vận/tồn kho/điều chuyển.
- Purchase/vendor management.
- Accounting, ledger, invoice tax, payment reconciliation.
- Delivery/logistics integration, shipping carrier, COD reconciliation.
- POS bán tại quầy.
- Manufacturing/MRP.
- HR payroll, hợp đồng lao động, bảo hiểm.
- Customer portal và support ticket chính thức.
- Advanced BI/report builder cho nhiều phòng ban ngoài Marketing/Sale.

## Odoo Comparison Readiness

Workspace MIZ mạnh hơn Odoo tiêu chuẩn ở lớp vận hành đặc thù Performance Marketing:

- KPI Marketing/Sale theo nghiệp vụ nội bộ.
- Báo cáo ca/ngày của MKT/Sale sát thực tế vận hành.
- Ads Dashboard có Meta account sync, account spend limit, campaign/adset status và pause adsets.
- Lead source API và contact workflow dành cho data Marketing.
- Kho thả nổi, ranking, checklist, notification, Telegram và training tích hợp trong cùng workspace.

Workspace MIZ chưa nên được so sánh như ERP thay thế Odoo toàn diện. Hiện tại nên định vị là:

**Performance Marketing & Sales Operations Platform** cho doanh nghiệp phụ thuộc quảng cáo, data, đội sale và KPI nội bộ.

Cách nói an toàn trong proposal:

- Workspace MIZ có thể đứng cạnh Odoo để xử lý lớp vận hành Marketing/Sale tốc độ cao.
- Workspace MIZ có thể đẩy dữ liệu đơn/lead sang Odoo trong roadmap tích hợp.
- Workspace MIZ chưa thay thế Odoo ở kế toán, kho vận, mua hàng, logistics và ERP tổng quát.

## Commercial Potential

### Khách hàng mục tiêu

- Doanh nghiệp D2C/e-commerce chạy quảng cáo hiệu suất cao.
- Phòng Marketing có nhiều tài khoản quảng cáo, nhiều nhân viên, nhiều báo cáo ngày.
- Đội Sale nhận data từ Facebook/Landing Page/Hotline và cần kiểm soát chia số.
- Công ty SME đã thấy Odoo/ERP quá rộng nhưng thiếu dashboard Marketing/Sale đặc thù.
- Agency/performance team cần quản trị nhiều tài khoản ads và KPI nhân sự.

### Điểm khác biệt so với Odoo/ERP truyền thống

- Tập trung vào vận hành Marketing/Sale, không bị nặng ERP.
- Có Ads Dashboard và Meta API workflow native.
- Có KPI theo team/cá nhân/khung báo cáo, phù hợp quản lý hiệu suất.
- Có lead source ingest, duplicate check và contact workflow riêng cho MKT.
- Có Telegram notification và screenshot/report sharing phục vụ vận hành hàng ngày.
- UI được thiết kế theo workflow thực tế thay vì module ERP tổng quát.

### Module có thể thương mại hóa sớm

- Ads Dashboard Marketing.
- KPI Marketing/Sale.
- Báo cáo Marketing/Sale.
- Task/Checklist/Approval.
- Nguồn Marketing + Liên hệ khách hàng.
- Training/Resources.
- Attendance/Leave cơ bản.

### Module cần hoàn thiện trước khi bán

- CRM lead distribution cho Sale.
- Contact lifecycle và note history cho Sale.
- Permission/RLS audit toàn diện.
- Billing/subscription nếu bán SaaS.
- Production observability: logs, error tracking, audit trail.
- Backup/restore và data retention.
- Import/export chuẩn cho khách hàng.
- Tích hợp Odoo/ERP hoặc webhook outbound.

### Rủi ro kỹ thuật / vận hành / bảo mật

- Token Meta và system token cần audit bảo mật nghiêm ngặt.
- RLS cần test theo từng role/team để tránh lộ dữ liệu.
- Lead ingest public endpoint cần rate limit, spam protection và signature/API key nếu dùng production.
- Dữ liệu khách hàng chứa số điện thoại, cần phân quyền và log truy cập.
- Telegram approval cần đảm bảo idempotency và resolved state.
- Module mới nhiều, cần regression suite để tránh thay đổi UI làm lệch nghiệp vụ.

## Suggested Roadmap

### Phase 1: Stabilize Internal Operations

- Hoàn thiện test role scope cho Admin/Manager/Leader/Employee/Sale.
- Chuẩn hóa RLS và audit log cho contact, report, invoice, ads account.
- Hoàn thiện Liên hệ khách hàng với dữ liệu thật thay vì sample.
- Gắn Sale note UI vào `contact_notes`.
- Hoàn thiện Ngân sách Marketing bằng DB thật.

### Phase 2: Lead Distribution & CRM Layer

- Xây module chia số tự động cho Sale.
- Xây màn Sale xử lý contact được chia.
- Chuẩn hóa lifecycle: mới, đang xử lý, đã gọi, đã nhận/chốt, trùng, resale.
- Tích hợp đơn hàng/invoice với contact.
- Export/import và webhook outbound.

### Phase 3: Commercial Product Readiness

- Multi-company/multi-tenant model.
- Billing/subscription.
- Deployment pipeline, monitoring, rate limit.
- Data privacy, audit trail, backup.
- Marketplace/demo workspace.
- Optional Odoo integration connector.

## Notes for Business Proposal

Nên giới thiệu Workspace MIZ như một case study xây dựng hệ thống vận hành nội bộ chuyên biệt cho Performance Marketing và Sales Ops.

Điểm nên nhấn mạnh:

- Xuất phát từ nhu cầu thật của đội Marketing/Sale.
- Có phân quyền theo vai trò và team.
- Có Meta Ads API integration.
- Có báo cáo, KPI, ranking, attendance, task approval, training và notification trong một workspace.
- Có hướng mở rộng thành lead ingestion/contact management.
- Có thể tích hợp với ERP/Odoo thay vì thay thế ERP ngay.

Điểm cần tránh nói quá:

- Không nói Workspace MIZ đã là ERP đầy đủ.
- Không nói đã thay thế Odoo ở kế toán/kho vận/logistics.
- Không nói CRM đã hoàn chỉnh nếu Sale contact pipeline chưa xong.
- Không nói GPS Checkin đã hoàn thiện nếu hiện mới là định hướng.

Thông tin cần bổ sung thực tế trước khi làm proposal thương mại:

- Số lượng user nội bộ đang dùng thật.
- Khối lượng report/contact/ads account thực tế.
- Kết quả tiết kiệm thời gian hoặc giảm lỗi vận hành.
- Domain/deployment production chính thức.
- Chính sách backup và bảo mật token.
- Danh sách màn hình đã deploy ổn định.

## Suggested Screenshots

- Admin Dashboard và sidebar phân nhóm.
- Ads Dashboard Marketing/Admin.
- Báo cáo Sale và pivot view.
- KPI Marketing với KPI toàn hệ thống.
- KPI Sale Leader/Admin.
- Nguồn Marketing và API URL.
- Liên hệ khách hàng table/kanban/detail popup.
- Kho thả nổi Marketing/Sale.
- Task/Checklist approval.
- Sản phẩm và Hóa đơn bán hàng.
- Đào tạo Marketing/Sale.
