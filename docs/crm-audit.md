# CRM Audit - Workspace MIZ

Ngày audit: 11/06/2026

Phạm vi audit:
- `marketing_contacts`
- `contact_notes`
- `lead_sources`
- API ingest lead
- Trang Employee Marketing > Liên hệ khách hàng
- Popup chi tiết lead
- Timeline hoạt động
- Logic trạng thái lead
- Logic phân phối Sale hiện tại

Tài liệu này chỉ phản ánh trạng thái source code hiện tại. Không tạo migration, không sửa UI, không đổi route.

## 1. Tổng quan CRM hiện tại

CRM hiện tại đang là module dành cho Nhân viên Marketing để xem data/lead khách hàng đổ về từ Nguồn Marketing.

Luồng chính:
1. Nhân viên Marketing tạo `lead_sources`.
2. API `/api/leads/ingest/:sourceToken` nhận lead từ Landing Page/Form/nguồn ngoài.
3. API insert lead vào `marketing_contacts`.
4. Trang Liên hệ khách hàng đọc `marketing_contacts`, join `lead_sources`, `profiles`, `teams`, và đọc thêm `contact_notes`.
5. UI hiển thị danh sách lead, filter, saved filters, cấu hình cột, Kanban, popup chi tiết.

CRM hiện tại chưa phải CRM đầy đủ cho Sale/Resale. Phần Sale assignment, timeline, order history hiện còn lai giữa field thật, `raw_payload`, dữ liệu fallback và mock UI.

## 2. Bảng `lead_sources`

Mục đích hiện tại:
- Lưu nguồn Marketing do nhân viên Marketing tạo.
- Sinh `source_token`.
- Dùng token này cho API ingest lead.

Field chính:

| Field | Ý nghĩa | Ghi chú |
| --- | --- | --- |
| `id` | ID nguồn | UUID PK |
| `source_token` | Token public của nguồn | Unique, dùng trong URL ingest |
| `name` | Tên nguồn | Ví dụ: Huy - NOTRIGOLD - Facebook chuyển đổi |
| `product` | Nhãn sản phẩm | Default `NOTRIGOLD` |
| `channel` | Kênh chạy | Facebook mess, Facebook chuyển đổi, Tiktok... |
| `team_id` | Team Marketing | FK `teams(id)` |
| `owner_user_id` | Người tạo nguồn | FK `profiles(id)` |
| `is_active` | Bật/tắt nguồn | API ingest từ chối nếu nguồn tắt |
| `created_at` | Ngày tạo |  |
| `updated_at` | Ngày cập nhật |  |

RLS hiện tại:
- Admin toàn quyền.
- Owner Marketing được xem/tạo/sửa nguồn của chính mình.

## 3. Bảng `marketing_contacts`

Mục đích hiện tại:
- Lưu lead/contact đầu vào từ nguồn Marketing.
- Là trung tâm dữ liệu cho trang Liên hệ khách hàng.
- Chứa cả dữ liệu khách hàng, source attribution, trạng thái, phân phối Sale, duplicate, và payload thô.

### 3.1 Field đang có

