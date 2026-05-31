# Workspace MIZ Project Brief

## 1. Project Overview

**Workspace MIZ** là hệ thống quản trị vận hành nội bộ cho đội Marketing, Sale, Leader và Admin của MKTRe. Dự án tập trung vào việc số hóa các hoạt động hằng ngày như nhập báo cáo, theo dõi KPI, quản lý tài khoản quảng cáo, quản lý lead thả nổi, chấm công, đào tạo nội bộ, thông báo và phân quyền nhân sự.

Hệ thống giải quyết vấn đề phân mảnh dữ liệu trong vận hành performance marketing: báo cáo nằm rải rác, KPI khó theo dõi theo ngày/team/người, lead từ Marketing sang Sale thiếu trạng thái rõ ràng, tài khoản quảng cáo khó kiểm soát, và việc nhắc việc/duyệt nội dung cần nhiều thao tác thủ công.

Đối tượng sử dụng chính:

- **Nhân viên Marketing**: nhập báo cáo, xem dashboard, theo dõi KPI, Ads Dashboard, kho thả nổi, tài sản, công việc, điểm danh và đào tạo.
- **Leader Marketing**: theo dõi team, báo cáo team, KPI team, ranking, Ads Dashboard, kho thả nổi team và tài liệu đào tạo.
- **Nhân viên Sale**: nhận lead, gọi số, báo cáo Sale, KPI Sale, điểm danh và đào tạo Sale.
- **Leader Sale**: vừa xử lý lead như Sale, vừa xem dashboard/báo cáo/KPI/thành viên team Sale.
- **Admin/Manager**: quản lý toàn bộ người dùng, team, báo cáo, KPI, tài sản, lead, Ads Dashboard và tài liệu đào tạo.

## 2. My Role

Dự án được định hướng theo góc nhìn của **Nguyễn Hữu Huy** với vai trò:

**Product Owner / System Designer / Marketing Operations Builder**

Trong dự án này, tôi chịu trách nhiệm định hình logic nghiệp vụ, thiết kế luồng vận hành, tổ chức module theo từng vai trò và chuẩn hóa cách dữ liệu Marketing/Sale được nhập, theo dõi, tổng hợp và phản hồi trong hệ thống.

Các phần tôi trực tiếp định hướng:

- Thiết kế cấu trúc workspace cho từng vai trò: Admin, Manager, Leader Marketing, Employee Marketing, Sale, Leader Sale.
- Xác định logic báo cáo theo khung giờ, KPI theo team/cá nhân, ranking, chấm công và quy trình lead.
- Xây dựng flow Ads Dashboard để kết nối dữ liệu từ Meta Ads API nhưng vẫn đảm bảo token không lộ ra frontend.
- Tách rõ dữ liệu Marketing và Sale, tránh gộp sai chỉ số.
- Định nghĩa cách hệ thống hỗ trợ performance marketing: từ chi phí ads, data, doanh thu, giá số, KPI đến vòng đời lead.

## 3. Main Features

### Dashboard Marketing

Dashboard Marketing tổng hợp các chỉ số vận hành chính như chi phí ads, doanh thu, data, đơn chốt, tỷ lệ chốt, chi phí trên data và hiệu suất theo team/người. Đây là màn hình để Leader/Admin nhìn nhanh tình hình vận hành Marketing theo ngày hoặc khoảng thời gian.

### Ads Dashboard

Ads Dashboard là module theo dõi tài khoản quảng cáo Meta/Facebook Ads.

Các chức năng chính:

- Quản lý danh sách tài khoản quảng cáo được gán cho nhân sự Marketing.
- Đồng bộ dữ liệu từ Meta Marketing API thông qua Supabase Edge Function.
- Hiển thị Camp ON, Adset ON và giới hạn chi tiêu tài khoản.
- Theo dõi campaign theo filter thời gian: hôm nay, hôm qua, tuần này, tháng này, tùy chỉnh.
- Phân biệt campaign Active / All.
- Hiển thị phân phối campaign theo trạng thái: đang hoạt động, đã lên lịch, nhóm quảng cáo tắt.
- Theo dõi ngân sách, đã tiêu, kết quả, lượt mua và chi phí/kết quả.
- Admin có màn Ads Dashboard riêng để xem toàn bộ tài khoản và xóa tài khoản nếu cần.

### Nhập báo cáo

Module nhập báo cáo cho Marketing và Sale hỗ trợ nhập số liệu theo khung giờ trong ngày. Báo cáo Marketing có các chỉ số như chi phí Ads, MESS, Data, đơn chốt, doanh số data và tổng doanh số. Báo cáo Sale tập trung vào dữ liệu nhận, dữ liệu chốt, doanh số khách mới, doanh số thả nổi và khách cũ.

