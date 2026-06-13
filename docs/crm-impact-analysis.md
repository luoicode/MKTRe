# CRM V2 Impact Analysis

Tài liệu này phân tích ảnh hưởng nếu Workspace MIZ chuyển CRM từ `marketing_contacts` sang CRM Data Model V2.

Không tạo migration trong task này.

## 1. Màn hình bị ảnh hưởng

### Employee Marketing > Nguồn Marketing

Trạng thái hiện tại:
- Đọc/ghi `lead_sources`.
- Tạo source token.
- Hiển thị API URL thật.

Ảnh hưởng V2:
- Có thể giữ nguyên `lead_sources`.
- Cần liên kết rõ `lead_sources` với `customer_sources`.
- Không cần đổi UI ngay.

Mức ảnh hưởng: Thấp.

### Employee Marketing > Liên hệ khách hàng

Trạng thái hiện tại:
- Đọc `marketing_contacts`.
- Join `lead_sources`, `profiles`, `teams`.
- Đọc `contact_notes`.
- Dùng `raw_payload` cho phone phụ, note legacy, order mock, activity fallback.

Ảnh hưởng V2:
- Đây là màn hình bị ảnh hưởng nhiều nhất.
- Data source chính sẽ chuyển sang `customers`.
- Bảng, Kanban, filter, saved filters, detail modal đều cần map sang schema mới.
- Notes nên đọc `customer_notes`.
- Timeline nên đọc `customer_activities`.
- Lịch sử mua hàng nên đọc `customer_orders`.

Mức ảnh hưởng: Cao.

### Popup Chi tiết liên hệ

Trạng thái hiện tại:
- Thông tin khách hàng từ `marketing_contacts`.
- Nguồn từ `lead_sources`/snapshot.
- Sale assignment từ text/raw payload.
- Notes từ `contact_notes` + fallback.
- Timeline synthesize từ UI/raw payload.
- Orders từ raw payload/sample.

Ảnh hưởng V2:
- Nên đọc trực tiếp:
  - `customers`
  - `customer_sources`
  - `customer_assignments`
  - `customer_notes`
  - `customer_activities`
  - `customer_orders`
- Giảm logic fallback.

Mức ảnh hưởng: Cao.

### API ingest lead

Trạng thái hiện tại:
- Route `/api/leads/ingest/:sourceToken`.
- Insert `marketing_contacts`.
- Duplicate 7 ngày theo `normalized_phone`.

Ảnh hưởng V2:
- Cần insert:
  - `customers`
  - `customer_sources`
  - `customer_activities`
- Trong phase chuyển tiếp có thể dual-write thêm `marketing_contacts`.
- Duplicate logic nên chạy trên `customers`.

Mức ảnh hưởng: Cao.

### Future Sale / Resale UI

Trạng thái hiện tại:
- Chưa có UI Sale/Resale chính thức cho contacts.
- Contact notes service đã chuẩn bị hàm tạo/sửa/xóa.

Ảnh hưởng V2:
- V2 là nền tảng để Sale/Resale có inbox/workbench khách hàng.
- Cần RLS dựa trên `assigned_sale_id`, `assigned_sale_team_id`.
- Cần đọc `customer_assignments` để hiển thị lịch sử nhận số, chuyển NVKD, chuyển team Sale và phân phối Resale.

Mức ảnh hưởng: Rất cao nhưng là planned.

### Invoice / Order modules

Trạng thái hiện tại:
- Có module hóa đơn/đơn bán hàng riêng.
- Chưa có link CRM contact chính thức.

Ảnh hưởng V2:
- `customer_orders` có thể link đến invoice/order.
- Cần mapping phone/customer hoặc thêm `customer_id` vào invoice/order ở phase sau.

Mức ảnh hưởng: Trung bình đến cao ở phase tích hợp.

## 2. Service bị ảnh hưởng

### `src/lib/marketingLeadSources.ts`

Chức năng hiện tại:
- Fetch sources.
- Create/update source.
- Fetch contacts.
- Create manual contact.
- Map rows sang `MarketingContact`.
- Note CRUD cho tương lai.

Ảnh hưởng:
- Cần tách service:
  - source service
  - customer/contact service
  - note service
  - activity service
  - order service
