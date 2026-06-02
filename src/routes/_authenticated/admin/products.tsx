import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ChevronDown,
  ChevronRight,
  Edit3,
  ImageUp,
  Package,
  PackageOpen,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { TableBody, TableCell, TableHead, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  calculateProductPrices,
  createProduct,
  deleteProduct,
  fetchProducts,
  formatVnd,
  parseVndInput,
  updateProduct,
  updateProductsImage,
  uploadProductImage,
  type ProductDraft,
  type ProductRow,
} from "@/lib/products";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/products")({
  component: AdminProducts,
});

const ROOT_VALUE = "__root__";

interface ProductFormState {
  id?: string;
  parent_id: string | null;
  name: string;
  quantity: string;
  unit: string;
  price_before_tax: string;
  base_price: string;
  discount_percent: string;
  gift: string;
  next_voucher: string;
  image_url: string;
  sort_order: string;
  is_active: boolean;
}

const emptyForm: ProductFormState = {
  parent_id: null,
  name: "",
  quantity: "1",
  unit: "hũ",
  price_before_tax: "",
  base_price: "",
  discount_percent: "0",
  gift: "",
  next_voucher: "",
  image_url: "",
  sort_order: "0",
  is_active: true,
};

function productToForm(product: ProductRow): ProductFormState {
  return {
    id: product.id,
    parent_id: product.parent_id,
    name: product.name,
    quantity: String(product.quantity || 0),
    unit: product.unit || "hũ",
    price_before_tax: formatVnd(product.price_before_tax),
    base_price: formatVnd(product.base_price),
    discount_percent: String(product.discount_percent || 0),
    gift: product.gift ?? "",
    next_voucher: product.next_voucher ?? "",
    image_url: product.image_url ?? "",
    sort_order: String(product.sort_order || 0),
    is_active: product.is_active,
  };
}

function formToDraft(form: ProductFormState, parent: ProductRow | undefined): ProductDraft {
  const parentId = form.parent_id === ROOT_VALUE ? null : form.parent_id;
  const isParent = !parentId;
  return {
    parent_id: parentId,
    name: form.name,
    product_group: isParent ? form.name : (parent?.name ?? null),
    quantity: Number(form.quantity || 0),
    unit: form.unit,
    price_before_tax: parseVndInput(form.price_before_tax),
    base_price: parseVndInput(form.base_price),
    discount_percent: Number(form.discount_percent || 0),
    gift: form.gift,
    next_voucher: form.next_voucher,
    image_url: form.image_url,
    sort_order: Number(form.sort_order || 0),
    is_active: form.is_active,
  };
}

function getProductFamilyIds(product: ProductRow, products: ProductRow[]) {
  const parentId = product.parent_id ?? product.id;
  const ids = new Set<string>([parentId, product.id]);
  products.forEach((item) => {
    if (item.id === parentId || item.parent_id === parentId) ids.add(item.id);
  });
  return Array.from(ids);
}

function getInheritedProductImage(product: ProductRow, products: ProductRow[]) {
  if (product.image_url) return product.image_url;
  if (!product.parent_id) return "";
  return products.find((item) => item.id === product.parent_id)?.image_url ?? "";
}

