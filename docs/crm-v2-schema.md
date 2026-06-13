# CRM V2 Schema Proposal

Tài liệu này là đề xuất kiến trúc dữ liệu CRM V2 cho Workspace MIZ.

Không tạo migration trong task này.

Mục tiêu CRM V2:
- Hỗ trợ Sale, Resale và Customer Lifetime Management.
- Tách khách hàng, nguồn lead, ghi chú, timeline và đơn hàng thành các bảng rõ trách nhiệm.
- Giảm phụ thuộc vào `raw_payload`.
- Chuẩn bị phân quyền Sale/Resale bền hơn.

## 1. Nguyên tắc thiết kế

1. Khách hàng là entity trung tâm.
2. Một khách hàng có thể có nhiều nguồn phát sinh lead.
3. Một khách hàng có thể có nhiều ghi chú.
4. Một khách hàng có nhiều hoạt động/timeline event.
5. Một khách hàng có nhiều đơn hàng.
6. Assignment Sale phải dùng FK thật thay vì chỉ lưu text.
7. Dữ liệu snapshot vẫn cần giữ ở một số nơi để audit lịch sử.
8. Lịch sử phân phối/chuyển giao Sale cần lưu append-only để phục vụ Sale, Resale và audit vận hành.

## 2. Bảng `customers`

### Purpose

Lưu hồ sơ khách hàng/contact chuẩn hóa, dùng chung cho Marketing, Sale và Resale.

### Primary key

- `id uuid primary key default gen_random_uuid()`

### Field đề xuất

| Field | Type | Purpose |
| --- | --- | --- |
| `id` | uuid | ID khách hàng |
| `legacy_marketing_contact_id` | uuid nullable | Mapping về `marketing_contacts.id` trong giai đoạn migration |
| `customer_name` | text nullable | Tên khách hàng |
| `primary_phone` | text not null | Số điện thoại chính |
| `normalized_phone` | text not null | Số điện thoại chuẩn hóa để dedupe |
| `secondary_phone` | text nullable | Số điện thoại phụ |
| `email` | text nullable | Email nếu có |
| `current_status` | text not null default `new` | Trạng thái lifecycle hiện tại |
| `is_duplicate` | boolean default false | Cờ trùng |
| `duplicate_of_customer_id` | uuid nullable FK `customers(id)` | Khách hàng/lead gốc nếu trùng |
| `duplicate_checked_at` | timestamptz nullable | Thời điểm check trùng |
| `eligible_for_sale_distribution` | boolean default true | Có đủ điều kiện chia Sale không |
| `owner_marketer_id` | uuid nullable FK `profiles(id)` | Marketer tạo/owner ban đầu |
| `marketing_team_id` | uuid nullable FK `teams(id)` | Team Marketing tạo lead |
| `assigned_sale_id` | uuid nullable FK `profiles(id)` | NVKD đang nhận khách |
| `assigned_sale_name` | text nullable | Snapshot tên NVKD |
| `assigned_sale_team_id` | uuid nullable FK `teams(id)` | Team Sale đang nhận |
| `assigned_sale_team_name` | text nullable | Snapshot tên team Sale |
| `company_name` | text nullable | Công ty/workspace |
| `latest_note_id` | uuid nullable | Note mới nhất, optional optimization |
| `latest_note_snapshot` | text nullable | Snapshot ghi chú gần đây, optional |
| `created_at` | timestamptz | Ngày lên số |
| `updated_at` | timestamptz | Ngày cập nhật |
| `archived_at` | timestamptz nullable | Ẩn/lưu trữ nếu cần |
| `deleted_at` | timestamptz nullable | Soft delete nếu cần |

### Relationships

- `customers.owner_marketer_id -> profiles.id`
- `customers.marketing_team_id -> teams.id`
- `customers.assigned_sale_id -> profiles.id`
- `customers.assigned_sale_team_id -> teams.id`
- `customers.duplicate_of_customer_id -> customers.id`
- `customers` has many `customer_sources`
- `customers` has many `customer_notes`
- `customers` has many `customer_activities`
- `customers` has many `customer_orders`
- `customers` has many `customer_assignments`

