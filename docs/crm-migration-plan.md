# CRM Migration Plan - marketing_contacts to CRM V2

Tài liệu này mô tả mapping và kế hoạch migration dữ liệu từ CRM hiện tại sang CRM V2.

Không tạo migration trong task này.

## 1. Mục tiêu migration

Nguồn hiện tại:
- `marketing_contacts`
- `lead_sources`
- `contact_notes`
- `raw_payload`

Đích đề xuất:
- `customers`
- `customer_sources`
- `customer_notes`
- `customer_activities`
- `customer_orders`
- `customer_assignments`

Migration cần giữ tương thích để không làm mất:
- Lead Marketing hiện tại.
- Duplicate logic 7 ngày.
- Ghi chú Sale.
- Timeline đang hiển thị.
- Lịch sử mua hàng mock/raw payload nếu có.
- Lịch sử phân phối/chuyển NVKD/team Sale nếu có snapshot trên contact/customer.

## 2. Mapping `marketing_contacts` -> `customers`

| Source | Target | Ghi chú |
| --- | --- | --- |
| `marketing_contacts.id` | `customers.legacy_marketing_contact_id` | Giữ mapping legacy |
| `marketing_contacts.customer_name` | `customers.customer_name` | Nếu null fallback `raw_payload.name` |
| `marketing_contacts.phone` | `customers.primary_phone` | SĐT chính |
| `marketing_contacts.normalized_phone` | `customers.normalized_phone` | Dùng dedupe |
| `marketing_contacts.email` | `customers.email` | UI không hiển thị nhưng nên giữ |
| `raw_payload.secondary_phone` | `customers.secondary_phone` | Fallback thêm `secondaryPhone`, `alternate_phone`, `alternatePhone` |
| `marketing_contacts.status` | `customers.current_status` | Normalize theo map hiện tại |
| `marketing_contacts.is_duplicate` | `customers.is_duplicate` | Cờ trùng |
| `marketing_contacts.duplicate_of_contact_id` | `customers.duplicate_of_customer_id` | Cần mapping contact_id -> customer_id sau khi tạo customers |
| `marketing_contacts.duplicate_checked_at` | `customers.duplicate_checked_at` |  |
| `marketing_contacts.eligible_for_sale_distribution` | `customers.eligible_for_sale_distribution` |  |
| `marketing_contacts.owner_user_id` | `customers.owner_marketer_id` | Marketer owner |
| `marketing_contacts.team_id` | `customers.marketing_team_id` | Team MKT |
| `marketing_contacts.sales_owner_name` | `customers.assigned_sale_name` | Text snapshot |
| `raw_payload.sales_owner_profile_id` | `customers.assigned_sale_id` | FK nếu hợp lệ |
| `marketing_contacts.sales_team_name` | `customers.assigned_sale_team_name` | Text snapshot |
| `raw_payload.sales_team_id` | `customers.assigned_sale_team_id` | FK nếu hợp lệ |
| `profiles.company_name` qua owner | `customers.company_name` | Hoặc company_id nếu sau này có company table |
| latest note từ `contact_notes` | `customers.latest_note_id`/`latest_note_snapshot` | Optional optimization |
| `marketing_contacts.created_at` | `customers.created_at` | Ngày lên số |
| `marketing_contacts.updated_at` | `customers.updated_at` | Ngày cập nhật |

## 3. Mapping `marketing_contacts` + `lead_sources` -> `customer_sources`

| Source | Target | Ghi chú |
| --- | --- | --- |
| generated | `customer_sources.id` | UUID mới |
| mapped customer | `customer_sources.customer_id` | FK khách hàng mới |
| `marketing_contacts.lead_source_id` | `customer_sources.lead_source_id` | FK nguồn master |
| `marketing_contacts.source_token` | `customer_sources.source_token` | Token lúc ingest |
| `marketing_contacts.source_name` | `customer_sources.source_name` | Fallback `lead_sources.name` |
| `marketing_contacts.source_channel` | `customer_sources.source_channel` | Fallback `lead_sources.channel` |
| `lead_sources.product` | `customer_sources.product` | Nếu thiếu fallback raw/source default |
| `marketing_contacts.landing_url` | `customer_sources.landing_url` | Nếu service cũ không select, vẫn lấy từ DB khi migration |
| `raw_payload.landing_url` | `customer_sources.landing_url` | Fallback nếu column null |
| `marketing_contacts.campaign_name` | `customer_sources.campaign_name` |  |
| `marketing_contacts.adset_name` | `customer_sources.adset_name` |  |
| `marketing_contacts.ad_name` | `customer_sources.ad_name` |  |
| `marketing_contacts.owner_user_id` | `customer_sources.owner_user_id` | Snapshot owner |
| `marketing_contacts.team_id` | `customer_sources.team_id` | Snapshot team |
| `marketing_contacts.raw_payload` | `customer_sources.raw_payload` | Audit payload |
| `marketing_contacts.created_at` | `customer_sources.received_at` | Thời điểm nhận lead |

