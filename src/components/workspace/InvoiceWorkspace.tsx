import { forwardRef, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Copy, Download, ImageIcon, Plus, Receipt, RefreshCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth";
import { captureElementAsPngBlob, downloadBlob } from "@/lib/captureImage";
import {
  createInvoice,
  fetchInvoiceProducts,
  type InvoiceProduct,
  type InvoiceRow,
} from "@/lib/invoices";
import { formatVnd, parseVndInput } from "@/lib/products";
import { cn } from "@/lib/utils";
import { fetchVietnamAddressData } from "@/lib/vietnamAddress";
import { copyReportImageToClipboard } from "@/utils/reportImageStorage";

type InvoiceLine = {
  id: string;
  parentId: string;
  productId: string;
  displayName: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  total: string;
  discount: string;
  totalAfterDiscount: string;
  gift: string;
  nextVoucher: string;
  imageUrl: string;
};

export type InvoiceBuilderInitialCustomer = {
  name?: string;
  phone?: string;
  address?: string;
  note?: string;
  productName?: string;
};

export type InvoiceBuilderLineSnapshot = {
  id: string;
  parentId: string;
  productId: string;
  displayName: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  total: string;
  discount: string;
  totalAfterDiscount: string;
  gift: string;
  nextVoucher: string;
  imageUrl: string;
};

export type InvoiceBuilderSnapshot = {
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  streetAddress: string;
  provinceId: string;
  provinceName: string;
  districtId: string;
  districtName: string;
  wardId: string;
  wardName: string;
  invoiceDate: string;
  internalNote: string;
  orderNote: string;
  discountType: "percent" | "amount";
  discountValue: string;
  shippingFeeValue: string;
  lines: InvoiceBuilderLineSnapshot[];
  subtotal: number;
  discount: number;
  shippingFee: number;
  total: number;
  productSummary: string;
};

type InvoiceBuilderProps = {
  mode?: "page" | "embedded";
  initialCustomer?: InvoiceBuilderInitialCustomer;
  initialSnapshot?: InvoiceBuilderSnapshot | null;
  embeddedActivityContent?: ReactNode;
  saveDraftLabel?: string;
  createButtonLabel?: string;
  hideResetAction?: boolean;
  hideCreateAction?: boolean;
  onSnapshotChange?: (snapshot: InvoiceBuilderSnapshot) => void;
  onSaveDraft?: (snapshot: InvoiceBuilderSnapshot) => void | Promise<void>;
  onCreateOrder?: (
    snapshot: InvoiceBuilderSnapshot,
    invoice: Pick<InvoiceRow, "invoice_code" | "invoice_date">,
  ) => void | Promise<void>;
};

const emptyLine = (): InvoiceLine => ({
  id: crypto.randomUUID(),
  parentId: "",
  productId: "",
  displayName: "",
  quantity: "1",
  unit: "hũ",
  unitPrice: "0",
  total: "0",
  discount: "0",
  totalAfterDiscount: "0",
  gift: "",
  nextVoucher: "",
  imageUrl: "",
});

const todayIso = () => new Date().toISOString().slice(0, 10);
const buildEmbeddedOrderCode = () => `DH${Date.now().toString().slice(-8)}`;
const getActionErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message?: unknown }).message || fallback);
  }
  return fallback;
};

export function InvoiceWorkspace() {
  return <InvoiceBuilder mode="page" />;
}