Hệ thống có cơ chế khóa/mở, cập nhật trong khoảng thời gian cho phép, preview/chụp ảnh báo cáo và lưu trạng thái đã gửi.

### KPI Marketing

KPI Marketing dùng để theo dõi mục tiêu theo team hoặc cá nhân. Các chỉ số chính hiện tập trung vào:

- Doanh thu
- DATA
- Giá số
- % chi phí theo mục tiêu doanh thu

KPI được lọc theo thời gian, team và nhân sự. Admin/Manager/Leader có thể tạo KPI theo phạm vi tổng công ty, team hoặc cá nhân tùy vai trò.

### Ranking Marketing

Ranking Marketing giúp so sánh hiệu suất giữa các nhân sự/team Marketing dựa trên dữ liệu báo cáo thực tế. Đây là công cụ để tạo góc nhìn cạnh tranh, minh bạch và dễ đánh giá năng suất.

### Điểm danh

Module điểm danh hỗ trợ nhân sự ghi nhận trạng thái làm việc theo ngày, theo tháng và lịch sử điểm danh. Hệ thống có hỗ trợ trạng thái nghỉ phép và góc nhìn team cho Leader/Admin.

Sale và Leader Sale có màn điểm danh riêng, không gắn checklist Marketing.

### Quản lý tài sản

Module tài sản dùng cho Marketing/Admin để quản lý các tài sản vận hành như hotline, Odoo, link tài nguyên, tài khoản hoặc tài sản nội bộ. Admin/Manager có thể quản lý tài sản theo cá nhân hoặc team.

### Kho thả nổi

Kho thả nổi là nơi Marketing đẩy số/data xuống để Sale xử lý.

Flow chính:

- Marketing thêm số vào kho.
- Sale nhìn thấy lead trong kho.
- Sale nhận số, cập nhật cuộc gọi, trạng thái và chốt nếu có đơn.
- Admin/Leader có thể theo dõi vòng đời lead.
- Hệ thống lưu lifecycle lead như mới, đã nhận, đã gọi, đã chốt, released hoặc expired.

Module này giúp kiểm soát rõ lead từ Marketing sang Sale, tránh thất thoát data và hỗ trợ theo dõi hiệu suất chuyển đổi.

### Đào tạo

Module Đào tạo là trung tâm tài liệu nội bộ cho Marketing và Sale. Nội dung được chia theo phòng ban, hỗ trợ tài liệu, quy trình, script, link, thông báo và video YouTube embed.

Admin có thể quản lý tài liệu, ghim nội dung quan trọng, phân loại theo department và upload/view tài liệu theo quyền.

### Quản lý nhân sự / phân quyền

Hệ thống có phân quyền theo role:

- Admin
- Manager
- Leader Marketing
- Nhân viên Marketing
- Sale
- Leader Sale

Admin có thể quản lý user, team Marketing, team Sale, leader, thành viên và trạng thái active/inactive. Sidebar và route được tách theo role để mỗi người chỉ thấy module phù hợp.

### Telegram Notification / Approval

Source code có tích hợp Telegram thông qua Supabase Edge Functions:

- `telegram-webhook`
- `telegram-send`
- `telegram-dispatch-notifications`
- `telegram-group-reminders`

Hệ thống có logic liên kết tài khoản Telegram, gửi thông báo, nhắc việc, và duyệt một số tác vụ/onboarding/report thông qua notification/approval flow.

### Meta Ads API Integration

Ads Dashboard có nền tảng tích hợp Meta Ads API:

- Lưu tài khoản quảng cáo trong `marketing_ads_accounts`.
- Gán tài khoản cho nhân sự qua `marketing_ads_account_assignments`.
- Cache snapshot campaign trong `marketing_ads_campaign_snapshots`.
- Đồng bộ dữ liệu qua Edge Function `sync-ads-account`.
- Không gọi Meta API trực tiếp từ frontend.
- Không expose access token ra client.

## 4. User Flows

### Nhân viên Marketing nhập báo cáo

1. Nhân viên đăng nhập vào workspace Marketing.
2. Vào mục `Nhập báo cáo`.
3. Chọn khung báo cáo phù hợp.
4. Nhập chi phí ads, MESS, Data, đơn chốt, doanh số và ghi chú.
5. Xem chỉ số tự tính realtime.
6. Gửi báo cáo.
7. Báo cáo được lưu để Leader/Admin tổng hợp KPI, dashboard và ranking.

### Leader/Admin xem KPI

1. Leader/Admin vào module KPI.
2. Chọn thời gian, team hoặc nhân sự.
3. Xem KPI team/cá nhân theo doanh thu, DATA và giá số.
4. Theo dõi tiến độ đạt/chưa đạt.
5. Tạo KPI mới theo tổng công ty, team hoặc nhân sự.

### Theo dõi doanh thu, data, chi phí ads

