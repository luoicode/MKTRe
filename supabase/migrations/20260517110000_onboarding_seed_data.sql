-- Seed data mẫu cho module "Hướng dẫn tân thủ".
-- Idempotent: không xóa/sửa nội dung production đã có, chỉ bổ sung item còn thiếu theo title/question.

WITH seeded_sections AS (
  INSERT INTO public.onboarding_sections (section_key, title, description, sort_order, is_active)
  VALUES
    ('intro', 'Giới thiệu', 'Nắm cách vận hành, vai trò và nhịp làm việc của team marketing.', 1, true),
    ('training', 'Đào tạo', 'Hoàn thành kiến thức nền về báo cáo, KPI, ads và tài nguyên nội bộ.', 2, true),
    ('advanced', 'Nâng cao', 'Chuẩn hóa tư duy tối ưu, xử lý bất thường và phối hợp liên phòng ban.', 3, true)
  ON CONFLICT (section_key) DO NOTHING
  RETURNING id, section_key
),
sections AS (
  SELECT id, section_key
  FROM seeded_sections
  UNION
  SELECT id, section_key
  FROM public.onboarding_sections
  WHERE section_key IN ('intro', 'training', 'advanced')
),
card_seed (
  section_key,
  icon,
  title,
  summary,
  content,
  image_url,
  link_url,
  sort_order
) AS (
  VALUES
    (
      'intro',
      '👋',
      'Tổng quan MKTRe',
      'Hiểu mục tiêu của hệ thống báo cáo marketing và vai trò của từng người trong team.',
      'MKTRe là hệ thống quản lý báo cáo marketing theo ca, KPI, task, tài sản và tiến độ team. Nhân sự marketing cần dùng hệ thống mỗi ngày để nhập số liệu lũy kế, theo dõi KPI cá nhân, nhận task và đọc tài liệu nội bộ.

Nguyên tắc vận hành:
1. Số liệu phải được cập nhật đúng khung giờ.
2. Báo cáo là dữ liệu lũy kế trong ngày, không cộng riêng từng slot.
3. KPI và dashboard dùng số liệu mới nhất mỗi ngày.
4. Task và checklist là căn cứ theo dõi trách nhiệm hằng ngày.
5. Mọi tài sản được cấp phải dùng đúng phạm vi và bảo mật.',
      NULL,
      NULL,
      1
    ),
    (
      'intro',
      '🧭',
      'Vai trò Employee, Leader, Manager',
      'Phân biệt trách nhiệm báo cáo, theo dõi team và quản trị hệ thống.',
      'Employee:
- Nhập báo cáo theo khung giờ.
- Hoàn thành checklist/task được giao.
- Theo dõi KPI cá nhân.
- Sử dụng tài sản được cấp đúng mục đích.

Leader:
- Vẫn phải nhập báo cáo cá nhân như Employee.
- Theo dõi báo cáo tổng ngày của team.
- Giao task, duyệt task, chia KPI cho nhân viên.
- Cấp tài sản linh động cho team hoặc cá nhân.

Manager:
- Xem tổng quan nhiều team được phân công.
- Giao KPI cho team/leader.
- Theo dõi doanh thu, KPI, task và rủi ro vận hành.

Admin:
- Quản trị user, team, role, cấu hình hệ thống và tài liệu onboarding.',
      NULL,
      NULL,
      2
    ),
    (
      'intro',
      '⏱️',
      'Nhịp làm việc trong ngày',
      'Các mốc quan trọng cần nhớ khi vận hành ads và báo cáo.',
      'Nhịp vận hành cơ bản:
- Đầu ngày: kiểm tra tài sản, tài khoản ads, landing, flow chat, KPI hôm nay.
- Trước 11h55: cập nhật số liệu lũy kế lần 1.
- Trước 16h55: cập nhật số liệu lũy kế lần 2.
- Trước 21h00: cập nhật số liệu cuối ngày.
- 13h55 hôm sau: chỉnh/bù số liệu cho ngày hôm trước nếu có phát sinh.

Lưu ý:
- Không đợi cuối ngày mới nhập tất cả.
- Nếu số liệu không đổi, vẫn có thể gửi lại dữ liệu hiện tại.
- Khi có bất thường về chi phí, data hoặc doanh số, báo Leader ngay trong ngày.',
      NULL,
      NULL,
      3
    ),
    (
      'intro',
      '🔐',
      'Bảo mật tài sản marketing',
      'Quy tắc dùng tài khoản, link, tài sản ads và tài nguyên nội bộ.',
      'Tài sản marketing gồm hotline, Odoo, Canva, Capcut, tài khoản Ads, BM, Via, Fanpage, Landing, Pixel và các tài liệu nội bộ.

Quy tắc bắt buộc:
1. Không chia sẻ tài khoản cho người ngoài team.
2. Không đổi mật khẩu hoặc cấu hình nếu chưa được Leader/Manager cho phép.
3. Không tự ý xóa chiến dịch, pixel, landing, media hoặc flow chat.
4. Khi phát hiện tài sản lỗi, checkpoint, khóa, hoặc mất quyền truy cập, báo ngay trong module Task hoặc kênh team.
5. Tài sản cá nhân phải tự quản lý và cập nhật link đúng trong module Tài sản.',
      NULL,
      NULL,
      4
    ),
    (
      'training',
      '📊',
      'Cách nhập báo cáo lũy kế',
      'Hiểu đúng báo cáo theo slot để không cộng trùng số liệu.',
      'Các slot 11h55, 16h55, 21h00 là báo cáo lũy kế trong ngày.

Ví dụ:
- 11h55 chi phí ads = 5.000.000đ.
- 16h55 chi phí ads vẫn = 5.000.000đ nếu không phát sinh thêm.
- 21h00 chi phí ads vẫn = 5.000.000đ nếu cả ngày không phát sinh thêm.

Dashboard tổng ngày chỉ lấy báo cáo mới nhất/current nhất của mỗi người trong ngày, không cộng 3 slot.

Slot 13h55 là chỉnh/bù cho ngày hôm trước. Nếu hôm qua đã báo 5.000.000đ nhưng hôm sau đối soát thành 5.500.000đ, slot 13h55 sẽ cập nhật ngày hôm qua thành 5.500.000đ.',
      NULL,
      NULL,
      1
    ),
    (
      'training',
      '🎯',
      'Cách đọc KPI cá nhân',
      'Theo dõi mục tiêu doanh số, chi phí và phần trăm hoàn thành.',
      'KPI giúp nhân sự biết mình đang cách mục tiêu bao xa.

Cần theo dõi:
- Doanh số target.
- Chi phí target nếu có.
- % hoàn thành KPI.
- Trạng thái: chưa đạt, gần đạt, đạt.

Cách đọc:
1. So sánh doanh số thực tế với target.
2. Xem chi phí có vượt ngưỡng không.
3. Nếu doanh số thấp nhưng chi phí tăng, cần kiểm tra data, mess, tỉ lệ chốt.
4. Nếu KPI gần đạt, ưu tiên tối ưu nhóm ads/landing đang có tín hiệu tốt.',
      NULL,
      NULL,
      2
    ),
    (
      'training',
      '📣',
      'Quy tắc chạy Ads cơ bản',
      'Các nguyên tắc trước khi bật, scale hoặc chỉnh chiến dịch.',
      'Trước khi chạy:
- Kiểm tra đúng landing, pixel, tài khoản ads, media, headline, flow chat.
- Đảm bảo tracking và form nhận data hoạt động.

Trong khi chạy:
- Không chỉnh quá nhiều biến cùng lúc.
- Ghi nhận thời điểm đổi ngân sách, đổi content, đổi target.
- Theo dõi CP/MESS, CP/DATA, doanh số DATA và tỉ lệ chốt.

Khi scale:
- Chỉ scale nhóm có tín hiệu tốt.
- Scale từng bước, tránh tăng ngân sách đột ngột nếu chưa đủ data.
- Báo Leader khi cần tăng ngân sách lớn hoặc gặp dấu hiệu bất thường.',
      NULL,
      NULL,
      3
    ),
    (
      'training',
      '✅',
      'Checklist onboarding hằng ngày',
      'Những việc phải kiểm tra để không sót vận hành.',
      'Checklist mỗi ngày:
1. Đăng nhập hệ thống và kiểm tra notification.
2. Kiểm tra task/checklist trong ngày.
3. Kiểm tra tài sản được cấp: Odoo, hotline, Canva/Capcut, landing, tài khoản Ads.
4. Đối soát số liệu ads trước mỗi slot báo cáo.
5. Nhập báo cáo đúng slot.
6. Kiểm tra KPI cá nhân.
7. Gửi duyệt task đã làm kèm ghi chú/chứng từ nếu cần.
8. Báo Leader khi có lỗi tài sản, chi phí tăng bất thường hoặc thiếu data.',
      NULL,
      NULL,
      4
    ),
    (
      'advanced',
      '📈',
      'Phân tích chỉ số vận hành',
      'Cách nhìn CP/MESS, CP/DATA, tỉ lệ chốt và doanh số để ra quyết định.',
      'Các chỉ số cần hiểu:
- CP/MESS: chi phí để có một tin nhắn.
- CP/DATA: chi phí để có một data.
- Tỉ lệ chốt DATA: đơn chốt / data.
- Doanh số DATA ngày: doanh số phát sinh từ data trong ngày.
- Trung bình đơn: doanh số / số đơn.
- CP ADS/Tổng DS: chi phí ads so với tổng doanh số.

Khi CP/MESS tốt nhưng CP/DATA xấu: cần kiểm tra chất lượng hội thoại hoặc flow.
Khi data nhiều nhưng đơn thấp: cần kiểm tra tư vấn, offer, kịch bản chốt.
Khi doanh số tốt nhưng chi phí quá cao: cần tối ưu ngân sách và nhóm chiến dịch.',
      NULL,
      NULL,
      1
    ),
    (
      'advanced',
      '🧪',
      'Quy trình test content/landing',
      'Tạo thử nghiệm có kiểm soát, tránh thay đổi gây nhiễu dữ liệu.',
      'Khi test content hoặc landing:
1. Xác định giả thuyết: content mới giải quyết vấn đề gì?
2. Chỉ thay đổi một nhóm biến chính trong mỗi lần test.
3. Ghi lại ngày giờ bắt đầu test.
4. Theo dõi chi phí, mess, data, đơn, doanh số.
5. Không kết luận quá sớm khi chưa đủ data.
6. Nếu test thắng, báo Leader để nhân rộng.

Không tự ý xóa dữ liệu test cũ vì cần dùng để so sánh hiệu quả.',
      NULL,
      NULL,
      2
    ),
    (
      'advanced',
      '🚨',
      'Xử lý bất thường trong ngày',
      'Khi chi phí tăng, tài khoản lỗi, thiếu data hoặc doanh số giảm.',
      'Các tình huống cần báo ngay:
- Tài khoản ads bị checkpoint, giới hạn, khóa.
- Chi phí tăng nhanh nhưng mess/data giảm.
- Landing/Form/FlowChat lỗi.
- Data nhiều nhưng không đổ về Odoo/Pancake.
- Doanh số giảm mạnh so với hôm trước.
- Không thể nhập báo cáo đúng slot.

Cách xử lý:
1. Chụp màn hình lỗi hoặc ghi lại link/chứng từ.
2. Tạo task/ghi chú hoặc báo Leader trong kênh team.
3. Không tự ý thay đổi nhiều cấu hình khi chưa xác định nguyên nhân.
4. Cập nhật lại báo cáo sau khi đối soát.',
      NULL,
      NULL,
      3
    ),
    (
      'advanced',
      '🤝',
      'Phối hợp với Leader/Manager',
      'Cách báo cáo vấn đề và đề xuất tối ưu rõ ràng, có dữ liệu.',
      'Khi trao đổi với Leader/Manager, cần đi thẳng vào dữ liệu:
- Vấn đề là gì?
- Xảy ra từ khi nào?
- Ảnh hưởng chỉ số nào?
- Đã kiểm tra những gì?
- Đề xuất hướng xử lý là gì?

Mẫu báo cáo ngắn:
"Từ 16h25 CP/DATA tăng từ 80k lên 130k, data giảm 30%, content A bắt đầu đuối. Em đề xuất giảm ngân sách nhóm A 20% và chuyển ngân sách sang nhóm B đang CP/DATA 75k."

Ưu tiên giao tiếp bằng dữ liệu, không chỉ cảm tính.',
      NULL,
      NULL,
      4
    )
)
INSERT INTO public.onboarding_cards (
  section_id,
  icon,
  title,
  summary,
  content,
  image_url,
  link_url,
  sort_order,
  is_active
)
SELECT
  s.id,
  cs.icon,
  cs.title,
  cs.summary,
  cs.content,
  cs.image_url,
  cs.link_url,
  cs.sort_order,
  true