## 3. Bảng `customer_sources`

### Purpose

Lưu từng lần khách hàng được tạo/đẩy về từ một nguồn Marketing. Một khách hàng có thể xuất hiện nhiều lần từ nhiều nguồn hoặc cùng nguồn ở các thời điểm khác nhau.

### Primary key

- `id uuid primary key default gen_random_uuid()`

### Field đề xuất

| Field | Type | Purpose |
| --- | --- | --- |
| `id` | uuid | ID source event |
| `customer_id` | uuid not null FK `customers(id)` | Khách hàng |
| `lead_source_id` | uuid nullable FK `lead_sources(id)` | Nguồn Marketing master |
| `source_token` | text nullable | Token lúc ingest |
| `source_name` | text nullable | Snapshot tên nguồn |
| `source_channel` | text nullable | Kênh chạy |
| `product` | text nullable | Nhãn sản phẩm |
| `landing_url` | text nullable | URL landing/page |
| `campaign_name` | text nullable | Campaign |
| `adset_name` | text nullable | Adset |
| `ad_name` | text nullable | Ad |
| `owner_user_id` | uuid nullable FK `profiles(id)` | Marketer owner tại thời điểm nhận lead |
| `team_id` | uuid nullable FK `teams(id)` | Team Marketing tại thời điểm nhận lead |
| `raw_payload` | jsonb default `{}` | Payload gốc để audit |
| `received_at` | timestamptz default now() | Thời điểm nhận lead |
| `created_at` | timestamptz default now() | Ngày tạo record |

### Relationships

- `customer_sources.customer_id -> customers.id`
- `customer_sources.lead_source_id -> lead_sources.id`
- `customer_sources.owner_user_id -> profiles.id`
- `customer_sources.team_id -> teams.id`

## 4. Bảng `customer_assignments`

### Purpose

Lưu lịch sử phân phối, chuyển NVKD, chuyển team Sale và phân phối Resale cho khách hàng. Bảng này là assignment ledger, không thay thế field trạng thái hiện tại trên `customers`; `customers.assigned_sale_id/name` và `customers.sale_team_id/name` vẫn là snapshot hiện tại, còn `customer_assignments` lưu lịch sử thay đổi.

### Primary key

- `id uuid primary key default gen_random_uuid()`

### Field đề xuất / đã triển khai phase foundation

| Field | Type | Purpose |
| --- | --- | --- |
| `id` | uuid | ID assignment event |
| `customer_id` | uuid not null FK `customers(id)` | Khách hàng được phân phối/chuyển giao |
| `from_sale_id` | uuid nullable FK `profiles(id)` | NVKD cũ nếu là chuyển giao |
| `from_sale_name` | text nullable | Snapshot tên NVKD cũ |
| `from_sale_team_id` | uuid nullable FK `teams(id)` | Team Sale cũ |
| `from_sale_team_name` | text nullable | Snapshot tên team Sale cũ |
| `to_sale_id` | uuid nullable FK `profiles(id)` | NVKD mới |
| `to_sale_name` | text nullable | Snapshot tên NVKD mới |
| `to_sale_team_id` | uuid nullable FK `teams(id)` | Team Sale mới |
| `to_sale_team_name` | text nullable | Snapshot tên team Sale mới |
| `assignment_type` | text not null | `auto_assign`, `manual_assign`, `transfer_sale`, `transfer_team`, `resale_assign` |
| `reason` | text nullable | Lý do/chính sách phân phối |
| `note` | text nullable | Ghi chú của lần phân phối |
| `assigned_by` | uuid nullable FK `profiles(id)` | Người thực hiện |
| `assigned_by_name` | text nullable | Snapshot tên người thực hiện |
| `assigned_at` | timestamptz default now() | Thời điểm phân phối/chuyển giao |
| `created_at` | timestamptz default now() | Thời điểm tạo record |