## 4. Mapping `contact_notes` -> `customer_notes`

| Source | Target | Ghi chú |
| --- | --- | --- |
| generated | `customer_notes.id` | UUID mới hoặc giữ id nếu muốn |
| mapped customer | `customer_notes.customer_id` | Mapping từ `contact_id` |
| `contact_notes.content` | `customer_notes.content` |  |
| `contact_notes.created_by` | `customer_notes.created_by` |  |
| `contact_notes.created_by_name` | `customer_notes.created_by_name` |  |
| `contact_notes.created_at` | `customer_notes.created_at` |  |
| `contact_notes.updated_at` | `customer_notes.updated_at` |  |
| `contact_notes.deleted_at` | `customer_notes.deleted_at` | Chỉ hiển thị note chưa delete |
| `contact_notes.deleted_by` | `customer_notes.deleted_by` |  |

Legacy fallback cần backfill thêm nếu chưa có trong `contact_notes`:
- `raw_payload.sale_note`
- `raw_payload.note`
- `raw_payload.latest_note`
- `raw_payload.notes[]`
- `raw_payload.note_history[]`
- `raw_payload.sale_notes[]`

Quy tắc chống trùng:
- Không tạo note trùng nếu cùng `customer_id` + `content`.

## 5. Mapping assignment hiện tại -> `customer_assignments`

CRM V2 cần tách lịch sử phân phối Sale ra khỏi snapshot hiện tại trên customer. Snapshot hiện tại vẫn nằm trên `customers`, còn `customer_assignments` lưu event lịch sử.

Nguồn phase đầu:
- `customers.assigned_sale_id`
- `customers.assigned_sale_name`
- `customers.sale_team_id`
- `customers.sale_team_name`
- `customers.updated_at`
- `customers.created_at`

Mapping backfill:

| Source | Target | Ghi chú |
| --- | --- | --- |
| `customers.id` | `customer_assignments.customer_id` | FK khách hàng |
| `customers.assigned_sale_id` | `customer_assignments.to_sale_id` | Nếu đã map được FK |
| `customers.assigned_sale_name` | `customer_assignments.to_sale_name` | Snapshot tên NVKD |
| `customers.sale_team_id` | `customer_assignments.to_sale_team_id` | Nếu đã map được FK |
| `customers.sale_team_name` | `customer_assignments.to_sale_team_name` | Snapshot team Sale |
| generated | `customer_assignments.assignment_type` | `manual_assign` cho backfill |
| generated | `customer_assignments.reason` | `Backfill từ marketing_contacts` |
| generated | `customer_assignments.assigned_by_name` | `Hệ thống` |
| `COALESCE(updated_at, created_at)` | `customer_assignments.assigned_at` | Thời điểm snapshot gần nhất |

Quy tắc chống trùng:
- Không tạo assignment trùng nếu cùng `customer_id` + `to_sale_name` + `to_sale_team_name` + `assignment_type` + `assigned_at`.
- Bỏ qua placeholder chưa phân phối như `Chưa phân phối`, `Đang tự động chia`, `—`, `-`.

Activity đi kèm:
- Tạo `customer_activities.activity_type = assigned_sale`.
- Description: `Backfill phân phối Sale: [to_sale_name] / [to_sale_team_name]`.
- Không tạo trùng nếu customer đã có activity cùng description.

## 6. Mapping timeline -> `customer_activities`

Hiện chưa có bảng activity thật. Migration nên tạo activity từ nhiều nguồn:

| Source hiện tại | Target activity |
| --- | --- |
| `marketing_contacts.created_at` | `lead_created` |
| `marketing_contacts.is_duplicate = true` | `duplicate_detected` |
| `sales_owner_name` có dữ liệu | `assigned_sale` |
| `status` khác `new` | `status_changed` snapshot |
| `contact_notes.created_at` | `note_created` |
| `raw_payload.activityGroups` nếu có | activity tương ứng |
| `raw_payload.orders` nếu có | `order_created` hoặc `order_status_changed` |