| Field | Ý nghĩa hiện tại | UI đang dùng | Ghi chú |
| --- | --- | --- | --- |
| `id` | ID contact | Có | Dùng mở chi tiết, note, mapping |
| `lead_source_id` | Nguồn lead FK | Có gián tiếp | Join `lead_sources` |
| `source_token` | Token nguồn | Có gián tiếp | Trùng ý nghĩa với `lead_source_id` |
| `owner_user_id` | Marketer sở hữu | Có | Join `profiles` để hiển thị Marketer |
| `team_id` | Team Marketing | Có | Join `teams` để hiển thị Team MKT |
| `customer_name` | Tên khách hàng | Có | Cột Khách hàng, popup |
| `phone` | SĐT chính | Có | Bảng, popup, copy |
| `normalized_phone` | SĐT chuẩn hóa | Không hiển thị | Dùng duplicate/search backend |
| `email` | Email | Không hiển thị bảng | API vẫn nhận, search có thể dùng |
| `message` | Nội dung/ghi chú từ nguồn | Có fallback | Dùng làm ghi chú/source message nếu không có note |
| `landing_url` | URL landing | Không được select trực tiếp trong service hiện tại | UI đang ưu tiên `raw_payload.landing_url` |
| `campaign_name` | Campaign | Không hiển thị | Lưu từ ingest, chưa dùng UI |
| `adset_name` | Adset | Không hiển thị | Lưu từ ingest, chưa dùng UI |
| `ad_name` | Ad | Không hiển thị | Lưu từ ingest, chưa dùng UI |
| `source_name` | Tên nguồn snapshot | Có | Hiển thị Nguồn |
| `source_channel` | Kênh nguồn snapshot | Có | Badge/filter nguồn |
| `sales_owner_name` | Tên NVKD được phân phối | Có | Text-only, chưa FK thật |
| `sales_team_name` | Đội ngũ bán hàng | Có | Text-only, chưa FK thật |
| `status` | Trạng thái lead | Có | Badge, tab/filter, Kanban |
| `is_duplicate` | Cờ trùng | Có | Cột/popup/status logic |
| `duplicate_scope` | Phạm vi duplicate | Không hiển thị | Audit/backend only |
| `raw_payload` | Payload thô | Có nhiều fallback | Đang chứa dữ liệu phụ, notes, order mock, assignment id |
| `created_at` | Ngày lên số | Có | Bảng/popup/filter |
| `updated_at` | Ngày cập nhật | Có fallback | Note fallback/activity |
| `duplicate_of_contact_id` | Lead gốc bị trùng | Có gián tiếp | Popup không còn card trùng, vẫn dùng logic |
| `duplicate_checked_at` | Thời điểm check trùng | Không hiển thị chính | Dùng audit/tracking |
| `eligible_for_sale_distribution` | Có đủ điều kiện chia Sale không | Có | Duplicate = false, new = true |

### 3.2 Field đang dùng trên UI

Các field trực tiếp hoặc gián tiếp đang dùng:
- `id`
- `customer_name`
- `phone`
- `email` trong search/fallback, nhưng không còn hiển thị cột email
- `message`
- `source_name`
- `source_channel`
- `sales_owner_name`
- `sales_team_name`
- `status`
- `is_duplicate`
- `duplicate_of_contact_id`
- `duplicate_checked_at`
- `eligible_for_sale_distribution`
- `created_at`
- `updated_at`
- `owner_user_id` qua join profile
- `team_id` qua join team
- `lead_source_id` qua join lead source
- `raw_payload`

Các phần trong `raw_payload` đang được UI/service đọc:
- `secondary_phone`, `secondaryPhone`, `alternate_phone`, `alternatePhone`
- `sales_owner_profile_id`
- `sales_owner_employee_code`
- `sales_team_id`
- `landing_url`
- `message`
- `sale_note`
- `note`
- `latest_note`
- `notes`
- `note_history`
- `sale_notes`
- `orders`
- một số field legacy khác phục vụ fallback.

### 3.3 Field đang không dùng hoặc dùng rất nhẹ

| Field | Nhận xét |
| --- | --- |
| `landing_url` | Có column thật nhưng service hiện đang lấy `raw_payload.landing_url` cho UI. Nên chuẩn hóa lại về column thật. |
| `campaign_name` | Được insert từ API nhưng chưa hiển thị trong UI chính. |
| `adset_name` | Được insert từ API nhưng chưa hiển thị trong UI chính. |
| `ad_name` | Được insert từ API nhưng chưa hiển thị trong UI chính. |
| `duplicate_scope` | Có giá trị audit nhưng chưa dùng UI. |
| `normalized_phone` | Đúng vai trò kỹ thuật, không cần UI. |
| `email` | API còn nhận nhưng UI liên hệ đã bỏ email khỏi bảng/cấu hình cột. |

### 3.4 Field đang trùng ý nghĩa