### Relationships

- `customer_assignments.customer_id -> customers.id`
- `customer_assignments.from_sale_id -> profiles.id`
- `customer_assignments.to_sale_id -> profiles.id`
- `customer_assignments.from_sale_team_id -> teams.id`
- `customer_assignments.to_sale_team_id -> teams.id`

### Permission direction

- Admin/Manager: tạo và đọc toàn bộ assignment.
- Employee Marketing/Leader Marketing: đọc assignment của customer thuộc quyền xem qua `crm_v2_can_access_customer`.
- Sale: đọc assignment của customer được phân phối cho mình.
- Leader Sale: đọc assignment của customer thuộc team Sale mình.
- Marketing không được insert/update/delete assignment.
- Sale/Leader Sale chưa mở quyền ghi ở phase này vì chưa có Sale UI.

### Backfill phase

Migration `20260611210000_crm_v2_customer_assignments.sql` tạo `manual_assign` từ snapshot hiện tại trên `customers.assigned_sale_name` / `customers.sale_team_name`, bỏ qua placeholder như `Chưa phân phối`, `Đang tự động chia`, `—`, `-`.

## 5. Bảng `customer_notes`

### Purpose

Lưu ghi chú thật của khách hàng, thay thế dần `contact_notes` và legacy note trong `raw_payload`.

### Primary key

- `id uuid primary key default gen_random_uuid()`

### Field đề xuất

| Field | Type | Purpose |
| --- | --- | --- |
| `id` | uuid | ID ghi chú |
| `customer_id` | uuid not null FK `customers(id)` | Khách hàng |
| `content` | text not null | Nội dung ghi chú |
| `note_type` | text default `sale` | sale/internal/system/resale |
| `created_by` | uuid nullable FK `profiles(id)` | Người tạo |
| `created_by_name` | text nullable | Snapshot tên người tạo |
| `created_at` | timestamptz default now() | Ngày tạo |
| `updated_at` | timestamptz default now() | Ngày sửa |
| `deleted_at` | timestamptz nullable | Soft delete |
| `deleted_by` | uuid nullable FK `profiles(id)` | Người xóa |

### Relationships

- `customer_notes.customer_id -> customers.id`
- `customer_notes.created_by -> profiles.id`
- `customer_notes.deleted_by -> profiles.id`

### Permission direction

- Marketing: read-only notes của contact thuộc quyền xem.
- Sale: tạo/sửa/xóa mềm note của khách được phân phối cho mình.
- Leader Sale: xem note của team, tùy policy có thể quản lý note team.
- Admin/Manager: toàn quyền.

## 6. Bảng `customer_activities`

### Purpose

Lưu timeline hoạt động bền vững, thay cho timeline synthesize trong UI.

### Primary key

- `id uuid primary key default gen_random_uuid()`

### Field đề xuất

| Field | Type | Purpose |
| --- | --- | --- |
| `id` | uuid | ID activity |
| `customer_id` | uuid not null FK `customers(id)` | Khách hàng |
| `actor_id` | uuid nullable FK `profiles(id)` | Người thao tác |
| `actor_name` | text nullable | Snapshot tên actor |
| `actor_role` | text nullable | Role actor |
| `actor_team_name` | text nullable | Team snapshot |
| `activity_type` | text not null | created/assigned/status_changed/note_created/order_created/duplicate_detected |
| `title` | text not null | Tiêu đề ngắn |
| `description` | text nullable | Nội dung chi tiết |
| `metadata` | jsonb default `{}` | Dữ liệu phụ: from/to sale, from/to team, old/new status... |
| `created_at` | timestamptz default now() | Thời điểm hoạt động |

### Relationships

- `customer_activities.customer_id -> customers.id`
- `customer_activities.actor_id -> profiles.id`

### Activity types đề xuất