function AdminProducts() {
  const qc = useQueryClient();
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<ProductFormState>(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<ProductRow | null>(null);
  const [imageName, setImageName] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState("");
  const [localImagePreviewUrl, setLocalImagePreviewUrl] = useState("");

  useEffect(() => {
    return () => {
      if (localImagePreviewUrl) URL.revokeObjectURL(localImagePreviewUrl);
    };
  }, [localImagePreviewUrl]);

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["admin-products"],
    queryFn: fetchProducts,
  });

  const parents = useMemo(
    () =>
      products.filter((product) => !product.parent_id).sort((a, b) => a.sort_order - b.sort_order),
    [products],
  );

  const childrenByParent = useMemo(() => {
    const map = new Map<string, ProductRow[]>();
    products
      .filter((product) => product.parent_id)
      .forEach((product) => {
        const list = map.get(product.parent_id ?? "") ?? [];
        list.push(product);
        map.set(product.parent_id ?? "", list);
      });
    map.forEach((list) => list.sort((a, b) => a.sort_order - b.sort_order));
    return map;
  }, [products]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const parent = products.find((product) => product.id === form.parent_id);
      let imageUrl = form.image_url || parent?.image_url || "";

      if (imageFile) {
        imageUrl = await uploadProductImage(imageFile, form.name || parent?.name || "product");
      }

      const draft = {
        ...formToDraft({ ...form, image_url: imageUrl }, parent),
        image_url: imageUrl,
      };
      if (!draft.name.trim()) throw new Error("Nhập tên sản phẩm");
      const savedProduct = form.id
        ? await updateProduct(form.id, draft)
        : await createProduct(draft);

      if (imageUrl) {
        await updateProductsImage(getProductFamilyIds(savedProduct, products), imageUrl);
      }

      return savedProduct;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["admin-products"] });
      setFormOpen(false);
      setForm(emptyForm);
      setImageName("");
      setImageFile(null);
      setImagePreviewUrl("");
      setLocalImagePreviewUrl("");
      toast.success(form.id ? "Đã cập nhật sản phẩm" : "Đã lưu sản phẩm");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Không lưu được sản phẩm");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteProduct(id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["admin-products"] });
      setDeleteTarget(null);
      toast.success("Đã xóa sản phẩm");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Không xóa được sản phẩm");
    },
  });

  const pricePreview = calculateProductPrices(
    parseVndInput(form.base_price),
    Number(form.discount_percent || 0),
  );

  const openCreateDialog = (parentId: string | null = null) => {
    const parent = products.find((product) => product.id === parentId);
    const inheritedImageUrl = parent?.image_url ?? "";
    setForm({
      ...emptyForm,
      parent_id: parentId,
      sort_order: String(products.length + 1),
      unit: parent ? "hũ" : "",
      image_url: inheritedImageUrl,
    });
    setImageName("");
    setImageFile(null);
    setImagePreviewUrl(inheritedImageUrl);
    setLocalImagePreviewUrl("");
    setFormOpen(true);
  };

  const openEditDialog = (product: ProductRow) => {
    const inheritedImageUrl = getInheritedProductImage(product, products);
    setForm({ ...productToForm(product), image_url: inheritedImageUrl });
    setImageName("");
    setImageFile(null);
    setImagePreviewUrl(inheritedImageUrl);
    setLocalImagePreviewUrl("");
    setFormOpen(true);
  };

  const handleImageChange = (file: File | undefined) => {
    if (!file) return;
    const previewUrl = URL.createObjectURL(file);
    setImageFile(file);
    setImageName(file.name);
    setImagePreviewUrl(previewUrl);
    setLocalImagePreviewUrl(previewUrl);
  };

  const handleFormOpenChange = (open: boolean) => {
    setFormOpen(open);
    if (!open) {
      setForm(emptyForm);
      setImageName("");
      setImageFile(null);
      setImagePreviewUrl("");
      setLocalImagePreviewUrl("");
    }
  };

  const toggleGroup = (id: string) => {
    setExpandedGroups((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-slate-50/70 p-4 md:p-6">
      <Card className="mb-6 rounded-3xl border-slate-200/80 shadow-sm">
        <CardContent className="flex flex-col gap-4 p-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
              <Package className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-950">Quản lý Sản phẩm</h1>
              <p className="mt-1 text-base text-muted-foreground">
                Quản lý bảng giá, combo, quà tặng và voucher nội bộ.
              </p>
            </div>
          </div>
          <Button className="h-12 rounded-2xl px-5 text-base" onClick={() => openCreateDialog()}>
            <Plus className="mr-2 h-5 w-5" />
            Thêm sản phẩm chính
          </Button>
        </CardContent>
      </Card>

      <Card className="overflow-hidden rounded-3xl border-slate-200/80 shadow-sm">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <div className="min-w-[1180px]">
              <div className="z-30 bg-white shadow-[0_6px_14px_rgba(15,23,42,0.06)]">
                <div className="flex items-center justify-between border-b bg-white px-6 py-4">
                  <div>
                    <h2 className="text-xl font-bold text-slate-950">Bảng sản phẩm</h2>
                    <p className="text-sm text-muted-foreground">
                      Nhóm cha có thể thu gọn, từng combo có thể sửa/xóa riêng.
                    </p>
                  </div>
                  <Badge variant="secondary" className="rounded-full px-3 py-1">
                    {products.length} dòng
                  </Badge>
                </div>
                <table className="w-full caption-bottom text-sm">
                  <ProductTableColGroup />
                  <thead>
                    <TableRow className="border-b bg-slate-100 hover:bg-slate-100">
                      <TableHead className="px-4 text-xs font-bold uppercase tracking-wide">
                        Sản phẩm
                      </TableHead>
                      <TableHead className="text-right text-xs font-bold uppercase tracking-wide">
                        SL
                      </TableHead>
                      <TableHead className="text-right text-xs font-bold uppercase tracking-wide">
                        Giá gốc
                      </TableHead>
                      <TableHead className="text-right text-xs font-bold uppercase tracking-wide">
                        Chiết khấu
                      </TableHead>
                      <TableHead className="text-right text-xs font-bold uppercase tracking-wide">
                        Giá sau CK
                      </TableHead>
                      <TableHead className="text-xs font-bold uppercase tracking-wide">
                        Quà tặng
                      </TableHead>
                      <TableHead className="text-xs font-bold uppercase tracking-wide">
                        Voucher lần sau
                      </TableHead>
                      <TableHead className="text-right text-xs font-bold uppercase tracking-wide">
                        Hành động
                      </TableHead>
                    </TableRow>
                  </thead>
                </table>
              </div>
              <div className="max-h-[calc(100vh-390px)] overflow-y-auto">
                <table className="w-full caption-bottom text-sm">
                  <ProductTableColGroup />
                  <TableBody>
                    {isLoading ? (
                      <TableRow>
                        <TableCell colSpan={8} className="h-40 text-center text-muted-foreground">
                          Đang tải bảng sản phẩm...
                        </TableCell>
                      </TableRow>
                    ) : parents.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="h-40 text-center text-muted-foreground">
                          Chưa có sản phẩm nào.
                        </TableCell>
                      </TableRow>
                    ) : (
                      parents.map((parent) => {
                        const children = childrenByParent.get(parent.id) ?? [];
                        const expanded = expandedGroups.has(parent.id);
                        return (
                          <Fragment key={parent.id}>
                            <TableRow className="bg-slate-50/90 hover:bg-slate-100">
                              <TableCell className="px-4 py-4">
                                <button
                                  type="button"
                                  className="flex items-center gap-3 text-left"
                                  onClick={() => toggleGroup(parent.id)}
                                >
                                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                                    {expanded ? (
                                      <ChevronDown className="h-5 w-5" />
                                    ) : (
                                      <ChevronRight className="h-5 w-5" />
                                    )}
                                  </span>
                                  <span>
                                    <span className="block font-bold text-slate-950">
                                      {parent.name}
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                      {children.length} combo
                                    </span>
                                  </span>
                                </button>
                              </TableCell>
                              <TableCell colSpan={5} className="text-sm text-muted-foreground">
                                Nhóm sản phẩm chính
                              </TableCell>
                              <TableCell>
                                <Badge
                                  className={cn(
                                    "rounded-full",
                                    parent.is_active
                                      ? "bg-emerald-50 text-emerald-700"
                                      : "bg-slate-100 text-slate-500",
                                  )}
                                >
                                  {parent.is_active ? "Active" : "Inactive"}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                <ProductActions
                                  onAddChild={() => openCreateDialog(parent.id)}
                                  onEdit={() => openEditDialog(parent)}
                                  onDelete={() => setDeleteTarget(parent)}
                                />
                              </TableCell>
                            </TableRow>
                            {expanded &&
                              children.map((child) => (
                                <TableRow key={child.id} className="bg-white">
                                  <TableCell className="px-4 py-3">
                                    <div className="flex items-center gap-3 pl-12">
                                      <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
                                        <PackageOpen className="h-4 w-4" />
                                      </span>
                                      <div>
                                        <div className="font-semibold text-slate-950">
                                          {child.name}
                                        </div>
                                        <div className="text-xs text-muted-foreground">
                                          {child.product_group ?? parent.name}
                                        </div>
                                      </div>
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-right font-medium">
                                    {child.quantity} {child.unit}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {formatVnd(child.base_price)}đ
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {child.discount_percent}%
                                  </TableCell>
                                  <TableCell className="text-right font-semibold">
                                    {formatVnd(child.price_after_discount)}đ
                                  </TableCell>
                                  <TableCell className="text-muted-foreground">
                                    {child.gift || "Không áp dụng"}
                                  </TableCell>
                                  <TableCell className="text-muted-foreground">
                                    {child.next_voucher || "Không áp dụng"}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <ProductActions
                                      onEdit={() => openEditDialog(child)}
                                      onDelete={() => setDeleteTarget(child)}
                                    />
                                  </TableCell>
                                </TableRow>
                              ))}
                          </Fragment>
                        );
                      })
                    )}
                  </TableBody>
                </table>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={formOpen} onOpenChange={handleFormOpenChange}>
        <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold">
              {form.id ? "Sửa Sản Phẩm" : "Thêm Sản Phẩm Mới"}
            </DialogTitle>
            <DialogDescription>
              Giá sau chiết khấu được tự tính theo giá gốc và phần trăm chiết khấu.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-5 md:grid-cols-2">
            <Field label="Tên sản phẩm">
              <Input
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({ ...current, name: event.target.value }))
                }
                placeholder="Combo 2 hũ Notrigold"
              />
            </Field>
            <Field label="Nhóm sản phẩm / Sản phẩm chính">
              <Select
                value={form.parent_id ?? ROOT_VALUE}
                onValueChange={(value) => {
                  const parentId = value === ROOT_VALUE ? null : value;
                  const parent = products.find((product) => product.id === parentId);
                  const inheritedImageUrl = parent?.image_url ?? "";
                  setForm((current) => ({
                    ...current,
                    parent_id: parentId,
                    image_url: current.image_url || inheritedImageUrl,
                  }));
                  if (!imageFile && !imagePreviewUrl && inheritedImageUrl) {
                    setImagePreviewUrl(inheritedImageUrl);
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Chọn nhóm sản phẩm" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ROOT_VALUE}>Sản phẩm chính mới</SelectItem>
                  {parents
                    .filter((parent) => parent.id !== form.id)
                    .map((parent) => (
                      <SelectItem key={parent.id} value={parent.id}>
                        {parent.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Số lượng (SL)">
              <Input
                inputMode="decimal"
                value={form.quantity}
                onChange={(event) =>
                  setForm((current) => ({ ...current, quantity: event.target.value }))
                }
              />
            </Field>
            <Field label="Đơn vị">
              <Input
                value={form.unit}
                onChange={(event) =>
                  setForm((current) => ({ ...current, unit: event.target.value }))
                }
                placeholder="hũ"
              />
            </Field>
            <MoneyField
              label="Giá trước thuế"
              value={form.price_before_tax}
              onChange={(value) => setForm((current) => ({ ...current, price_before_tax: value }))}
            />
            <MoneyField
              label="Giá gốc (VND)"
              value={form.base_price}
              onChange={(value) => setForm((current) => ({ ...current, base_price: value }))}
            />
            <Field label="Chiết khấu (%)">
              <Input
                inputMode="decimal"
                value={form.discount_percent}
                onChange={(event) =>
                  setForm((current) => ({ ...current, discount_percent: event.target.value }))
                }
              />
            </Field>
            <Field label="Sort order">
              <Input
                inputMode="numeric"
                value={form.sort_order}
                onChange={(event) =>
                  setForm((current) => ({ ...current, sort_order: event.target.value }))
                }
              />
            </Field>
            <Field label="Giá sau CK (VND)">
              <Input readOnly value={`${formatVnd(pricePreview.price_after_discount)}đ`} />
            </Field>
            <Field label="Giá bán sau CK (VND)">
              <Input readOnly value={`${formatVnd(pricePreview.final_price_after_discount)}đ`} />
            </Field>
            <Field label="Quà tặng">
              <Input
                value={form.gift}
                onChange={(event) =>
                  setForm((current) => ({ ...current, gift: event.target.value }))
                }
                placeholder="Không áp dụng"
              />
            </Field>
            <Field label="Voucher lần sau">
              <Input
                value={form.next_voucher}
                onChange={(event) =>
                  setForm((current) => ({ ...current, next_voucher: event.target.value }))
                }
                placeholder="Không áp dụng"
              />
            </Field>
            <div className="md:col-span-2">
              <Label>Hình ảnh sản phẩm</Label>
              <label className="mt-2 flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-6 text-center transition hover:border-blue-300 hover:bg-blue-50/40">
                {imagePreviewUrl ? (
                  <img
                    src={imagePreviewUrl}
                    alt={form.name || "Ảnh sản phẩm"}
                    className="mb-4 h-36 w-36 rounded-2xl border border-slate-200 bg-white object-cover shadow-sm"
                  />
                ) : (
                  <ImageUp className="mb-3 h-8 w-8 text-blue-500" />
                )}
                <span className="font-semibold text-slate-900">
                  {imageName ||
                    (imagePreviewUrl
                      ? "Ảnh sản phẩm hiện tại"
                      : "Chọn hoặc kéo thả hình ảnh sản phẩm")}
                </span>
                <span className="mt-1 text-sm text-muted-foreground">
                  Ảnh sẽ được lưu và áp dụng mặc định cho toàn bộ combo của sản phẩm này.
                </span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => handleImageChange(event.target.files?.[0])}
                />
              </label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => handleFormOpenChange(false)}>
              Hủy
            </Button>
            <Button disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
              Lưu sản phẩm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xóa sản phẩm?</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có chắc muốn xóa {deleteTarget?.name}? Nếu đây là nhóm sản phẩm chính, toàn bộ
              combo con cũng sẽ bị xóa theo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              Xóa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ProductTableColGroup() {
  return (
    <colgroup>
      <col className="w-[32%]" />
      <col className="w-[7%]" />
      <col className="w-[10%]" />
      <col className="w-[8%]" />
      <col className="w-[11%]" />
      <col className="w-[16%]" />
      <col className="w-[16%]" />
      <col className="w-[180px]" />
    </colgroup>
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

function MoneyField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label}>
      <Input
        inputMode="numeric"
        value={value}
        onChange={(event) => onChange(formatVnd(parseVndInput(event.target.value)))}
        placeholder="390.000"
      />
    </Field>
  );
}

function ProductActions({
  onAddChild,
  onEdit,
  onDelete,
}: {
  onAddChild?: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center justify-end gap-2">
      {onAddChild ? (
        <Button variant="outline" size="sm" className="rounded-xl" onClick={onAddChild}>
          <Plus className="mr-1 h-4 w-4" />
          Combo
        </Button>
      ) : null}
      <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl" onClick={onEdit}>
        <Edit3 className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-9 w-9 rounded-xl text-red-600 hover:text-red-700"
        onClick={onDelete}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}