FROM card_seed cs
JOIN sections s ON s.section_key = cs.section_key
WHERE NOT EXISTS (
  SELECT 1
  FROM public.onboarding_cards existing
  WHERE existing.section_id = s.id
    AND existing.title = cs.title
);

WITH sections AS (
  SELECT id, section_key
  FROM public.onboarding_sections
  WHERE section_key IN ('intro', 'training', 'advanced')
),
question_seed (
  section_key,
  question_text,
  question_type,
  options,
  sort_order
) AS (
  VALUES
    (
      'intro',
      'Vai trò nào vẫn phải nhập báo cáo cá nhân theo khung giờ?',
      'multiple_choice',
      '["Employee và Leader", "Chỉ Employee", "Chỉ Manager", "Chỉ Admin"]'::jsonb,
      1
    ),
    (
      'intro',
      'Liệt kê 3 việc bạn cần kiểm tra đầu ngày trước khi vận hành ads.',
      'text',
      '[]'::jsonb,
      2
    ),
    (
      'intro',
      'Những tài sản nào cần bảo mật và không chia sẻ ra ngoài team?',
      'checkbox',
      '["Tài khoản Ads/BM/Via", "Hotline/Odoo", "Landing/Pixel", "Tất cả các mục trên"]'::jsonb,
      3
    ),
    (
      'training',
      'Các slot 11h55 / 16h55 / 21h00 được nhập theo logic nào?',
      'multiple_choice',
      '["Số liệu lũy kế trong ngày", "Số phát sinh riêng từng khung", "Cộng thủ công các slot", "Chỉ nhập slot cuối ngày"]'::jsonb,
      1
    ),
    (
      'training',
      'Nếu 11h55 chi phí ads là 5 triệu và 16h55 không phát sinh thêm, bạn nhập 16h55 là bao nhiêu?',
      'multiple_choice',
      '["5 triệu", "0", "10 triệu", "Bỏ trống"]'::jsonb,
      2
    ),
    (
      'training',
      'Chọn các chỉ số cần theo dõi khi đánh giá hiệu quả ads trong ngày.',
      'checkbox',
      '["CP/MESS", "CP/DATA", "Tỉ lệ chốt DATA", "Doanh số DATA ngày"]'::jsonb,
      3
    ),
    (
      'advanced',
      'Khi CP/DATA tăng mạnh nhưng chưa rõ nguyên nhân, bạn nên làm gì trước?',
      'multiple_choice',
      '["Ghi nhận dữ liệu, kiểm tra thay đổi và báo Leader", "Tự xóa chiến dịch", "Tăng ngân sách ngay", "Bỏ qua đến cuối ngày"]'::jsonb,
      1
    ),
    (
      'advanced',
      'Viết một mẫu báo cáo ngắn khi bạn phát hiện doanh số giảm bất thường.',
      'text',
      '[]'::jsonb,
      2
    ),
    (
      'advanced',
      'Những hành động nào phù hợp khi test content/landing?',
      'checkbox',
      '["Xác định giả thuyết test", "Ghi lại thời điểm bắt đầu", "Theo dõi số liệu đủ mẫu", "Thay toàn bộ biến cùng lúc"]'::jsonb,
      3
    )
)
INSERT INTO public.onboarding_questions (
  section_id,
  question_text,
  question_type,
  options,
  sort_order,
  is_active
)
SELECT
  s.id,
  qs.question_text,
  qs.question_type,
  qs.options,
  qs.sort_order,
  true