- `fetchEmployeeMarketingContacts` sẽ đổi query từ `marketing_contacts` sang V2.
- `mapMarketingContactRow` nên giảm fallback `raw_payload`.
- `createMarketingContact` phải dùng duplicate rule thống nhất với ingest.

Mức ảnh hưởng: Cao.

### `src/routes/api/leads/ingest/$sourceToken.ts`

Chức năng hiện tại:
- Public ingest endpoint.
- Normalize phone.
- Duplicate check.
- Insert `marketing_contacts`.

Ảnh hưởng:
- Cần chuyển insert sang V2 hoặc dual-write.
- Duplicate check trên `customers`.
- Ghi activity `lead_created`/`duplicate_detected`.
- Ghi source event vào `customer_sources`.

Mức ảnh hưởng: Cao.

### `src/routes/_authenticated/employee/marketing-contacts.tsx`

Chức năng hiện tại:
- Toàn bộ UI Liên hệ khách hàng.
- Nhiều logic filter/saved filter/Kanban/detail trong một route component.

Ảnh hưởng:
- Cần đổi data shape nhưng không nhất thiết đổi UI.
- Nên giữ contract `MarketingContact` hoặc tạo adapter để UI không vỡ.
- Có thể chuyển dần bằng service adapter.

Mức ảnh hưởng: Cao.

### Contact note functions

Hiện tại:
- `createContactNote(contactId, content)`
- `updateContactNote(noteId, content)`
- `deleteContactNote(noteId)`

Ảnh hưởng:
- Đổi `contactId` sang `customerId`.
- Hoặc tạo wrapper tương thích trong phase chuyển tiếp.

Mức ảnh hưởng: Trung bình.

### Future customer assignment service

Hiện tại:
- Chưa có service/UI chính thức cho phân phối hoặc chuyển giao CRM customer.

Ảnh hưởng:
- Khi làm Sale/Resale, cần service tạo assignment mới cho `auto_assign`, `manual_assign`, `transfer_sale`, `transfer_team`, `resale_assign`.
- Service này nên cập nhật snapshot hiện tại trên `customers`.
- Mỗi assignment nên ghi thêm `customer_activities` để timeline và ledger khớp nhau.

Mức ảnh hưởng: Trung bình, nhưng quan trọng cho audit.

## 3. Query bị ảnh hưởng

### Query fetch contacts

Hiện tại:
- Select `marketing_contacts`.
- Join `profiles`, `teams`, `lead_sources`.
- Fetch `contact_notes` theo contact ids.

V2:
- Select `customers`.
- Join owner marketer profile/team.
- Join assigned sale/team.
- Fetch:
  - latest source from `customer_sources`
  - assignment history from `customer_assignments` nếu cần hiển thị lịch sử phân phối
  - notes from `customer_notes`
  - activities from `customer_activities`
  - orders from `customer_orders`

Rủi ro:
- Query nhiều bảng có thể nặng.
- Cần pagination thật ở DB nếu dữ liệu lớn.

### Query duplicate check

Hiện tại:
- `marketing_contacts.normalized_phone`
- created_at >= now - 7 days
- status not in closed statuses

V2:
- `customers.normalized_phone`
- created_at hoặc latest source `received_at`
- `current_status` not closed.

Rủi ro:
- Nếu một customer có nhiều source events, duplicate theo customer hay source event cần chốt lại.

### Query notes

Hiện tại:
- `contact_notes.contact_id`.

V2:
- `customer_notes.customer_id`.

Rủi ro:
- Backfill thiếu note legacy làm UI mất "Ghi chú gần đây".

### Query assignments

Hiện tại:
- Sale assignment đang là snapshot text/FK trên `customers` sau backfill từ `marketing_contacts`.

V2:
- Snapshot hiện tại vẫn nằm ở `customers`.
- Lịch sử nhận/chuyển Sale nằm ở `customer_assignments`.

Rủi ro:
- Backfill từ snapshot chỉ biết trạng thái phân phối cuối, không khôi phục được toàn bộ chuỗi chuyển giao trước đó.
- Nếu không map được FK `profiles.id`/`teams.id`, vẫn phải giữ snapshot text để không mất thông tin.

### Query order history

Hiện tại:
- Từ raw payload/sample.

V2:
- `customer_orders.customer_id`.

Rủi ro:
- Cần xác định nguồn order thật từ invoice/Odoo/POS.