| Nhóm field | Vấn đề |
| --- | --- |
| `lead_source_id` + `source_token` | Cùng đại diện nguồn. Token cần cho ingest, nhưng data relation nên dựa vào `lead_source_id`. |
| `source_name`/`source_channel` + `lead_sources.name`/`lead_sources.channel` | Vừa lưu snapshot vừa join master source. Cần định nghĩa rõ: snapshot để giữ lịch sử, master để quản lý nguồn. |
| `message` + `raw_payload.message` + `raw_payload.note` + `raw_payload.sale_note` + `contact_notes` | Nhiều nguồn ghi chú, dễ lệch giữa "Ghi chú gần đây" và "Lịch sử ghi chú". |
| `sales_owner_name` + `raw_payload.sales_owner_profile_id` + `raw_payload.sales_owner_employee_code` | Sale assignment hiện vừa text vừa payload id, chưa có FK chính thức. |
| `sales_team_name` + `raw_payload.sales_team_id` | Team Sale hiện text là chính, id nằm trong payload nếu có. |
| `status` + `is_duplicate` + `duplicate_scope` + `eligible_for_sale_distribution` | Duplicate vừa là trạng thái, vừa là cờ, vừa ảnh hưởng queue Sale. Cần tách business state và distribution eligibility. |
| `owner_user_id`/`team_id` + dữ liệu từ `lead_sources` | Contact lưu owner/team snapshot riêng, đồng thời nguồn cũng có owner/team. Cần giữ snapshot nếu muốn audit, nhưng cần quy tắc rõ. |

### 3.5 Field nên chuyển sang bảng riêng trong CRM V2

| Nhóm dữ liệu | Nên chuyển sang | Lý do |
| --- | --- | --- |
| Thông tin khách hàng định danh | `customers` | Tên, phone, normalized phone, email, phone phụ nên là hồ sơ khách hàng. |
| Attribution nguồn/campaign/adset/ad | `customer_sources` | Một khách có thể vào từ nhiều nguồn nhiều lần. |
| Ghi chú Sale/Resale | `customer_notes` | Đã bắt đầu bằng `contact_notes`, nên nâng cấp thành notes thật theo customer. |
| Timeline hoạt động | `customer_activities` | Hiện timeline phần lớn synthesize từ UI/raw payload, chưa bền. |
| Đơn hàng/lịch sử mua | `customer_orders` | Hiện order chủ yếu từ sample/raw payload, chưa có relation CRM chính thức. |
| Phân phối Sale | `customer_assignments` hoặc field FK trong `customers` + activity | Cần id thật cho sale/team, không chỉ text. |
| Duplicate relation | `customers.duplicate_of_customer_id` hoặc bảng riêng | Cần tracking duplicate bền, hỗ trợ 7-day rule và lifecycle. |

## 4. Bảng `contact_notes`

Mục đích hiện tại:
- Lưu ghi chú thật cho `marketing_contacts`.
- Chuẩn bị cho Sale thêm/sửa/xóa ghi chú sau này.
- Marketing hiện chỉ xem.

Field chính:

| Field | Ý nghĩa |
| --- | --- |
| `id` | ID note |
| `contact_id` | FK `marketing_contacts(id)` |
| `content` | Nội dung ghi chú |
| `created_by` | Người tạo note |
| `created_by_name` | Snapshot tên người tạo |
| `created_at` | Ngày tạo |
| `updated_at` | Ngày sửa |
| `deleted_at` | Soft delete |
| `deleted_by` | Người xóa |

RLS hiện tại:
- Admin/Manager toàn quyền.
- Marketing owner đọc note của contact mình tạo.
- Leader Marketing đọc note của contact trong team mình.
- Sale/Leader Sale đọc/ghi/sửa/xóa theo contact được phân phối bằng `raw_payload.sales_owner_profile_id`.

Nhận xét:
- Đây là hướng đúng, nhưng RLS Sale đang phụ thuộc `raw_payload`, chưa phải assignment FK thật.
- Backfill đã có từ một số legacy note field, nhưng vẫn cần duy trì fallback UI cho dữ liệu cũ.

## 5. API ingest lead

Route hiện tại:
- `/api/leads/ingest/:sourceToken`

Input JSON:
- `name`
- `phone`
- `email`
- `message`
- `landing_url`
- `campaign_name`
- `adset_name`
- `ad_name`

Logic chính:
1. Tìm `lead_sources` theo `source_token`.
2. Nếu không tồn tại trả JSON 404.
3. Nếu nguồn tắt trả JSON 403.
4. Chuẩn hóa SĐT Việt Nam vào `normalized_phone`.
5. Check duplicate trong 7 ngày gần nhất theo `normalized_phone`, chỉ tính trùng nếu lead cũ chưa ở trạng thái chốt.
6. Insert vào `marketing_contacts`.
7. Nếu duplicate:
   - `status = duplicate`
   - `is_duplicate = true`
   - `eligible_for_sale_distribution = false`
   - `sales_owner_name = null`
   - `sales_team_name = null`