FROM question_seed qs
JOIN sections s ON s.section_key = qs.section_key
WHERE NOT EXISTS (
  SELECT 1
  FROM public.onboarding_questions existing
  WHERE existing.section_id = s.id
    AND existing.question_text = qs.question_text
);

WITH document_seed (
  title,
  description,
  link_url,
  document_type,
  sort_order
) AS (
  VALUES
    (
      'Checklist onboarding nhân sự marketing',
      'Danh sách việc cần hoàn thành trong 7 ngày đầu: tài khoản, tài sản, báo cáo, KPI và quy trình team.',
      'https://example.com/onboarding-checklist',
      'Checklist',
      1
    ),
    (
      'Quy định báo cáo theo khung giờ',
      'Tài liệu giải thích slot 11h55, 16h55, 21h00 và 13h55 chỉnh hôm trước.',
      'https://example.com/report-slot-policy',
      'Quy định',
      2
    ),
    (
      'Hướng dẫn đọc KPI Marketing',
      'Cách đọc KPI doanh số, chi phí, % hoàn thành và các chỉ số vận hành ads.',
      'https://example.com/kpi-guide',
      'Tài liệu',
      3
    ),
    (
      'Quy tắc bảo mật tài sản nội bộ',
      'Nguyên tắc sử dụng Hotline, Odoo, Ads account, BM, Via, Fanpage, Landing, Pixel và tài liệu nội bộ.',
      'https://example.com/asset-security',
      'Quy định',
      4
    ),
    (
      'Mẫu báo cáo sự cố ads',
      'Template ghi nhận sự cố tài khoản ads, landing, form, flow chat và cách escalation cho Leader.',
      'https://example.com/ads-incident-template',
      'Biểu mẫu',
      5
    )
)
INSERT INTO public.onboarding_documents (
  title,
  description,
  link_url,
  document_type,
  sort_order,
  is_active
)
SELECT
  ds.title,
  ds.description,
  ds.link_url,
  ds.document_type,
  ds.sort_order,
  true
FROM document_seed ds
WHERE NOT EXISTS (
  SELECT 1
  FROM public.onboarding_documents existing
  WHERE existing.title = ds.title
);

NOTIFY pgrst, 'reload schema';