## 4. RLS / Permission impact

### Hiện tại

`marketing_contacts`:
- Admin toàn quyền.
- Owner Marketing xem/insert contact của mình.

`contact_notes`:
- Admin/Manager toàn quyền.
- Marketing owner read-only.
- Leader Marketing read-only theo team.
- Sale/Leader Sale quyền theo `raw_payload.sales_owner_profile_id`.

### V2 cần cải thiện

RLS nên dựa vào field FK thật:
- `customers.owner_marketer_id`
- `customers.marketing_team_id`
- `customers.assigned_sale_id`
- `customers.assigned_sale_team_id`
- `customer_assignments.customer_id` qua helper `crm_v2_can_access_customer(customer_id)`

Không nên dựa vào `raw_payload` cho quyền Sale.

Rủi ro:
- Nếu RLS quá rộng: Sale/Leader Sale có thể thấy dữ liệu ngoài scope.
- Nếu RLS quá chặt: UI Sale/Leader Sale không đọc được khách được phân phối.
- Cần policy cho Resale nếu có workflow Resale.
- Phase foundation của `customer_assignments` chỉ mở INSERT cho Admin/Manager; Marketing không được ghi assignment, Sale/Leader Sale chưa ghi đến khi có Sale UI.

## 5. Migration risks

| Rủi ro | Mức độ | Cách giảm |
| --- | --- | --- |
| `raw_payload` không đồng nhất | Cao | Backfill nhiều fallback, giữ legacy payload audit |
| Assignment Sale chỉ là text | Cao | Map theo profile name/employee code nếu có, fallback text |
| Assignment history backfill không đầy đủ | Trung bình | Backfill snapshot cuối thành `manual_assign`, ghi rõ reason `Backfill từ marketing_contacts` |
| Duplicate self-reference | Trung bình | Backfill 2 pass, dùng mapping table |
| Timeline không có event thật | Cao | Tạo `legacy_backfill` activity, không claim là audit tuyệt đối |
| Notes bị trùng | Trung bình | Unique logic theo customer_id + content |
| Order history chưa có nguồn thật | Cao | Chỉ migrate raw orders nếu có; tích hợp invoice sau |
| Status nhiều biến thể | Trung bình | Normalize status trước khi insert V2 |
| UI đang có sample fallback | Trung bình | Test với DB thật và empty state |
| RLS làm mất dữ liệu UI | Cao | Viết policy theo role/team và test từng role |
| API ingest production | Cao | Dùng dual-write trước khi cutover |

## 6. Roadmap kỹ thuật đề xuất

### Short term

1. Giữ UI hiện tại.
2. Chuẩn hóa service adapter để UI không phụ thuộc trực tiếp `marketing_contacts`.
3. Đồng bộ duplicate rule giữa ingest API và manual create.
4. Chuẩn hóa notes về `contact_notes` đầy đủ.

### Medium term

1. Tạo CRM V2 tables.
2. Backfill V2.
3. Dual-read service.
4. Dual-write ingest.
5. Chuyển popup detail sang notes/activities/orders thật.
6. Khi làm Sale UI, dùng `customer_assignments` làm nguồn audit nhận/chuyển khách.

### Long term

1. Sale inbox/workbench.
2. Resale workflow.
3. Customer lifetime history.
4. Link invoice/order thật.
5. Reporting CRM theo source, marketer, sale, product, revenue.

## 7. Khuyến nghị triển khai an toàn

1. Không thay đổi UI trong cùng PR với migration lớn.
2. Tạo adapter layer trước:
   - input V2
   - output giữ `MarketingContact`
3. Viết backfill idempotent.
4. Tạo audit report sau backfill:
   - total contacts
   - contacts with notes
   - contacts with sources
   - duplicates mapped
   - assignments mapped
5. Chạy song song 1-2 tuần trước khi bỏ legacy read.

## 8. Kết luận impact

CRM V2 là thay đổi kiến trúc lớn nhưng cần thiết nếu Workspace MIZ muốn phát triển Sale/Resale nghiêm túc.

Phần ảnh hưởng lớn nhất là:
- API ingest
- service `marketingLeadSources.ts`
- trang Liên hệ khách hàng
- RLS đọc/ghi notes và customer assignment

Nên triển khai theo hướng adapter + dual-write để tránh phá Marketing hiện tại.