8. Nếu không duplicate:
   - `status = new`
   - `is_duplicate = false`
   - `eligible_for_sale_distribution = true`
   - Sale/team mặc định `Chưa phân phối`

Điểm tốt:
- API trả JSON cho lỗi.
- Có duplicate 7 ngày.
- Có field chuẩn bị queue Sale.

Điểm cần chuẩn hóa:
- Duplicate check của API ingest và `createMarketingContact` trong UI chưa hoàn toàn cùng rule. UI tạo thủ công đang check trùng theo owner, không cùng logic 7 ngày toàn hệ thống.
- Assignment Sale vẫn text/fallback, chưa có FK.

## 6. Timeline activities

Hiện tại chưa có bảng activity thật.

Nguồn timeline trong UI:
- `activityGroups` nếu có trong data/sample.
- Fallback synthesize từ:
  - Lead được tạo
  - Assignment Sale
  - Status hiện tại
  - Duplicate
  - Note/order mock nếu có.

Rủi ro:
- Timeline không bền, khó audit.
- Không thể reconstruct chính xác ai chuyển trạng thái, ai chuyển team, ai đổi NVKD nếu không ghi event thật.
- Không phù hợp cho CRM/Sale/Resale lâu dài nếu giữ ở UI/raw_payload.

Nên chuyển sang `customer_activities`.

## 7. Lead status hiện tại

UI/service hiện hỗ trợ các trạng thái:
- `new` -> Mới
- `processing` -> Đang xử lí
- `called` -> Đã gọi
- `resale_received` -> Resale nhận
- `duplicate` -> Trùng
- `success` -> Hoàn thành
- `cancelled` -> Huỷ
- `quoted` -> Báo giá
- `shipping` -> Đang giao
- `returned` -> Hoàn

Ngoài UI, `normalizeContactStatus` còn map nhiều biến thể legacy như:
- `completed`, `closed` -> `success`
- `cancel`, `canceled`, `huỷ` -> `cancelled`
- `quote`, `bao_gia`, `báo giá` -> `quoted`
- `ship`, `delivering`, `dang_giao`, `đang giao` -> `shipping`

Nhận xét:
- Status đã bắt đầu mở rộng sang lifecycle Sale/Resale.
- Cần tách rõ:
  - Contact lifecycle status.
  - Duplicate flag.
  - Sale distribution eligibility.
  - Order status.

## 8. Sale distribution hiện tại

Field hiện tại:
- `sales_owner_name`
- `sales_team_name`
- `eligible_for_sale_distribution`
- `raw_payload.sales_owner_profile_id`
- `raw_payload.sales_owner_employee_code`
- `raw_payload.sales_team_id`

UI hiện tại:
- Lead duplicate hiển thị `—` cho NVKD/team.
- Lead chưa chia hiển thị `Chưa phân phối`.
- Lead mới không trùng có `eligible_for_sale_distribution = true`.

Chưa có:
- Bảng assignment riêng.
- FK chuẩn đến `profiles` cho assigned Sale.
- FK chuẩn đến Sale team.
- Lịch sử chuyển sale/team thật trong DB.

Kết luận:
- Hiện tại đủ cho Marketing xem trạng thái phân phối cơ bản.
- Chưa đủ cho Sale/Resale workflow chính thức.

## 9. Kết luận audit

Module Liên hệ khách hàng hiện là CRM inbound lead cho Marketing, đã có nền tảng quan trọng:
- Lead source thật.
- Ingest API thật.
- Contact table thật.
- Duplicate 7 ngày.
- Contact notes thật.
- UI filter/saved filter/Kanban/detail tương đối đầy đủ.

Tuy nhiên, để phát triển Sale + Resale + Customer Lifetime Management, cần chuyển từ `marketing_contacts` sang mô hình khách hàng trung tâm:
- `customers`
- `customer_sources`
- `customer_notes`
- `customer_activities`
- `customer_orders`

Trọng tâm V2 là tách dữ liệu khách hàng, nguồn, ghi chú, hoạt động, đơn hàng và phân phối Sale khỏi một bảng `marketing_contacts` đang chứa quá nhiều trách nhiệm.