export function InvoiceBuilder({
  mode = "page",
  initialCustomer,
  initialSnapshot,
  embeddedActivityContent,
  saveDraftLabel,
  createButtonLabel,
  hideResetAction = false,
  hideCreateAction = false,
  onSnapshotChange,
  onSaveDraft,
  onCreateOrder,
}: InvoiceBuilderProps) {
  const { profile } = useAuth();
  const isEmbedded = mode === "embedded";
  const previewRef = useRef<HTMLDivElement | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [wardId, setWardId] = useState("");
  const [districtId, setDistrictId] = useState("");
  const [provinceId, setProvinceId] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(todayIso());
  const [internalNote, setInternalNote] = useState("");
  const [orderNote, setOrderNote] = useState("");
  const [discountAmount, setDiscountAmount] = useState("");
  const [discountType, setDiscountType] = useState<"percent" | "amount">(
    mode === "embedded" ? "percent" : "amount",
  );
  const [shippingFeeAmount, setShippingFeeAmount] = useState("");
  const [lines, setLines] = useState<InvoiceLine[]>([emptyLine()]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [capturing, setCapturing] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const initialProductAppliedRef = useRef(false);
  const initialCustomerAppliedRef = useRef(false);
  const initialSnapshotAppliedRef = useRef(false);
  const skipSnapshotEmissionRef = useRef(false);

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["invoice-products"],
    queryFn: fetchInvoiceProducts,
  });
  const { data: vietnamAddressData, isLoading: isLoadingAddress } = useQuery({
    queryKey: ["vietnam-address-data", "legacy-63-provinces"],
    queryFn: fetchVietnamAddressData,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
  });

  const parentProducts = useMemo(
    () =>
      products.filter((product) => !product.parent_id).sort((a, b) => a.sort_order - b.sort_order),
    [products],
  );

  const childrenByParent = useMemo(() => {
    const map = new Map<string, InvoiceProduct[]>();
    products
      .filter((product) => product.parent_id)
      .forEach((product) => {
        const list = map.get(product.parent_id ?? "") ?? [];
        list.push(product);
        map.set(product.parent_id ?? "", list);
      });
    map.forEach((items) => items.sort((a, b) => a.sort_order - b.sort_order));
    return map;
  }, [products]);
  const saleableProducts = useMemo(
    () =>
      products
        .filter(
          (product) =>
            product.parent_id &&
            (product.base_price > 0 ||
              product.price_before_tax > 0 ||
              product.final_price_after_discount > 0),
        )
        .sort((a, b) => a.sort_order - b.sort_order),
    [products],
  );

  const subtotal = useMemo(
    () => lines.reduce((sum, line) => sum + parseVndInput(line.total), 0),
    [lines],
  );
  const productDiscount = useMemo(
    () => lines.reduce((sum, line) => sum + parseVndInput(line.discount), 0),
    [lines],
  );
  const discountInput = parseVndInput(discountAmount);
  const totalAfterProductDiscount = useMemo(
    () => lines.reduce((sum, line) => sum + parseVndInput(line.totalAfterDiscount), 0),
    [lines],
  );
  const invoiceDiscount =
    discountType === "percent"
      ? Math.round(totalAfterProductDiscount * (Math.min(discountInput, 100) / 100))
      : discountInput;
  const discount = productDiscount + invoiceDiscount;
  const shippingFee = parseVndInput(shippingFeeAmount);
  const total = Math.max(totalAfterProductDiscount - invoiceDiscount + shippingFee, 0);
  const productImages = useMemo(
    () => Array.from(new Set(lines.map((line) => line.imageUrl).filter(Boolean))).slice(0, 3),
    [lines],
  );

  const updateLine = (lineId: string, patch: Partial<InvoiceLine>) => {
    setLines((current) =>
      current.map((line) => (line.id === lineId ? { ...line, ...patch } : line)),
    );
  };

  const selectParent = (lineId: string, parentId: string) => {
    updateLine(lineId, { ...emptyLine(), id: lineId, parentId });
  };

  const selectProduct = (lineId: string, productId: string) => {
    const product = products.find((item) => item.id === productId);
    if (!product) return;
    const parent = product.parent_id
      ? products.find((item) => item.id === product.parent_id)
      : undefined;
    const lineSubtotal = product.base_price || product.price_before_tax || 0;
    const lineTotalAfterDiscount =
      product.final_price_after_discount || product.price_after_discount || lineSubtotal;
    const lineDiscount = Math.max(lineSubtotal - lineTotalAfterDiscount, 0);
    const quantity = product.quantity || 1;
    const unitPrice = quantity > 0 ? Math.round(lineSubtotal / quantity) : lineSubtotal;

    updateLine(lineId, {
      productId,
      parentId: product.parent_id ?? product.id,
      displayName: product.name,
      quantity: String(quantity),
      unit: product.unit || parent?.unit || "hũ",
      unitPrice: formatVnd(unitPrice),
      total: formatVnd(lineSubtotal),
      discount: formatVnd(lineDiscount),
      totalAfterDiscount: formatVnd(lineTotalAfterDiscount),
      gift: normalizeBenefit(product.gift),
      nextVoucher: normalizeBenefit(product.next_voucher),
      imageUrl: product.image_url || parent?.image_url || "",
    });
  };

  const updateQuantityOrPrice = (
    lineId: string,
    patch: Partial<Pick<InvoiceLine, "quantity" | "unitPrice">>,
  ) => {
    setLines((current) =>
      current.map((line) => {
        if (line.id !== lineId) return line;
        const next = { ...line, ...patch };
        const quantity = Number(next.quantity || 0);
        const unitPrice = parseVndInput(next.unitPrice);
        const lineSubtotal = Math.round(quantity * unitPrice);
        return {
          ...next,
          total: formatVnd(lineSubtotal),
          discount: "0",
          totalAfterDiscount: formatVnd(lineSubtotal),
        };
      }),
    );
  };

  const resetInvoice = () => {
    setCustomerName("");
    setCustomerPhone("");
    setCustomerAddress("");
    setWardId("");
    setDistrictId("");
    setProvinceId("");
    setInvoiceDate(todayIso());
    setInternalNote("");
    setOrderNote("");
    setDiscountAmount("");
    setDiscountType(isEmbedded ? "percent" : "amount");
    setShippingFeeAmount("");
    setLines([emptyLine()]);
  };

  const selectedLines = useMemo(() => lines.filter((line) => line.productId), [lines]);
  const selectedProvince = vietnamAddressData?.provinces.find(
    (province) => province.id === provinceId,
  );
  const selectedDistrict = vietnamAddressData?.districts.find(
    (district) => district.id === districtId,
  );
  const selectedWard = vietnamAddressData?.wards.find((ward) => ward.id === wardId);
  const formattedCustomerAddress = useMemo(
    () =>
      [
        customerAddress,
        selectedWard?.name,
        selectedDistrict?.name,
        selectedProvince?.name,
        "Việt Nam",
      ]
        .map((part) => part?.trim() ?? "")
        .filter((part, index, values) => part && values.indexOf(part) === index)
        .join(", "),
    [customerAddress, selectedDistrict?.name, selectedProvince?.name, selectedWard?.name],
  );
  const invoiceCustomerAddress = isEmbedded ? formattedCustomerAddress : customerAddress;

  useEffect(() => {
    if (initialCustomerAppliedRef.current) return;
    initialCustomerAppliedRef.current = true;
    setCustomerName(initialCustomer?.name ?? "");
    setCustomerPhone(initialCustomer?.phone ?? "");
    setCustomerAddress(initialCustomer?.address ?? "");
    setInternalNote(initialCustomer?.note ?? "");
  }, [
    initialCustomer?.address,
    initialCustomer?.name,
    initialCustomer?.note,
    initialCustomer?.phone,
  ]);

  useEffect(() => {
    initialProductAppliedRef.current = false;
  }, [initialCustomer?.productName]);

  useEffect(() => {
    const productName = initialCustomer?.productName?.trim().toLowerCase();
    if (!productName || !saleableProducts.length || initialProductAppliedRef.current) return;
    const matchingProduct = saleableProducts.find((product) => {
      const searchable = [product.name, product.product_group]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return searchable.includes(productName) || productName.includes(product.name.toLowerCase());
    });
    if (!matchingProduct) return;
    initialProductAppliedRef.current = true;
    const parent = matchingProduct.parent_id
      ? products.find((product) => product.id === matchingProduct.parent_id)
      : undefined;
    const lineSubtotal = matchingProduct.base_price || matchingProduct.price_before_tax || 0;
    const lineTotalAfterDiscount =
      matchingProduct.final_price_after_discount ||
      matchingProduct.price_after_discount ||
      lineSubtotal;
    const quantity = matchingProduct.quantity || 1;
    setLines((current) =>
      current.map((line, index) =>
        index === 0
          ? {
              ...line,
              productId: matchingProduct.id,
              parentId: matchingProduct.parent_id ?? matchingProduct.id,
              displayName: matchingProduct.name,
              quantity: String(quantity),
              unit: matchingProduct.unit || parent?.unit || "hũ",
              unitPrice: formatVnd(
                quantity > 0 ? Math.round(lineSubtotal / quantity) : lineSubtotal,
              ),
              total: formatVnd(lineSubtotal),
              discount: formatVnd(Math.max(lineSubtotal - lineTotalAfterDiscount, 0)),
              totalAfterDiscount: formatVnd(lineTotalAfterDiscount),
              gift: normalizeBenefit(matchingProduct.gift),
              nextVoucher: normalizeBenefit(matchingProduct.next_voucher),
              imageUrl: matchingProduct.image_url || parent?.image_url || "",
            }
          : line,
      ),
    );
  }, [initialCustomer?.productName, products, saleableProducts]);

  const currentSnapshot = useMemo<InvoiceBuilderSnapshot>(
    () => ({
      customerName,
      customerPhone,
      customerAddress: invoiceCustomerAddress,
      streetAddress: customerAddress,
      provinceId,
      provinceName: selectedProvince?.name ?? "",
      districtId,
      districtName: selectedDistrict?.name ?? "",
      wardId,
      wardName: selectedWard?.name ?? "",
      invoiceDate,
      internalNote,
      orderNote,
      discountType,
      discountValue: discountAmount,
      shippingFeeValue: shippingFeeAmount,
      lines: lines.map((line) => ({ ...line })),
      subtotal,
      discount,
      shippingFee,
      total,
      productSummary:
        selectedLines
          .map((line) => line.displayName.trim())
          .filter(Boolean)
          .join(", ") ||
        initialCustomer?.productName ||
        "",
    }),
    [
      customerAddress,
      customerName,
      customerPhone,
      discount,
      discountAmount,
      discountType,
      districtId,
      initialCustomer?.productName,
      internalNote,
      invoiceCustomerAddress,
      invoiceDate,
      lines,
      orderNote,
      provinceId,
      selectedDistrict?.name,
      selectedLines,
      selectedProvince?.name,
      selectedWard?.name,
      shippingFee,
      shippingFeeAmount,
      subtotal,
      total,
      wardId,
    ],
  );

  useEffect(() => {
    if (!isEmbedded || !initialSnapshot || initialSnapshotAppliedRef.current) return;
    initialSnapshotAppliedRef.current = true;
    skipSnapshotEmissionRef.current = true;
    initialProductAppliedRef.current = initialSnapshot.lines.some((line) => line.productId);
    setCustomerName(initialSnapshot.customerName.trim() || initialCustomer?.name || "");
    setCustomerPhone(initialSnapshot.customerPhone.trim() || initialCustomer?.phone || "");
    setCustomerAddress(
      initialSnapshot.streetAddress.trim() ||
        initialSnapshot.customerAddress.trim() ||
        initialCustomer?.address ||
        "",
    );
    setProvinceId(initialSnapshot.provinceId);
    setDistrictId(initialSnapshot.districtId);
    setWardId(initialSnapshot.wardId);
    setInvoiceDate(initialSnapshot.invoiceDate);
    setInternalNote(initialSnapshot.internalNote.trim() || initialCustomer?.note || "");
    setOrderNote(initialSnapshot.orderNote);
    setDiscountType(initialSnapshot.discountType);
    setDiscountAmount(initialSnapshot.discountValue);
    setShippingFeeAmount(initialSnapshot.shippingFeeValue);
    setLines(
      initialSnapshot.lines.length
        ? initialSnapshot.lines.map((line) => ({ ...line }))
        : [emptyLine()],
    );
  }, [
    initialCustomer?.address,
    initialCustomer?.name,
    initialCustomer?.note,
    initialCustomer?.phone,
    initialSnapshot,
    isEmbedded,
  ]);

  useEffect(() => {
    if (!isEmbedded || !onSnapshotChange) return;
    if (skipSnapshotEmissionRef.current) {
      skipSnapshotEmissionRef.current = false;
      return;
    }
    onSnapshotChange(currentSnapshot);
  }, [currentSnapshot, isEmbedded, onSnapshotChange]);

  const validateInvoice = () => {
    if (!customerName.trim()) throw new Error("Nhập tên khách hàng");
    if (!customerPhone.trim()) throw new Error("Nhập số điện thoại khách");
    if (!customerAddress.trim()) throw new Error("Nhập địa chỉ khách");
    if (!profile?.id) throw new Error("Không tìm thấy hồ sơ người tạo hoá đơn");
    if (selectedLines.length === 0) throw new Error("Chọn ít nhất 1 sản phẩm và combo");
    if (lines.some((line) => line.parentId && !line.productId)) {
      throw new Error("Mỗi dòng sản phẩm phải chọn đủ combo");
    }
  };

  const saveDraft = async () => {
    try {
      validateInvoice();
      setSavingDraft(true);
      await onSaveDraft?.(currentSnapshot);
      toast.success(saveDraftLabel ? `Đã ${saveDraftLabel.toLowerCase()}` : "Đã lưu nháp hoá đơn");
    } catch (error) {
      toast.error(getActionErrorMessage(error, "Không lưu được nháp hoá đơn"));
    } finally {
      setSavingDraft(false);
    }
  };

  const renderInvoicePreview = async () => {
    const blob = await captureElementAsPngBlob({
      target: previewRef.current,
      pixelRatio: 2,
      backgroundColor: "#ffffff",
    });
    const url = URL.createObjectURL(blob);
    setPreviewBlob(blob);
    setPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return url;
    });
    setPreviewOpen(true);
  };

  const previewInvoice = async () => {
    try {
      validateInvoice();
      setCapturing(true);
      await renderInvoicePreview();
    } catch (error) {
      toast.error(getActionErrorMessage(error, "Không tạo được preview hoá đơn"));
    } finally {
      setCapturing(false);
    }
  };

  const submitEmbeddedOrder = async () => {
    try {
      validateInvoice();
      if (!onCreateOrder) return;
      setSubmittingOrder(true);
      await onCreateOrder(currentSnapshot, {
        invoice_code: buildEmbeddedOrderCode(),
        invoice_date: invoiceDate,
      });
      toast.success("Đã tạo đơn hàng");
    } catch (error) {
      toast.error(getActionErrorMessage(error, "Không tạo được đơn hàng"));
    } finally {
      setSubmittingOrder(false);
    }
  };

  const captureInvoice = async () => {
    try {
      validateInvoice();
      setCapturing(true);
      const invoice = await createInvoice({
        invoice_date: invoiceDate,
        created_by: profile?.id ?? "",
        customer_name: customerName,
        customer_phone: customerPhone,
        customer_address: invoiceCustomerAddress,
        subtotal_amount: subtotal,
        discount_amount: discount,
        final_amount: total,
        notes: orderNote.trim() || internalNote,
        items: selectedLines.map((line) => {
          const product = products.find((item) => item.id === line.productId);
          const parent = products.find((item) => item.id === line.parentId);
          return {
            product_id: line.productId,
            product_name: parent?.name || product?.product_group || line.displayName,
            combo_name: line.displayName,
            quantity: Number(line.quantity || 0),
            unit_price: parseVndInput(line.unitPrice),
            subtotal: parseVndInput(line.total),
            discount_amount: parseVndInput(line.discount),
            total_amount: parseVndInput(line.totalAfterDiscount),
          };
        }),
      });
      await onCreateOrder?.(currentSnapshot, invoice);
      await renderInvoicePreview();
      toast.success("Đã tạo hoá đơn");
    } catch (error) {
      toast.error(getActionErrorMessage(error, "Không tạo được hoá đơn"));
    } finally {
      setCapturing(false);
    }
  };

  const copyInvoice = async () => {
    const blob = previewBlob ?? (await captureElementAsPngBlob({ target: previewRef.current }));
    const copied = await copyReportImageToClipboard(blob);
    if (!copied) {
      downloadBlob(blob, buildInvoiceFilename(customerName));
      toast.info("Trình duyệt không hỗ trợ copy ảnh, ảnh đã được tải xuống.");
      return;
    }
    toast.success("Đã copy ảnh hóa đơn");
  };

  const downloadInvoice = () => {
    if (!previewBlob) return;
    downloadBlob(previewBlob, buildInvoiceFilename(customerName));
  };

  const createLabel = createButtonLabel ?? (isEmbedded ? "Tạo đơn" : "Tạo hoá đơn");
  const draftLabel = saveDraftLabel ?? "Lưu nháp";
  const provinceOptions = vietnamAddressData?.provinces ?? [];
  const districtOptions = useMemo(
    () =>
      (vietnamAddressData?.districts ?? []).filter(
        (district) => district.provinceId === provinceId,
      ),
    [provinceId, vietnamAddressData?.districts],
  );
  const wardOptions = useMemo(
    () => (vietnamAddressData?.wards ?? []).filter((ward) => ward.districtId === districtId),
    [districtId, vietnamAddressData?.wards],
  );
  const embeddedSelectContentClass = isEmbedded ? "z-[260]" : undefined;

  return (
    <div
      className={cn(
        isEmbedded
          ? "flex h-full max-h-full min-h-0 flex-col overflow-hidden bg-slate-50/70"
          : "min-h-screen bg-slate-50/70 p-3 md:p-4",
      )}
    >
      {!isEmbedded ? (
        <Card className="mb-4 rounded-2xl border-slate-200/80 shadow-sm">
          <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <Receipt className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-950">Tạo hoá đơn</h1>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Tạo ảnh hoá đơn bán hàng từ bảng giá sản phẩm.
                </p>
              </div>
            </div>
            {!profile?.phone ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                Chưa có số điện thoại cá nhân, hotline trên hoá đơn sẽ để trống.
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <div
        className={cn(
          "grid gap-4",
          isEmbedded
            ? "min-h-0 flex-1 items-start overflow-y-auto overscroll-contain pr-1 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,1fr)]"
            : "xl:grid-cols-[520px_minmax(0,1fr)]",
        )}
      >
        <Card
          className={cn(
            "rounded-2xl border-slate-200/80 shadow-sm",
            isEmbedded ? "overflow-visible" : "flex min-h-0 flex-col overflow-hidden",
          )}
        >
          <CardContent
            className={cn(
              "space-y-4 p-4",
              isEmbedded
                ? "overflow-visible"
                : "max-h-[calc(100vh-156px)] overflow-y-auto overscroll-contain pb-24",
            )}
          >
            <SectionTitle title="Thông tin khách hàng" />
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Tên khách hàng">
                <Input
                  value={customerName}
                  onChange={(event) => setCustomerName(event.target.value)}
                />
              </Field>
              <Field label="Số điện thoại khách">
                <Input
                  value={customerPhone}
                  onChange={(event) => setCustomerPhone(event.target.value)}
                />
              </Field>
              <Field label="Ngày hoá đơn">
                <Input
                  type="date"
                  value={invoiceDate}
                  onChange={(event) => setInvoiceDate(event.target.value)}
                />
              </Field>
              <Field label="Chiết khấu hoá đơn">
                {isEmbedded ? (
                  <div className="grid grid-cols-[minmax(0,1fr)_92px] gap-2">
                    <Input
                      inputMode={discountType === "percent" ? "decimal" : "numeric"}
                      value={discountAmount}
                      onChange={(event) => {
                        const value = parseVndInput(event.target.value);
                        setDiscountAmount(
                          discountType === "percent"
                            ? String(Math.min(value, 100))
                            : formatVnd(value),
                        );
                      }}
                      placeholder="0"
                    />
                    <Select
                      value={discountType}
                      onValueChange={(value: "percent" | "amount") => {
                        setDiscountType(value);
                        setDiscountAmount("");
                      }}
                    >
                      <SelectTrigger aria-label="Loại chiết khấu">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className={embeddedSelectContentClass}>
                        <SelectItem value="percent">%</SelectItem>
                        <SelectItem value="amount">VNĐ</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <Input
                    inputMode="numeric"
                    value={discountAmount}
                    onChange={(event) =>
                      setDiscountAmount(formatVnd(parseVndInput(event.target.value)))
                    }
                    placeholder="0"
                  />
                )}
              </Field>
              <div className="md:col-span-2">
                <Field label="Địa chỉ">
                  <Textarea
                    value={customerAddress}
                    onChange={(event) => setCustomerAddress(event.target.value)}
                    className="h-12 min-h-12 resize-none"
                  />
                </Field>
              </div>
              {isEmbedded ? (
                <>
                  <Field label="Tỉnh/thành phố">
                    <Select
                      value={provinceId}
                      onValueChange={(value) => {
                        setProvinceId(value);
                        setDistrictId("");
                        setWardId("");
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue
                          placeholder={isLoadingAddress ? "Đang tải..." : "Chọn tỉnh/thành"}
                        />
                      </SelectTrigger>
                      <SelectContent className={embeddedSelectContentClass}>
                        {provinceOptions.map((province) => (
                          <SelectItem key={province.id} value={province.id}>
                            {province.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Quận/huyện">
                    <Select
                      value={districtId}
                      disabled={!provinceId}
                      onValueChange={(value) => {
                        setDistrictId(value);
                        setWardId("");
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Chọn quận/huyện" />
                      </SelectTrigger>
                      <SelectContent className={embeddedSelectContentClass}>
                        {districtOptions.map((district) => (
                          <SelectItem key={district.id} value={district.id}>
                            {district.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Xã/phường">
                    <Select value={wardId} disabled={!districtId} onValueChange={setWardId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Chọn xã/phường" />
                      </SelectTrigger>
                      <SelectContent className={embeddedSelectContentClass}>
                        {wardOptions.map((ward) => (
                          <SelectItem key={ward.id} value={ward.id}>
                            {ward.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Quốc gia">
                    <Input value="Việt Nam" readOnly disabled />
                  </Field>
                </>
              ) : null}
              <div className="md:col-span-2">
                <Field label="Ghi chú nội bộ">
                  <Textarea
                    value={internalNote}
                    onChange={(event) => setInternalNote(event.target.value)}
                    className="min-h-12 resize-none"
                    placeholder="Không hiển thị trên ảnh hoá đơn"
                  />
                </Field>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <SectionTitle title="Sản phẩm" />
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-xl"
                  onClick={() => setLines((current) => [...current, emptyLine()])}
                >
                  <Plus className="mr-1.5 h-4 w-4" />
                  Thêm
                </Button>
              </div>
              {lines.map((line, index) =>
                isEmbedded ? (
                  <div
                    key={line.id}
                    className="space-y-3 rounded-2xl border border-slate-200 bg-white p-3"
                  >
                    <div className="grid gap-3 md:grid-cols-2">
                      <Field label="Sản phẩm chính">
                        <Select
                          value={line.parentId}
                          onValueChange={(value) => selectParent(line.id, value)}
                        >
                          <SelectTrigger>
                            <SelectValue
                              placeholder={isLoading ? "Đang tải..." : "Chọn sản phẩm"}
                            />
                          </SelectTrigger>
                          <SelectContent className={embeddedSelectContentClass}>
                            {parentProducts.map((product) => (
                              <SelectItem key={product.id} value={product.id}>
                                {product.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field label="Combo">
                        <Select
                          value={line.productId}
                          disabled={!line.parentId}
                          onValueChange={(value) => selectProduct(line.id, value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Chọn combo" />
                          </SelectTrigger>
                          <SelectContent className={embeddedSelectContentClass}>
                            {(childrenByParent.get(line.parentId) ?? []).map((product) => (
                              <SelectItem key={product.id} value={product.id}>
                                {product.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <Field label="Số lượng">
                        <Input
                          inputMode="decimal"
                          value={line.quantity}
                          onChange={(event) =>
                            updateQuantityOrPrice(line.id, { quantity: event.target.value })
                          }
                        />
                      </Field>
                      <Field label="Đơn giá">
                        <Input
                          inputMode="numeric"
                          value={line.unitPrice}
                          onChange={(event) =>
                            updateQuantityOrPrice(line.id, {
                              unitPrice: formatVnd(parseVndInput(event.target.value)),
                            })
                          }
                        />
                      </Field>
                    </div>
                    {lines.length > 1 ? (
                      <div className="flex justify-end">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 rounded-lg px-2.5 text-red-600 hover:bg-red-50 hover:text-red-700"
                          aria-label={`Xoá dòng ${index + 1}`}
                          onClick={() =>
                            setLines((current) => current.filter((item) => item.id !== line.id))
                          }
                        >
                          <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                          Xoá
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div key={line.id} className="rounded-2xl border border-slate-200 bg-white p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-sm font-bold text-slate-950">Dòng {index + 1}</p>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-red-600"
                        disabled={lines.length === 1}
                        onClick={() =>
                          setLines((current) => current.filter((item) => item.id !== line.id))
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="grid gap-2 md:grid-cols-2">
                      <Field label="Sản phẩm chính">
                        <Select
                          value={line.parentId}
                          onValueChange={(value) => selectParent(line.id, value)}
                        >
                          <SelectTrigger>
                            <SelectValue
                              placeholder={isLoading ? "Đang tải..." : "Chọn sản phẩm chính"}
                            />
                          </SelectTrigger>
                          <SelectContent className={embeddedSelectContentClass}>
                            {parentProducts.map((product) => (
                              <SelectItem key={product.id} value={product.id}>
                                {product.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field label="Combo">
                        <Select
                          value={line.productId}
                          onValueChange={(value) => selectProduct(line.id, value)}
                          disabled={!line.parentId}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Chọn combo" />
                          </SelectTrigger>
                          <SelectContent className={embeddedSelectContentClass}>
                            {(childrenByParent.get(line.parentId) ?? []).map((product) => (
                              <SelectItem key={product.id} value={product.id}>
                                {product.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field label="Tên hiển thị">
                        <Input
                          value={line.displayName}
                          onChange={(event) =>
                            updateLine(line.id, { displayName: event.target.value })
                          }
                        />
                      </Field>
                      <Field label="Đơn vị">
                        <Input
                          value={line.unit}
                          onChange={(event) => updateLine(line.id, { unit: event.target.value })}
                        />
                      </Field>
                      <Field label="Số lượng">
                        <Input
                          inputMode="decimal"
                          value={line.quantity}
                          onChange={(event) =>
                            updateQuantityOrPrice(line.id, { quantity: event.target.value })
                          }
                        />
                      </Field>
                      <Field label="Đơn giá">
                        <Input
                          inputMode="numeric"
                          value={line.unitPrice}
                          onChange={(event) =>
                            updateQuantityOrPrice(line.id, {
                              unitPrice: formatVnd(parseVndInput(event.target.value)),
                            })
                          }
                        />
                      </Field>
                    </div>
                  </div>
                ),
              )}
            </div>
          </CardContent>
          {!isEmbedded ? (
            <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-2 border-t bg-white/95 p-3 backdrop-blur">
              <div>
                {!hideResetAction ? (
                  <Button variant="outline" size="sm" className="rounded-xl" onClick={resetInvoice}>
                    <RefreshCcw className="mr-2 h-4 w-4" />
                    Làm mới
                  </Button>
                ) : null}
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                {!hideCreateAction ? (
                  <Button
                    size="sm"
                    className="rounded-xl"
                    onClick={captureInvoice}
                    disabled={capturing}
                  >
                    <ImageIcon className="mr-2 h-4 w-4" />
                    {capturing ? "Đang tạo..." : createLabel}
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}
        </Card>

        {isEmbedded ? (
          <div className="space-y-4">
            <OrderSummary
              lines={selectedLines}
              subtotal={subtotal}
              discount={discount}
              discountType={discountType}
              discountInput={discountInput}
              total={total}
              orderNote={orderNote}
              onOrderNoteChange={setOrderNote}
              shippingFeeAmount={shippingFeeAmount}
              onShippingFeeChange={setShippingFeeAmount}
            />
            {embeddedActivityContent}
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div>
                <h2 className="text-base font-bold text-slate-950">Preview hoá đơn</h2>
                <p className="text-xs text-muted-foreground">Ảnh xuất ra giữ kích thước chuẩn.</p>
              </div>
              <Badge variant="secondary" className="rounded-full">
                A4 ngang
              </Badge>
            </div>
            <div className="h-[calc(100vh-214px)] overflow-auto bg-slate-100 p-4">
              <div className="h-[650px] w-[742px]">
                <div className="origin-top-left scale-[0.74]">
                  <InvoicePreview
                    ref={previewRef}
                    customerName={customerName}
                    customerPhone={customerPhone}
                    customerAddress={invoiceCustomerAddress}
                    invoiceDate={invoiceDate}
                    hotline={profile?.phone ?? ""}
                    lines={lines}
                    productImages={productImages}
                    subtotal={subtotal}
                    discount={discount}
                    total={total}
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {isEmbedded ? (
        <div className="relative z-10 flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-6 py-3 shadow-[0_-4px_14px_rgba(15,23,42,0.06)]">
          <p className="text-lg font-bold text-slate-950">
            Tổng tiền: {new Intl.NumberFormat("vi-VN").format(total)}đ
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="outline"
              className="rounded-xl"
              onClick={previewInvoice}
              disabled={capturing}
            >
              <ImageIcon className="mr-2 h-4 w-4" />
              In hoá đơn
            </Button>
            {onSaveDraft ? (
              <Button
                variant="outline"
                className="rounded-xl"
                onClick={saveDraft}
                disabled={savingDraft}
              >
                {savingDraft ? "Đang lưu..." : draftLabel}
              </Button>
            ) : null}
            {!hideCreateAction ? (
              <Button
                className="rounded-xl"
                onClick={submitEmbeddedOrder}
                disabled={submittingOrder}
              >
                <Plus className="mr-2 h-4 w-4" />
                {submittingOrder ? "Đang tạo..." : createLabel}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {isEmbedded ? (
        <div className="pointer-events-none fixed -left-[10000px] top-0" aria-hidden="true">
          <InvoicePreview
            ref={previewRef}
            customerName={customerName}
            customerPhone={customerPhone}
            customerAddress={invoiceCustomerAddress}
            invoiceDate={invoiceDate}
            hotline={profile?.phone ?? ""}
            lines={lines}
            productImages={productImages}
            subtotal={subtotal}
            discount={discount}
            total={total}
          />
        </div>
      ) : null}

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-[min(92vw,980px)] rounded-3xl">
          <DialogHeader>
            <DialogTitle>Preview ảnh hoá đơn</DialogTitle>
          </DialogHeader>
          {previewUrl ? (
            <div className="flex max-h-[72vh] items-center justify-center rounded-2xl border bg-slate-50 p-3">
              <img
                src={previewUrl}
                alt="Preview hoá đơn"
                className="max-h-[68vh] max-w-full rounded-xl bg-white object-contain"
              />
            </div>
          ) : null}
          <DialogFooter className="gap-2 sm:justify-end">
            {!isEmbedded ? (
              <Button variant="outline" onClick={downloadInvoice}>
                <Download className="mr-2 h-4 w-4" />
                Tải ảnh
              </Button>
            ) : null}
            <Button variant="outline" onClick={copyInvoice}>
              <Copy className="mr-2 h-4 w-4" />
              Copy ảnh
            </Button>
            <Button onClick={() => setPreviewOpen(false)}>Đóng</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

type InvoicePreviewProps = {
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  invoiceDate: string;
  hotline: string;
  lines: InvoiceBuilderLineSnapshot[];
  productImages: string[];
  subtotal: number;
  discount: number;
  total: number;
};

export const InvoicePreview = forwardRef<HTMLDivElement, InvoicePreviewProps>((props, ref) => {
  const displayLines = buildDisplayLines(props.lines);
  return (
    <div
      ref={ref}
      className="mx-auto w-[980px] bg-white p-6 text-black"
      style={{ fontFamily: '"Times New Roman", Times, serif' }}
    >
      <div className="border-2 border-black px-8 py-5">
        <div className="text-center">
          <h2 className="text-xl font-bold uppercase">CÔNG TY CỔ PHẦN TẬP ĐOÀN DASNOTRI</h2>
          <p className="text-lg italic">
            Địa chỉ: B29 Khu đấu giá Ngô Thì Nhậm, P.Hà Đông, TP.Hà Nội
          </p>
          <p className="mt-2 text-lg">Hotline: {props.hotline || "Chưa cập nhật"}</p>
          <div className="mt-2 text-lg font-bold tracking-wide text-blue-700">DASNOTRI</div>
          <h1 className="mt-4 text-3xl font-bold uppercase text-blue-700">HOÁ ĐƠN BÁN HÀNG</h1>
          <p className="mt-1 text-lg">{formatInvoiceDate(props.invoiceDate)}</p>
        </div>

        <div className="mt-5 grid grid-cols-[1fr_270px] gap-5">
          <div className="space-y-3 text-lg">
            <InfoLine label="Khách hàng:" value={props.customerName} />
            <InfoLine label="Số điện thoại:" value={props.customerPhone} />
            <InfoLine label="Địa chỉ:" value={props.customerAddress} />
          </div>
          <div className="flex justify-end gap-3">
            {props.productImages.length ? (
              props.productImages.map((imageUrl) => (
                <img
                  key={imageUrl}
                  src={imageUrl}
                  alt="Sản phẩm"
                  className="h-32 w-24 border object-cover"
                  crossOrigin="anonymous"
                />
              ))
            ) : (
              <div className="flex h-32 w-48 items-center justify-center border border-dashed text-sm text-slate-500">
                Ảnh sản phẩm
              </div>
            )}
          </div>
        </div>

        <table className="mt-6 w-full border-collapse text-lg">
          <thead>
            <tr>
              <th className="border-2 border-black px-3 py-2">Tên hàng hoá</th>
              <th className="w-32 border-2 border-black px-3 py-2">Số lượng</th>
              <th className="w-40 border-2 border-black px-3 py-2">Đơn giá</th>
              <th className="w-40 border-2 border-black px-3 py-2">Tổng</th>
            </tr>
          </thead>
          <tbody>
            {displayLines.map((line) => (
              <tr key={line.id}>
                <td className="border-2 border-black px-3 py-2 font-bold">{line.name}</td>
                <td className="border-2 border-black px-3 py-2 text-center font-bold">
                  {line.quantity}
                </td>
                <td className="border-2 border-black px-3 py-2 text-right font-bold">
                  {line.unitPrice}
                </td>
                <td className="border-2 border-black px-3 py-2 text-right font-bold">
                  {line.total}
                </td>
              </tr>
            ))}
            <tr>
              <td className="border-2 border-black px-3 py-2 text-center font-bold" colSpan={3}>
                Tổng
              </td>
              <td className="border-2 border-black px-3 py-2 text-right font-bold">
                {formatVnd(props.subtotal)}
              </td>
            </tr>
            <tr>
              <td className="border-2 border-black px-3 py-2 text-center font-bold" colSpan={3}>
                Chiết khấu
              </td>
              <td className="border-2 border-black px-3 py-2 text-right font-bold">
                {props.discount > 0 ? `-${formatVnd(props.discount)}` : "0"}
              </td>
            </tr>
            <tr>
              <td
                className="border-2 border-black px-3 py-2 text-center text-xl font-bold text-red-600"
                colSpan={3}
              >
                Tổng thanh toán ( Miễn Phí Ship)
              </td>
              <td className="border-2 border-black bg-yellow-300 px-3 py-2 text-right text-xl font-bold">
                {formatVnd(props.total)}
              </td>
            </tr>
          </tbody>
        </table>

        <p className="mt-8 text-center text-lg italic text-red-600">Cảm ơn và hẹn gặp lại !!!</p>
      </div>
    </div>
  );
});

InvoicePreview.displayName = "InvoicePreview";

function OrderSummary({
  lines,
  subtotal,
  discount,
  discountType,
  discountInput,
  total,
  orderNote,
  onOrderNoteChange,
  shippingFeeAmount,
  onShippingFeeChange,
}: {
  lines: InvoiceLine[];
  subtotal: number;
  discount: number;
  discountType: "percent" | "amount";
  discountInput: number;
  total: number;
  orderNote: string;
  onOrderNoteChange: (value: string) => void;
  shippingFeeAmount: string;
  onShippingFeeChange: (value: string) => void;
}) {
  const productCount = lines.reduce(
    (sum, line) => sum + Math.max(Number(line.quantity || 0), 0),
    0,
  );

  return (
    <Card className="overflow-hidden rounded-2xl border-slate-200/80 shadow-sm">
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-base font-bold text-slate-950">THÔNG TIN BÁO GIÁ</h2>
      </div>

      <div className="space-y-4 p-4">
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="font-medium text-slate-700">Chưa tạo đơn chính thức</span>
          <Badge className="rounded-full border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-50">
            Nháp
          </Badge>
        </div>

        <div className="space-y-2 border-t border-slate-200 pt-4 text-sm">
          <SummaryRow label="Số lượng sản phẩm" value={String(productCount)} />
          <SummaryRow label="Tổng tiền hàng" value={formatVnd(subtotal)} />
          <SummaryRow
            label={
              discountType === "percent" && discountInput > 0
                ? `Chiết khấu (${Math.min(discountInput, 100)}%)`
                : "Chiết khấu"
            }
            value={discount > 0 ? `-${formatVnd(discount)}` : formatVnd(0)}
          />
          <Field label="Phí vận chuyển">
            <Input
              inputMode="numeric"
              value={shippingFeeAmount}
              onChange={(event) =>
                onShippingFeeChange(formatVnd(parseVndInput(event.target.value)))
              }
              placeholder="0"
              className="text-right"
            />
          </Field>
          <SummaryRow
            label="Thành tiền"
            value={formatVnd(total)}
            className="border-t border-slate-200 pt-3 text-base font-bold text-blue-700"
          />
          <SummaryRow label="COD dự kiến" value={formatVnd(total)} />
        </div>

        <Field label="Ghi chú báo giá">
          <Textarea
            value={orderNote}
            onChange={(event) => onOrderNoteChange(event.target.value)}
            placeholder="Ghi chú cho khách..."
            rows={2}
            className="min-h-[56px] max-h-[72px] resize-none"
          />
        </Field>
      </div>
    </Card>
  );
}

function SummaryRow({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-4", className)}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function SectionTitle({ title }: { title: string }) {
  return <h2 className="text-lg font-bold text-slate-950">{title}</h2>;
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[150px_1fr] gap-3">
      <span className="font-bold">{label}</span>
      <span>{value || "..."}</span>
    </div>
  );
}

function normalizeBenefit(value: string | null | undefined) {
  const text = value?.trim() ?? "";
  if (!text || text.toLowerCase() === "không áp dụng") return "";
  return text;
}

function buildDisplayLines(lines: InvoiceBuilderLineSnapshot[]) {
  return lines.flatMap((line) => {
    const rows = [];
    if (line.displayName.trim()) {
      rows.push({
        id: `${line.id}:product`,
        name: line.displayName,
        quantity: `${line.quantity} ${line.unit}`.trim(),
        unitPrice: formatVnd(parseVndInput(line.unitPrice)),
        total: formatVnd(parseVndInput(line.total)),
      });
    }
    if (line.gift) {
      rows.push({ id: `${line.id}:gift`, name: line.gift, quantity: "", unitPrice: "", total: "" });
    }
    if (line.nextVoucher) {
      rows.push({
        id: `${line.id}:voucher`,
        name: line.nextVoucher,
        quantity: "",
        unitPrice: "",
        total: "",
      });
    }
    return rows;
  });
}

function formatInvoiceDate(value: string) {
  const date = value ? new Date(`${value}T00:00:00`) : new Date();
  return `Ngày ${date.getDate().toString().padStart(2, "0")} Tháng ${(date.getMonth() + 1)
    .toString()
    .padStart(2, "0")} Năm ${date.getFullYear()}`;
}

function buildInvoiceFilename(customerName: string) {
  const slug = customerName
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return `hoa-don-${slug || "khach-hang"}.png`;
}