1. Dữ liệu được nhập từ báo cáo Marketing.
2. Dashboard tổng hợp các chỉ số theo thời gian.
3. KPI và ranking sử dụng cùng nguồn dữ liệu để đánh giá hiệu suất.
4. Ads Dashboard bổ sung dữ liệu từ Meta Ads API để đối chiếu campaign, adset, spend, result và purchase.

### Chấm công

1. Nhân sự vào module Điểm danh.
2. Chọn ngày hoặc thao tác điểm danh hôm nay.
3. Hệ thống lưu trạng thái điểm danh.
4. Leader/Admin có thể xem tổng hợp theo tháng, theo team và trạng thái.

### Duyệt nội dung / tài sản

Source code có các thành phần notification và approval cho task/onboarding, bao gồm tích hợp Telegram review. Với tài sản, Admin/Manager có thể quản lý và phân bổ tài sản cho cá nhân/team.

Một số luồng duyệt chi tiết cần bổ sung thông tin thực tế nếu dùng trong portfolio, ví dụ: quy trình duyệt nội dung cụ thể, ai là người duyệt cuối và tiêu chí duyệt.

## 5. Tech Stack

### Frontend

- React 19
- TypeScript
- TanStack Router
- TanStack React Query
- TanStack Start
- Tailwind CSS
- Radix UI components
- Lucide icons
- Recharts
- Sonner toast

### Backend

- Supabase
- Supabase Edge Functions
- PostgreSQL functions/RPC
- Row Level Security policies

### Database

- PostgreSQL qua Supabase
- Các nhóm bảng chính:
  - `profiles`, `user_roles`, `teams`, `team_memberships`
  - `marketing_reports`
  - `sale_reports`
  - `kpi_targets`, `sale_kpi_targets`
  - `floating_leads`
  - `attendance_records`
  - `assets`, `fixed_assets`
  - `tasks`, checklist/onboarding tables
  - `notifications`
  - `onboarding_documents`, onboarding cards/sections
  - `marketing_ads_accounts`, `marketing_ads_account_assignments`, `marketing_ads_campaign_snapshots`

### Auth

- Supabase Auth
- Profile-based role resolution
- Role-based route/sidebar guards
- Active/inactive account handling

### API Integrations

- Meta Marketing API for Ads Dashboard
- Telegram Bot/Webhook integration for notifications and approval flows

### Deployment

Source code sử dụng Vite, TanStack Start và Cloudflare Vite plugin/Wrangler artifacts. Deployment production thực tế cần bổ sung thông tin cụ thể: domain, hosting target, environment strategy và CI/CD nếu có.

## 6. Portfolio Case Study

### Problem

Đội performance marketing và sale thường vận hành bằng nhiều công cụ rời rạc: báo cáo thủ công, file tính KPI, dữ liệu ads riêng, lead riêng, chấm công riêng và tài liệu đào tạo nằm rải rác. Điều này làm giảm tốc độ ra quyết định, khó kiểm soát KPI, khó theo dõi vòng đời lead và dễ phát sinh sai lệch dữ liệu giữa Marketing, Sale và Admin.

### Solution

Workspace MIZ được xây dựng như một workspace nội bộ thống nhất, tách rõ vai trò và nghiệp vụ cho từng nhóm: Marketing, Sale, Leader và Admin. Hệ thống gom các điểm vận hành cốt lõi vào một nền tảng: báo cáo, dashboard, KPI, ads data, lead, attendance, asset, training và notification.

### Key Features

- Dashboard Marketing theo dữ liệu báo cáo thực tế.
- Ads Dashboard kết nối dữ liệu Meta Ads API qua backend an toàn.
- Báo cáo Marketing/Sale theo khung giờ.
- KPI team/cá nhân theo từng vai trò.
- Ranking Marketing để so sánh hiệu suất.
- Kho thả nổi quản lý lead từ Marketing sang Sale.
- Điểm danh nhân sự.
- Quản lý tài sản nội bộ.
- Đào tạo và onboarding theo department.
- Telegram notification và approval flow.
- Admin workspace quản lý user, team, KPI, lead, report và ads accounts.

### Impact

Dự án giúp chuẩn hóa vận hành giữa Marketing và Sale, giảm phụ thuộc vào file thủ công, tăng tính minh bạch của KPI và giúp Leader/Admin theo dõi hiệu suất nhanh hơn. Hệ thống cũng tạo nền tảng để mở rộng automation, notification, Meta Ads sync và quản lý hiệu suất theo team.

Không có số liệu business impact cụ thể trong source code. Cần bổ sung thông tin thực tế nếu muốn đưa vào portfolio, ví dụ: số người dùng nội bộ, số team sử dụng, thời gian tiết kiệm, số report xử lý mỗi ngày hoặc mức giảm sai lệch báo cáo.

### What I Built