Lưu ý:
- Timeline hiện tại trong UI có thể là dữ liệu synthesize, không đảm bảo actor chính xác.
- Activity migration đầu tiên nên đánh dấu `metadata.source = legacy_backfill`.

## 7. Mapping order history -> `customer_orders`

Hiện chưa có relation order chính thức giữa CRM contact và invoice/order thật.

Nguồn hiện tại:
- `raw_payload.orders` trong sample/fallback.
- Có module invoice riêng, nhưng chưa thấy link CRM contact chính thức.

Mapping đề xuất từ raw payload nếu có:

| Source | Target |
| --- | --- |
| `order.code` / `order.order_code` | `customer_orders.order_code` |
| `order.confirmed_at` | `customer_orders.confirmed_at` |
| `order.product_summary` | `customer_orders.product_summary` |
| `order.total_amount` | `customer_orders.total_amount` |
| `order.currency` | `customer_orders.currency` |
| `order.payment_method` | `customer_orders.payment_method` |
| `order.shipping_address` | `customer_orders.shipping_address` |
| `order.final_status` | `customer_orders.final_status` |
| full order json | `customer_orders.raw_payload` |

Future mapping:
- Khi invoice/order module có `customer_id` hoặc phone match, map trực tiếp thay vì raw payload.

## 8. Kế hoạch migration theo phase

### Phase 0 - Chuẩn bị

- Chốt schema V2.
- Chốt status vocabulary.
- Chốt phân quyền Sale/Leader Sale/Resale.
- Chốt quy tắc customer identity: một row mỗi lần lead hay một customer per phone.

### Phase 1 - Tạo bảng V2

- Tạo `customers`.
- Tạo `customer_sources`.
- Tạo `customer_notes`.
- Tạo `customer_activities`.
- Tạo `customer_orders`.
- Tạo `customer_assignments`.
- Chưa đổi UI.

### Phase 2 - Backfill dữ liệu

Thứ tự:
1. Backfill `customers` từ `marketing_contacts`.
2. Lưu mapping `marketing_contact_id -> customer_id`.
3. Backfill `customer_sources`.
4. Backfill `customer_notes`.
5. Backfill `customer_activities`.
6. Backfill `customer_orders` nếu có payload.
7. Backfill `customer_assignments` từ snapshot phân phối trên `customers`.

### Phase 3 - Dual-read service

Cập nhật service đọc theo thứ tự:
1. Ưu tiên V2 tables nếu có.
2. Fallback `marketing_contacts`/`contact_notes` nếu chưa migrate.

### Phase 4 - Dual-write ingest

Cập nhật API ingest:
1. Insert vào `customers`.
2. Insert vào `customer_sources`.
3. Ghi `customer_activities`.
4. Trong thời gian chuyển tiếp vẫn insert `marketing_contacts` nếu UI cũ còn dùng.

### Phase 5 - Cutover UI

- Trang Liên hệ khách hàng đọc từ `customers` V2.
- Popup chi tiết đọc notes/activity/orders từ bảng mới.
- Kanban/status/filter chuyển sang V2.

### Phase 6 - Cleanup

Sau khi xác nhận dữ liệu:
- Dừng phụ thuộc `raw_payload` cho notes/orders/timeline.
- Giữ `marketing_contacts` ở chế độ legacy/archive hoặc drop sau khi đủ an toàn.

## 9. Kiểm tra dữ liệu sau migration

Checklist:
- Số lượng `customers` bằng số lượng contact cần migrate.
- Mỗi `marketing_contacts.id` có đúng một `customers.legacy_marketing_contact_id`.
- Contact có `latest_note` phải có ít nhất một `customer_notes`.
- Contact duplicate giữ đúng `duplicate_of_customer_id`.
- Contact có source phải có `customer_sources`.
- Customer có assigned Sale/team thật phải có `customer_assignments`.
- Trạng thái UI trước/sau migration giống nhau.
- Filter theo ngày/source/status/Sale/team vẫn trả cùng kết quả.

## 10. Rủi ro mapping

1. `sales_owner_name` chỉ là text, có thể không map chắc chắn được về `profiles.id`.
2. Team Sale chỉ là text, cần chuẩn hóa với bảng `teams`.
3. `raw_payload` không đồng nhất giữa lead từ API, manual UI và sample.
4. Timeline hiện tại không có audit event thật, migration chỉ reconstruct tương đối.
5. Order history chưa có nguồn DB chính thức liên kết contact.
6. Duplicate relation phải map 2 bước vì self-reference.
7. Status legacy có nhiều biến thể tiếng Việt/tiếng Anh.
