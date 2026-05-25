export type SaleDocumentType = "pdf" | "docx" | "xlsx" | "link" | "announcement";

export type SaleDocument = {
  id: string;
  title: string;
  description: string;
  file_type: SaleDocumentType;
  file_url: string;
  thumbnail_url: string | null;
  category: string;
  uploaded_by: string;
  created_at: string;
  updated_at: string;
  is_pinned: boolean;
};

export const saleDocuments: SaleDocument[] = [
  {
    id: "sale-doc-001",
    title: "Cập nhật quy trình chăm sóc lead tháng 5",
    description:
      "Quy trình nhận data, gọi lần 1-3, ghi chú và chuyển trạng thái lead trong Kho Lead Thả Nổi.",
    file_type: "announcement",
    file_url: "#",
    thumbnail_url: null,
    category: "Thông báo",
    uploaded_by: "Admin Sale",
    created_at: "2026-05-20T09:00:00+07:00",
    updated_at: "2026-05-22T15:30:00+07:00",
    is_pinned: true,
  },
  {
    id: "sale-doc-002",
    title: "Script xử lý khách đang cân nhắc",
    description:
      "Mẫu hội thoại ngắn cho các trường hợp khách hỏi giá, cần suy nghĩ hoặc hẹn gọi lại.",
    file_type: "docx",
    file_url: "#",
    thumbnail_url: null,
    category: "Script sale",
    uploaded_by: "Leader Sale",
    created_at: "2026-05-18T10:15:00+07:00",
    updated_at: "2026-05-21T11:20:00+07:00",
    is_pinned: true,
  },
  {
    id: "sale-doc-003",
    title: "Checklist chốt sale trong ngày",
    description: "Checklist thao tác trước khi chốt, sau khi chốt và khi cập nhật báo cáo cuối ca.",
    file_type: "pdf",
    file_url: "#",
    thumbnail_url: null,
    category: "Quy trình",
    uploaded_by: "Admin Sale",
    created_at: "2026-05-16T08:30:00+07:00",
    updated_at: "2026-05-19T08:30:00+07:00",
    is_pinned: false,
  },
  {
    id: "sale-doc-004",
    title: "File báo giá dịch vụ",
    description: "Bảng giá hiện hành, các gói ưu đãi và ghi chú khi tư vấn cho khách.",
    file_type: "xlsx",
    file_url: "#",
    thumbnail_url: null,
    category: "Báo giá",
    uploaded_by: "Admin Sale",
    created_at: "2026-05-12T13:00:00+07:00",
    updated_at: "2026-05-20T17:45:00+07:00",
    is_pinned: false,
  },
  {
    id: "sale-doc-005",
    title: "FAQ khách hàng thường hỏi",
    description:
      "Tổng hợp câu hỏi phổ biến về liệu trình, thời gian, giá, bảo hành và chăm sóc sau mua.",
    file_type: "link",
    file_url: "#",
    thumbnail_url: null,
    category: "FAQ",
    uploaded_by: "Leader Sale",
    created_at: "2026-05-10T09:45:00+07:00",
    updated_at: "2026-05-18T16:00:00+07:00",
    is_pinned: false,
  },
  {
    id: "sale-doc-006",
    title: "Chính sách xử lý lead trùng",
    description: "Nguyên tắc nhận lead, xử lý lead đã có người nhận và cách ghi nhận khách cũ.",
    file_type: "pdf",
    file_url: "#",
    thumbnail_url: null,
    category: "Chính sách",
    uploaded_by: "Admin Sale",
    created_at: "2026-05-08T14:20:00+07:00",
    updated_at: "2026-05-15T09:10:00+07:00",
    is_pinned: false,
  },
];