Tôi thiết kế và định hướng một hệ thống vận hành nội bộ gồm nhiều module có liên kết dữ liệu:

- Role-based workspace cho Admin, Manager, Leader, Employee, Sale và Leader Sale.
- Cấu trúc báo cáo Marketing/Sale.
- KPI Marketing/Sale theo team và cá nhân.
- Ads Dashboard với kiến trúc không expose token frontend.
- Floating lead lifecycle từ Marketing sang Sale.
- Notification và Telegram approval flow.
- Training/Onboarding hub cho tài liệu nội bộ.

### Why It Matters for Performance Marketing

Performance marketing không chỉ cần chạy ads, mà cần một hệ thống vận hành giúp đọc số nhanh, kiểm tra KPI nhanh, phát hiện vấn đề nhanh và phản hồi nhanh giữa Marketing và Sale. Workspace MIZ biến dữ liệu hằng ngày thành một quy trình quản trị hiệu suất: từ chi phí ads, data, lead, doanh thu đến KPI và hành động của từng nhân sự.

## 7. Short Portfolio Description

### Phiên bản 1 câu ngắn

Workspace MIZ là hệ thống quản trị vận hành nội bộ giúp đội Marketing/Sale theo dõi báo cáo, KPI, Ads Dashboard, lead, điểm danh và đào tạo trên một nền tảng thống nhất.

### Phiên bản 1 đoạn ngắn

Workspace MIZ là một internal operations workspace được xây dựng cho đội Marketing và Sale của MKTRe. Hệ thống gom các quy trình quan trọng như nhập báo cáo, theo dõi KPI, ranking, Ads Dashboard, quản lý lead thả nổi, điểm danh, tài sản và đào tạo nội bộ vào một nền tảng có phân quyền rõ ràng theo Admin, Leader, Employee và Sale.

### Phiên bản chuyên nghiệp cho portfolio

Workspace MIZ is an internal performance operations platform designed for MKTRe’s Marketing and Sales teams. The system centralizes reporting, KPI tracking, Meta Ads performance monitoring, lead lifecycle management, attendance, asset management, training documents, and role-based administration. As Product Owner and System Designer, I structured the business logic, user flows, role permissions, and performance dashboards to help leadership manage daily marketing operations with clearer data and faster decision-making.

## 8. Suggested Screenshots

Các màn hình nên chụp để đưa vào portfolio:

1. **Dashboard Marketing**  
   Chụp màn hình tổng quan có doanh thu, chi phí ads, data và chỉ số hiệu suất.

2. **Ads Dashboard**  
   Chụp phần account selector, card giới hạn chi tiêu, bảng campaign, filter Active/All và trạng thái phân phối.

3. **Nhập báo cáo Marketing**  
   Chụp form nhập báo cáo theo khung giờ và phần chỉ số tự tính.

4. **KPI Marketing**  
   Chụp màn KPI team/cá nhân với bộ lọc thời gian, team, nhân sự và tiến độ KPI.

5. **Ranking Marketing**  
   Chụp bảng xếp hạng nhân sự/team theo hiệu suất.

6. **Kho thả nổi**  
   Chụp luồng Marketing upload số và Sale xử lý lead, hoặc Admin xem toàn bộ lifecycle.

7. **Sale Workspace**  
   Chụp trang Sale dashboard hoặc kho thả nổi để thể hiện hệ thống không chỉ phục vụ Marketing.

8. **Đào tạo**  
   Chụp giao diện tài liệu, tab Marketing/Sale, pinned documents và video/tài liệu nội bộ.

9. **Điểm danh**  
   Chụp lịch điểm danh tháng và trạng thái nhân sự.

10. **Admin User / Team Management**  
   Chụp màn quản lý user, role, team Marketing/Sale để thể hiện phân quyền hệ thống.

11. **Notification / Telegram Integration**  
   Nếu có ảnh thực tế, chụp notification center hoặc luồng Telegram approval. Nếu không, ghi chú là “Cần bổ sung ảnh thực tế”.

12. **Meta Ads Sync Architecture**  
   Có thể chụp Ads Dashboard kèm mô tả ngắn: frontend không giữ token, sync qua Supabase Edge Function.

## Notes for Portfolio Finalization

- Cần bổ sung thông tin thực tế về quy mô sử dụng: số lượng nhân sự, số team, số report/ngày, số lead/ngày.
- Cần bổ sung impact định lượng nếu có: thời gian tiết kiệm, mức giảm lỗi báo cáo, tốc độ tổng hợp KPI.
- Cần bổ sung ảnh chụp giao diện production hoặc staging với dữ liệu đã được ẩn thông tin nhạy cảm.
- Nên làm mờ số điện thoại, token, email cá nhân, doanh thu thật hoặc tên tài khoản quảng cáo nếu dùng ảnh public.