- `lead_created`
- `duplicate_detected`
- `assigned_sale`
- `changed_sale_owner`
- `changed_sale_team`
- `status_changed`
- `note_created`
- `note_updated`
- `note_deleted`
- `order_created`
- `order_status_changed`
- `resale_received`

## 7. Bảng `customer_orders`

### Purpose

Lưu lịch sử mua hàng/đơn hàng gắn với khách hàng.

### Primary key

- `id uuid primary key default gen_random_uuid()`

### Field đề xuất

| Field | Type | Purpose |
| --- | --- | --- |
| `id` | uuid | ID order CRM |
| `customer_id` | uuid not null FK `customers(id)` | Khách hàng |
| `invoice_id` | uuid nullable | Link invoice nội bộ nếu có |
| `order_code` | text nullable | Mã đơn/Odoo/POS |
| `confirmed_at` | timestamptz nullable | Ngày xác nhận |
| `product_summary` | text nullable | Tóm tắt sản phẩm |
| `total_amount` | numeric default 0 | Tổng tiền |
| `currency` | text default `VND` | Đơn vị tiền |
| `payment_method` | text nullable | COD/transfer... |
| `shipping_address` | text nullable | Địa chỉ nhận hàng |
| `final_status` | text nullable | Trạng thái cuối |
| `raw_payload` | jsonb default `{}` | Payload order/Odoo/POS nếu sync ngoài |
| `created_at` | timestamptz default now() | Ngày tạo |
| `updated_at` | timestamptz default now() | Ngày cập nhật |

### Relationships

- `customer_orders.customer_id -> customers.id`
- Optional future: `customer_orders.invoice_id -> invoices.id`

## 8. Giữ hay đổi `lead_sources`

`lead_sources` hiện có thể giữ làm bảng master nguồn Marketing.

CRM V2 không nhất thiết đổi tên bảng này ngay. Có thể:
- Giữ `lead_sources` cho cấu hình nguồn/API token.
- Thêm `customer_sources` để lưu từng lần khách vào từ nguồn.

Quan hệ:
- `lead_sources` = source configuration.
- `customer_sources` = source event/history.

## 9. Trạng thái CRM V2 đề xuất

Trạng thái customer/contact:

| Value | Label UI |
| --- | --- |
| `new` | Mới |
| `processing` | Đang xử lí |
| `called` | Đã gọi |
| `resale_received` | Resale nhận |
| `duplicate` | Trùng |
| `success` | Hoàn thành |
| `cancelled` | Huỷ |
| `quoted` | Báo giá |
| `shipping` | Đang giao |
| `returned` | Hoàn |

Không nên dùng status để thay thế mọi thứ. Các khái niệm nên tách:
- `current_status`: trạng thái xử lý.
- `is_duplicate`: cờ trùng.
- `eligible_for_sale_distribution`: đủ điều kiện chia Sale.
- `final_status` trong order: trạng thái đơn hàng.

## 10. RLS định hướng

Định hướng phân quyền CRM V2:

| Role | Quyền dữ liệu |
| --- | --- |
| Admin/Manager | Xem/quản lý toàn bộ CRM |
| Employee Marketing | Xem khách do mình tạo/source mình sở hữu; không sửa note Sale |
| Leader Marketing | Xem khách của team Marketing mình |
| Sale | Xem khách được phân phối cho mình; tạo/sửa/xóa mềm note của mình |
| Leader Sale | Xem khách thuộc team Sale mình; quản lý assignment/note theo scope team nếu được phép |
| Resale | Xem khách được chuyển Resale hoặc trạng thái Resale nhận |

## 11. Chỉ số sẵn sàng

CRM V2 nên được triển khai theo từng bước:
1. Tạo bảng mới.
2. Backfill dữ liệu.
3. Dual-read ở service.
4. Dual-write từ ingest.
5. Cutover UI sang V2.
6. Dọn legacy raw payload khi đủ dữ liệu.
