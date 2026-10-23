"use client";

import { formatApp } from "@/lib/app-timezone";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, startOfYear } from "date-fns";
import {
  AlertTriangle,
  Banknote,
  CalendarCheck2,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileText,
  LoaderCircle,
  Pencil,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  UsersRound,
  X,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import {
  createLeavePolicy,
  createLeaveType,
  getLeaveTypes,
  updateLeavePolicy,
  updateLeaveType,
  type AccrualMethod,
  type LeaveEntitlementPolicy,
  type LeavePolicyPayload,
  type LeaveTypeItem,
  type LeaveTypePayload,
  type LeaveUnit,
} from "@/lib/leave-api";
import { cn } from "@/lib/utils";
import { formatDurationHours, formatDurationMinutes } from "@/lib/time-format";
import { generateBusinessCode } from "@/lib/business-code";

type TypeFormState = LeaveTypePayload;
type PolicyFormState = LeavePolicyPayload;

const emptyType: TypeFormState = {
  code: "",
  name: "",
  description: "",
  color: "#2563EB",
  isPaid: true,
  unit: "day",
  tracksBalance: true,
  allowNegativeBalance: false,
  requiresAttachment: false,
  attachmentRequiredAfter: null,
  hoursPerDay: 8,
  hourIncrementMinutes: 30,
  minNoticeDays: 1,
  allowRetroactive: false,
  requiresApproval: true,
  isActive: true,
};

export function LeaveTypeDashboard() {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.get("search") ?? "";
  const status = searchParams.get("status") ?? "all";
  const payType = searchParams.get("payType") ?? "all";
  const tracksBalance = searchParams.get("tracksBalance") ?? "all";
  const [typeForm, setTypeForm] = useState<LeaveTypeItem | "new" | null>(null);
  const [policyForm, setPolicyForm] = useState<LeaveTypeItem | null>(null);

  const updateQuery = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      Object.entries(updates).forEach(([key, value]) =>
        value && value !== "all" ? params.set(key, value) : params.delete(key),
      );
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      });
    },
    [pathname, router, searchParams],
  );

  const report = useQuery({
    queryKey: ["leave-types", search, status, payType, tracksBalance],
    queryFn: () =>
      getLeaveTypes({
        search: search || undefined,
        status: status === "all" ? undefined : status,
        payType: payType === "all" ? undefined : payType,
        tracksBalance: tracksBalance === "all" ? undefined : tracksBalance,
      }),
  });
  const canManageTypes = hasPermission("leave_types.manage");
  const canManagePolicies = hasPermission("leave_entitlements.manage");

  return (
    <div className="mx-auto w-full max-w-[1720px] space-y-5">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-brand">
            Quản lý nghỉ phép
          </p>
          <h1 className="mt-2 text-2xl font-black tracking-[-0.04em] sm:text-[30px]">
            Loại nghỉ và hạn mức
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
            Thiết lập cách nhân viên được nghỉ, quy tắc kiểm soát và chính sách
            cấp phép có hiệu lực theo thời gian.
          </p>
        </div>
        {canManageTypes && (
          <Button variant="brand" onClick={() => setTypeForm("new")}>
            <Plus className="size-4" />
            Thêm loại nghỉ
          </Button>
        )}
      </header>

      {report.data && <Summary summary={report.data.summary} />}

      <section className="border border-line bg-surface shadow-panel">
        <div className="grid gap-px bg-line md:grid-cols-2 xl:grid-cols-[1.5fr_1fr_1fr_1fr]">
          <Filter label="Tìm loại nghỉ">
            <div className="relative">
              <Search className="absolute left-3 top-3 size-4 text-muted" />
              <input
                className="input border-0 pl-9"
                value={search}
                onChange={(event) =>
                  updateQuery({ search: event.target.value })
                }
                placeholder="Tên hoặc mã loại nghỉ..."
              />
            </div>
          </Filter>
          <Filter label="Trạng thái">
            <select
              className="input border-0"
              value={status}
              onChange={(event) => updateQuery({ status: event.target.value })}
            >
              <option value="all">Tất cả trạng thái</option>
              <option value="active">Đang áp dụng</option>
              <option value="inactive">Ngừng sử dụng</option>
            </select>
          </Filter>
          <Filter label="Hưởng lương">
            <select
              className="input border-0"
              value={payType}
              onChange={(event) => updateQuery({ payType: event.target.value })}
            >
              <option value="all">Tất cả</option>
              <option value="paid">Có lương</option>
              <option value="unpaid">Không lương</option>
            </select>
          </Filter>
          <Filter label="Quản lý số dư">
            <select
              className="input border-0"
              value={tracksBalance}
              onChange={(event) =>
                updateQuery({ tracksBalance: event.target.value })
              }
            >
              <option value="all">Tất cả</option>
              <option value="true">Có hạn mức</option>
              <option value="false">Không giới hạn</option>
            </select>
          </Filter>
        </div>
      </section>

      {report.isLoading ? (
        <Loading />
      ) : report.isError ? (
        <ErrorState
          message={report.error.message}
          retry={() => report.refetch()}
        />
      ) : report.data?.items.length ? (
        <LeaveTypeTable
          items={report.data.items}
          canManageTypes={canManageTypes}
          canManagePolicies={canManagePolicies}
          editType={setTypeForm}
          editPolicy={setPolicyForm}
        />
      ) : (
        <Empty />
      )}

      {typeForm && (
        <LeaveTypeModal
          item={typeForm === "new" ? null : typeForm}
          close={() => setTypeForm(null)}
          saved={() => {
            setTypeForm(null);
            queryClient.invalidateQueries({ queryKey: ["leave-types"] });
          }}
        />
      )}
      {policyForm && (
        <PolicyModal
          item={policyForm}
          close={() => setPolicyForm(null)}
          saved={() => {
            setPolicyForm(null);
            queryClient.invalidateQueries({ queryKey: ["leave-types"] });
          }}
        />
      )}
    </div>
  );
}

function Summary({
  summary,
}: {
  summary: {
    total: number;
    active: number;
    paid: number;
    trackedBalance: number;
    missingPolicy: number;
  };
}) {
  const cards = [
    {
      label: "Tổng loại nghỉ",
      value: summary.total,
      note: `${summary.active} đang áp dụng`,
      icon: CalendarCheck2,
      tone: "bg-info-soft text-brand",
    },
    {
      label: "Có hưởng lương",
      value: summary.paid,
      note: "Tính vào công hưởng lương",
      icon: Banknote,
      tone: "bg-success-soft text-success",
    },
    {
      label: "Theo dõi hạn mức",
      value: summary.trackedBalance,
      note: "Có phát sinh số dư phép",
      icon: SlidersHorizontal,
      tone: "bg-info-soft text-info",
    },
    {
      label: "Thiếu chính sách",
      value: summary.missingPolicy,
      note: summary.missingPolicy
        ? "Cần cấu hình hạn mức"
        : "Cấu hình đã đầy đủ",
      icon: summary.missingPolicy ? AlertTriangle : CheckCircle2,
      tone: summary.missingPolicy
        ? "bg-warning-soft text-warning-strong"
        : "bg-success-soft text-success",
    },
  ];
  return (
    <section className="grid gap-px border border-line bg-line sm:grid-cols-2 xl:grid-cols-4">
      {cards.map(({ label, value, note, icon: Icon, tone }) => (
        <div key={label} className="bg-surface p-4 sm:p-5">
          <div className={cn("grid size-9 place-items-center", tone)}>
            <Icon className="size-[17px]" />
          </div>
          <p className="mt-4 text-[10px] font-extrabold uppercase tracking-[0.12em] text-muted">
            {label}
          </p>
          <p className="mt-1 font-mono text-2xl font-bold">{value}</p>
          <p className="mt-1 text-[11px] text-muted">{note}</p>
        </div>
      ))}
    </section>
  );
}

function LeaveTypeTable({
  items,
  canManageTypes,
  canManagePolicies,
  editType,
  editPolicy,
}: {
  items: LeaveTypeItem[];
  canManageTypes: boolean;
  canManagePolicies: boolean;
  editType: (item: LeaveTypeItem) => void;
  editPolicy: (item: LeaveTypeItem) => void;
}) {
  return (
    <section className="overflow-hidden border border-line bg-surface shadow-panel">
      <header className="border-b border-line px-4 py-4 sm:px-5">
        <h2 className="font-extrabold">Danh sách loại nghỉ</h2>
        <p className="mt-1 text-xs text-muted">
          Hạn mức được lấy theo chính sách đang có hiệu lực tại thời điểm sử
          dụng.
        </p>
      </header>
      <div className="hidden grid-cols-[minmax(260px,1.4fr)_120px_150px_minmax(220px,1fr)_150px_110px] gap-4 border-b border-line bg-canvas/60 px-5 py-3 text-[10px] font-extrabold uppercase tracking-wide text-muted lg:grid">
        <span>Loại nghỉ</span>
        <span>Hưởng lương</span>
        <span>Cách sử dụng</span>
        <span>Hạn mức hiện tại</span>
        <span>Phạm vi dùng</span>
        <span className="text-right">Thao tác</span>
      </div>
      <div className="divide-y divide-line">
        {items.map((item) => {
          const policy = item.currentPolicy ?? item.nextPolicy;
          return (
            <article
              key={item.id}
              className={cn(
                "grid gap-4 p-4 sm:px-5 lg:grid-cols-[minmax(260px,1.4fr)_120px_150px_minmax(220px,1fr)_150px_110px] lg:items-center",
                !item.isActive && "bg-canvas/45 opacity-75",
              )}
            >
              <div className="flex min-w-0 gap-3">
                <span
                  className="mt-1 size-3 shrink-0"
                  style={{ backgroundColor: item.color }}
                />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-sm font-extrabold">
                      {item.name}
                    </h3>
                    <code className="bg-canvas px-1.5 py-0.5 text-[9px] text-muted">
                      {item.code}
                    </code>
                    {!item.isActive && <Tag tone="neutral">Ngừng dùng</Tag>}
                  </div>
                  <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-muted">
                    {item.description || "Chưa có mô tả."}
                  </p>
                </div>
              </div>
              <div>
                <MobileLabel>Hưởng lương</MobileLabel>
                <Tag tone={item.isPaid ? "success" : "warning"}>
                  {item.isPaid ? "Có lương" : "Không lương"}
                </Tag>
              </div>
              <div>
                <MobileLabel>Cách sử dụng</MobileLabel>
                <p className="text-xs font-bold">{unitLabel(item.unit)}</p>
                <p className="mt-1 text-[10px] text-muted">
                  Bước {formatDurationMinutes(item.hourIncrementMinutes)} · {formatDurationHours(item.hoursPerDay)}/ngày
                </p>
              </div>
              <div>
                <MobileLabel>Hạn mức hiện tại</MobileLabel>
                {item.tracksBalance ? (
                  policy ? (
                    <>
                      <p className="font-mono text-sm font-black text-brand">
                        {policy.allowanceAmount} {amountUnit(item.unit)}
                      </p>
                      <p className="mt-1 text-[10px] text-muted">
                        {accrualLabel(policy.accrualMethod)} · từ{" "}
                        {dateLabel(policy.effectiveFrom)}
                        {!item.currentPolicy && " (sắp áp dụng)"}
                      </p>
                    </>
                  ) : (
                    <div className="flex items-center gap-2 text-xs font-bold text-warning-strong">
                      <AlertTriangle className="size-4" />
                      Chưa cấu hình
                    </div>
                  )
                ) : (
                  <>
                    <p className="text-xs font-extrabold">Không giới hạn</p>
                    <p className="mt-1 text-[10px] text-muted">
                      Không kiểm tra số dư
                    </p>
                  </>
                )}
              </div>
              <div>
                <MobileLabel>Phạm vi dùng</MobileLabel>
                <p className="text-xs font-bold">
                  {item.usage.employeesWithBalance} nhân viên
                </p>
                <p className="mt-1 text-[10px] text-muted">
                  {item.usage.requests} yêu cầu · {item.usage.policyCount} chính
                  sách
                </p>
              </div>
              <div className="flex justify-end gap-2">
                {canManagePolicies && item.tracksBalance && (
                  <button
                    title="Cấu hình hạn mức"
                    onClick={() => editPolicy(item)}
                    className="grid size-8 place-items-center border border-line text-muted hover:border-brand/40 hover:text-brand"
                  >
                    <Settings2 className="size-3.5" />
                  </button>
                )}
                {canManageTypes && (
                  <button
                    title="Sửa loại nghỉ"
                    onClick={() => editType(item)}
                    className="grid size-8 place-items-center border border-line text-muted hover:border-brand/40 hover:text-brand"
                  >
                    <Pencil className="size-3.5" />
                  </button>
                )}
                <ChevronRight className="my-auto size-4 text-line" />
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function LeaveTypeModal({
  item,
  close,
  saved,
}: {
  item: LeaveTypeItem | null;
  close: () => void;
  saved: () => void;
}) {
  const [form, setForm] = useState<TypeFormState>(
    item
      ? {
          code: item.code,
          name: item.name,
          description: item.description ?? "",
          color: item.color,
          isPaid: item.isPaid,
          unit: item.unit,
          tracksBalance: item.tracksBalance,
          allowNegativeBalance: item.allowNegativeBalance,
          requiresAttachment: item.requiresAttachment,
          attachmentRequiredAfter: item.attachmentRequiredAfter,
          hoursPerDay: item.hoursPerDay,
          hourIncrementMinutes: item.hourIncrementMinutes,
          minNoticeDays: item.minNoticeDays,
          allowRetroactive: item.allowRetroactive,
          requiresApproval: item.requiresApproval,
          isActive: item.isActive,
        }
      : { ...emptyType, code: generateBusinessCode("NP") },
  );
  const mutation = useMutation({
    mutationFn: () =>
      item ? updateLeaveType(item.id, form) : createLeaveType(form),
    meta: {
      successMessage: item ? "Đã cập nhật loại nghỉ" : "Đã tạo loại nghỉ",
    },
    onSuccess: saved,
  });
  const set = <K extends keyof TypeFormState>(
    key: K,
    value: TypeFormState[K],
  ) => setForm((current) => ({ ...current, [key]: value }));
  const valid =
    form.code.trim().length >= 2 &&
    form.name.trim().length >= 2 &&
    form.hoursPerDay > 0 &&
    (!form.requiresAttachment ||
      form.attachmentRequiredAfter == null ||
      form.attachmentRequiredAfter > 0);
  return (
    <Modal
      title={item ? "Cấu hình loại nghỉ" : "Thêm loại nghỉ"}
      subtitle="Thiết lập cách sử dụng, kiểm soát và quy trình phê duyệt"
      close={close}
      wide
    >
      <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-5">
          <FormSection title="Thông tin nhận diện" icon={FileText}>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="Mã loại nghỉ tự động"
                value={form.code}
                change={() => {}}
                placeholder="Tự động tạo"
                disabled
              />
              <TextField
                label="Tên loại nghỉ"
                value={form.name}
                change={(value) => set("name", value)}
                placeholder="Nghỉ phép năm"
              />
            </div>
            <label className="mt-4 block">
              <FieldLabel>Mô tả</FieldLabel>
              <textarea
                rows={3}
                value={form.description ?? ""}
                onChange={(event) => set("description", event.target.value)}
                className="w-full resize-none border border-line bg-white p-3 text-sm outline-none focus:border-brand"
                placeholder="Điều kiện và mục đích sử dụng loại nghỉ..."
              />
            </label>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label>
                <FieldLabel>Màu trên lịch</FieldLabel>
                <div className="flex h-10 border border-line bg-white">
                  <input
                    type="color"
                    value={form.color}
                    onChange={(event) =>
                      set("color", event.target.value.toUpperCase())
                    }
                    className="h-full w-12 border-0 bg-transparent p-1"
                  />
                  <input
                    value={form.color}
                    onChange={(event) => set("color", event.target.value)}
                    className="min-w-0 flex-1 px-3 font-mono text-xs outline-none"
                  />
                </div>
              </label>
              <SelectField
                label="Hình thức sử dụng"
                value={form.unit}
                change={(value) => set("unit", value as LeaveUnit)}
                options={[
                  ["day", "Theo ngày"],
                  ["hour", "Theo giờ"],
                  ["both", "Theo ngày và giờ"],
                ]}
              />
            </div>
          </FormSection>
          <FormSection title="Quy tắc thời gian" icon={Clock3}>
            <div className="grid gap-4 sm:grid-cols-3">
              <NumberField
                label="Giờ / ngày"
                value={form.hoursPerDay}
                change={(value) => set("hoursPerDay", value)}
                step="0.25"
                min="0.25"
              />
              <SelectField
                label="Bước nghỉ theo giờ"
                value={String(form.hourIncrementMinutes)}
                change={(value) => set("hourIncrementMinutes", Number(value))}
                options={[
                  ["15", "15 phút"],
                  ["30", "30 phút"],
                  ["60", "60 phút"],
                ]}
              />
              <NumberField
                label="Báo trước tối thiểu"
                value={form.minNoticeDays}
                change={(value) => set("minNoticeDays", value)}
                suffix="ngày"
                min="0"
              />
            </div>
          </FormSection>
        </div>
        <div className="space-y-5">
          <FormSection title="Chính sách áp dụng" icon={ShieldCheck}>
            <Toggle
              label="Nghỉ có hưởng lương"
              description="Được chuyển sang bảng công dưới dạng nghỉ có lương."
              checked={form.isPaid}
              change={(value) => set("isPaid", value)}
            />
            <Toggle
              label="Theo dõi số dư"
              description="Yêu cầu phải kiểm tra hạn mức còn khả dụng."
              checked={form.tracksBalance}
              change={(value) =>
                setForm((current) => ({
                  ...current,
                  tracksBalance: value,
                  allowNegativeBalance: value
                    ? current.allowNegativeBalance
                    : false,
                }))
              }
            />
            <Toggle
              label="Cho phép số dư âm"
              description="Chỉ dùng khi doanh nghiệp cho phép ứng trước phép."
              checked={form.allowNegativeBalance}
              disabled={!form.tracksBalance}
              change={(value) => set("allowNegativeBalance", value)}
            />
            <Toggle
              label="Bắt buộc phê duyệt"
              description="Nếu tắt, yêu cầu hợp lệ có thể tự động được duyệt."
              checked={form.requiresApproval}
              change={(value) => set("requiresApproval", value)}
            />
            <details className="border-t border-line pt-3">
              <summary className="cursor-pointer text-xs font-extrabold text-brand">
                Chính sách nâng cao
              </summary>
              <div className="mt-3">
                <Toggle
                  label="Cho phép nghỉ hồi tố"
                  description="Cho phép gửi yêu cầu cho ngày đã qua."
                  checked={form.allowRetroactive}
                  change={(value) => set("allowRetroactive", value)}
                />
                <Toggle
                  label="Yêu cầu tài liệu"
                  description="Bắt buộc hoặc theo ngưỡng thời lượng cấu hình."
                  checked={form.requiresAttachment}
                  change={(value) =>
                    setForm((current) => ({
                      ...current,
                      requiresAttachment: value,
                      attachmentRequiredAfter: value
                        ? current.attachmentRequiredAfter
                        : null,
                    }))
                  }
                />
                {form.requiresAttachment && (
                  <div className="mt-3 border-l-2 border-brand bg-info-soft/50 p-3">
                    <NumberField
                      label="Bắt buộc khi nghỉ từ"
                      value={form.attachmentRequiredAfter ?? 1}
                      change={(value) => set("attachmentRequiredAfter", value)}
                      step="0.5"
                      min="0.5"
                      suffix={form.unit === "hour" ? "giờ" : "ngày"}
                    />
                  </div>
                )}
              </div>
            </details>
            <Toggle
              label="Đang áp dụng"
              description="Ngừng sử dụng sẽ chặn yêu cầu mới nhưng giữ lịch sử."
              checked={form.isActive}
              change={(value) => set("isActive", value)}
            />
          </FormSection>
        </div>
      </div>
      {mutation.isError && <FormError message={mutation.error.message} />}
      <div className="mt-5 flex justify-end gap-2 border-t border-line pt-4">
        <Button variant="outline" disabled={mutation.isPending} onClick={close}>
          Hủy
        </Button>
        <Button
          variant="brand"
          disabled={!valid}
          loading={mutation.isPending}
          loadingText="Đang lưu"
          onClick={() => mutation.mutate()}
        >
          {item ? "Lưu cấu hình" : "Tạo loại nghỉ"}
        </Button>
      </div>
    </Modal>
  );
}

function PolicyModal({
  item,
  close,
  saved,
}: {
  item: LeaveTypeItem;
  close: () => void;
  saved: () => void;
}) {
  const policy = item.currentPolicy ?? item.nextPolicy;
  const [form, setForm] = useState<PolicyFormState>(
    policy
      ? policyToForm(policy)
      : {
          name: `Hạn mức ${item.name} ${new Date().getFullYear()}`,
          effectiveFrom: formatApp(startOfYear(new Date()), "yyyy-MM-dd"),
          effectiveTo: null,
          accrualMethod: "upfront",
          allowanceAmount: 12,
          carryoverLimit: 0,
          maxBalance: 12,
          prorateNewHires: true,
          appliesToEmploymentType: null,
          isActive: true,
        },
  );
  const mutation = useMutation({
    mutationFn: () =>
      policy
        ? updateLeavePolicy(policy.id, form)
        : createLeavePolicy(item.id, form),
    meta: {
      successMessage: policy
        ? "Đã cập nhật hạn mức phép"
        : "Đã tạo hạn mức phép",
    },
    onSuccess: saved,
  });
  const set = <K extends keyof PolicyFormState>(
    key: K,
    value: PolicyFormState[K],
  ) => setForm((current) => ({ ...current, [key]: value }));
  const valid =
    form.name.trim().length >= 3 &&
    Boolean(form.effectiveFrom) &&
    form.allowanceAmount >= 0 &&
    (!form.effectiveTo || form.effectiveTo >= form.effectiveFrom) &&
    (form.maxBalance == null || form.maxBalance >= form.allowanceAmount);
  return (
    <Modal
      title="Cấu hình hạn mức ngày phép"
      subtitle={`${item.name} · ${item.code}`}
      close={close}
    >
      <div className="border border-info/20 bg-info-soft p-4">
        <div className="flex items-start gap-3">
          <div className="grid size-9 shrink-0 place-items-center bg-white text-brand">
            <CalendarClock className="size-4" />
          </div>
          <div>
            <p className="text-sm font-extrabold">
              Chính sách theo khoảng hiệu lực
            </p>
            <p className="mt-1 text-xs leading-5 text-muted">
              Thay đổi ở đây áp dụng cho kỳ tương ứng, không sửa ngược các giao
              dịch số dư đã phát sinh.
            </p>
          </div>
        </div>
      </div>
      <div className="mt-5 space-y-5">
        <FormSection title="Hiệu lực chính sách" icon={CalendarCheck2}>
          <TextField
            label="Tên chính sách"
            value={form.name}
            change={(value) => set("name", value)}
            placeholder="Hạn mức phép năm 2026"
          />
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <DateField
              label="Có hiệu lực từ"
              value={form.effectiveFrom}
              change={(value) => set("effectiveFrom", value)}
            />
            <DateField
              label="Đến ngày (không bắt buộc)"
              value={form.effectiveTo ?? ""}
              min={form.effectiveFrom}
              change={(value) => set("effectiveTo", value || null)}
            />
          </div>
        </FormSection>
        <FormSection title="Hạn mức và tích lũy" icon={SlidersHorizontal}>
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label="Cách cấp phép"
              value={form.accrualMethod}
              change={(value) => set("accrualMethod", value as AccrualMethod)}
              options={[
                ["upfront", "Cấp toàn bộ đầu kỳ"],
                ["monthly", "Cộng dần hàng tháng"],
                ["none", "Chỉ điều chỉnh thủ công"],
              ]}
            />
            <NumberField
              label={`Hạn mức (${amountUnit(item.unit)})`}
              value={form.allowanceAmount}
              change={(value) => set("allowanceAmount", value)}
              min="0"
              step="0.5"
            />
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <NumberField
              label="Chuyển tối đa sang kỳ sau"
              value={form.carryoverLimit ?? 0}
              change={(value) => set("carryoverLimit", value)}
              min="0"
              step="0.5"
            />
            <NumberField
              label="Số dư tối đa"
              value={form.maxBalance ?? form.allowanceAmount}
              change={(value) => set("maxBalance", value)}
              min="0"
              step="0.5"
            />
          </div>
          {form.accrualMethod === "monthly" && (
            <p className="mt-3 border-l-2 border-brand bg-canvas px-3 py-2 text-xs text-muted">
              Dự kiến cộng{" "}
              <b className="font-mono text-ink">
                {(form.allowanceAmount / 12).toFixed(2)}
              </b>{" "}
              {amountUnit(item.unit)} mỗi tháng. Tiến trình cấp phép sẽ làm tròn
              theo chính sách hệ thống.
            </p>
          )}
        </FormSection>
        <FormSection title="Đối tượng áp dụng" icon={UsersRound}>
          <SelectField
            label="Loại nhân viên"
            value={form.appliesToEmploymentType ?? "all"}
            change={(value) =>
              set(
                "appliesToEmploymentType",
                value === "all" ? null : (value as "full_time" | "part_time"),
              )
            }
            options={[
              ["all", "Tất cả nhân viên"],
              ["full_time", "Nhân viên Full-time"],
              ["part_time", "Nhân viên Part-time"],
            ]}
          />
          <div className="mt-3">
            <Toggle
              label="Tính tỷ lệ cho nhân viên vào giữa kỳ"
              description="Hạn mức được chia theo phần thời gian còn lại của chu kỳ."
              checked={form.prorateNewHires}
              change={(value) => set("prorateNewHires", value)}
            />
            <Toggle
              label="Chính sách đang hoạt động"
              description="Chính sách ngừng hoạt động không được dùng để cấp phép."
              checked={form.isActive}
              change={(value) => set("isActive", value)}
            />
          </div>
        </FormSection>
      </div>
      {mutation.isError && <FormError message={mutation.error.message} />}
      <div className="mt-5 flex justify-end gap-2 border-t border-line pt-4">
        <Button variant="outline" disabled={mutation.isPending} onClick={close}>
          Hủy
        </Button>
        <Button
          variant="brand"
          disabled={!valid}
          loading={mutation.isPending}
          loadingText="Đang lưu"
          onClick={() => mutation.mutate()}
        >
          {policy ? "Lưu hạn mức" : "Tạo hạn mức"}
        </Button>
      </div>
    </Modal>
  );
}

function policyToForm(policy: LeaveEntitlementPolicy): PolicyFormState {
  return {
    name: policy.name,
    effectiveFrom: policy.effectiveFrom,
    effectiveTo: policy.effectiveTo,
    accrualMethod: policy.accrualMethod,
    allowanceAmount: policy.allowanceAmount,
    carryoverLimit: policy.carryoverLimit,
    maxBalance: policy.maxBalance,
    prorateNewHires: policy.prorateNewHires,
    appliesToEmploymentType: policy.appliesToEmploymentType,
    isActive: policy.isActive,
  };
}

function Modal({
  title,
  subtitle,
  close,
  children,
  wide,
}: {
  title: string;
  subtitle: string;
  close: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-ink/45 sm:items-center sm:p-5">
      <button aria-label="Đóng" className="absolute inset-0" onClick={close} />
      <section
        className={cn(
          "relative z-10 max-h-[94vh] w-full overflow-y-auto border border-line bg-surface shadow-2xl",
          wide ? "sm:max-w-5xl" : "sm:max-w-2xl",
        )}
      >
        <header className="sticky top-0 z-10 flex items-start justify-between border-b border-line bg-surface p-5">
          <div>
            <h2 className="text-lg font-black">{title}</h2>
            <p className="mt-1 text-xs text-muted">{subtitle}</p>
          </div>
          <button
            onClick={close}
            className="grid size-8 place-items-center text-muted hover:bg-canvas"
          >
            <X className="size-4" />
          </button>
        </header>
        <div className="p-5">{children}</div>
      </section>
    </div>
  );
}
function FormSection({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof FileText;
  children: React.ReactNode;
}) {
  return (
    <section className="border border-line bg-canvas/35">
      <header className="flex items-center gap-2 border-b border-line bg-white px-4 py-3">
        <Icon className="size-4 text-brand" />
        <h3 className="text-xs font-extrabold uppercase tracking-[0.08em]">
          {title}
        </h3>
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}
function Toggle({
  label,
  description,
  checked,
  change,
  disabled,
}: {
  label: string;
  description: string;
  checked: boolean;
  change: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start justify-between gap-4 border-b border-line py-3 last:border-b-0",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      <span>
        <span className="block text-xs font-extrabold">{label}</span>
        <span className="mt-1 block text-[11px] leading-4 text-muted">
          {description}
        </span>
      </span>
      <input
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        disabled={disabled}
        onChange={(event) => change(event.target.checked)}
      />
      <span className="relative mt-0.5 h-5 w-9 shrink-0 bg-line transition peer-checked:bg-brand after:absolute after:left-0.5 after:top-0.5 after:size-4 after:bg-white after:transition-transform peer-checked:after:translate-x-4" />
    </label>
  );
}
function TextField({
  label,
  value,
  change,
  placeholder,
  disabled,
}: {
  label: string;
  value: string;
  change: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <FieldLabel>{label}</FieldLabel>
      <input
        value={value}
        disabled={disabled}
        onChange={(event) => change(event.target.value)}
        placeholder={placeholder}
        className="input disabled:bg-canvas disabled:text-muted"
      />
    </label>
  );
}
function NumberField({
  label,
  value,
  change,
  min,
  step,
  suffix,
}: {
  label: string;
  value: number;
  change: (value: number) => void;
  min?: string;
  step?: string;
  suffix?: string;
}) {
  return (
    <label className="block">
      <FieldLabel>{label}</FieldLabel>
      <div className="relative">
        <input
          type="number"
          value={value}
          min={min}
          step={step}
          onChange={(event) => change(Number(event.target.value))}
          className={cn("input font-mono", suffix && "pr-12")}
        />
        {suffix && (
          <span className="absolute right-3 top-3 text-[10px] font-bold text-muted">
            {suffix}
          </span>
        )}
      </div>
    </label>
  );
}
function DateField({
  label,
  value,
  change,
  min,
}: {
  label: string;
  value: string;
  change: (value: string) => void;
  min?: string;
}) {
  return (
    <label className="block">
      <FieldLabel>{label}</FieldLabel>
      <input
        type="date"
        value={value}
        min={min}
        onChange={(event) => change(event.target.value)}
        className="input"
      />
    </label>
  );
}
function SelectField({
  label,
  value,
  change,
  options,
}: {
  label: string;
  value: string;
  change: (value: string) => void;
  options: Array<[string, string]>;
}) {
  return (
    <label className="block">
      <FieldLabel>{label}</FieldLabel>
      <select
        value={value}
        onChange={(event) => change(event.target.value)}
        className="input"
      >
        {options.map(([optionValue, labelValue]) => (
          <option key={optionValue} value={optionValue}>
            {labelValue}
          </option>
        ))}
      </select>
    </label>
  );
}
function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-2 block text-[10px] font-extrabold uppercase tracking-[0.08em] text-muted">
      {children}
    </span>
  );
}
function Filter({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block bg-surface p-3">
      <span className="mb-1.5 block text-[9px] font-extrabold uppercase tracking-[0.12em] text-muted">
        {label}
      </span>
      {children}
    </label>
  );
}
function MobileLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-1.5 block text-[9px] font-extrabold uppercase text-muted lg:hidden">
      {children}
    </span>
  );
}
function Tag({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "success" | "warning" | "neutral";
}) {
  return (
    <span
      className={cn(
        "inline-flex px-2 py-1 text-[9px] font-extrabold uppercase",
        tone === "success"
          ? "bg-success-soft text-success"
          : tone === "warning"
            ? "bg-warning-soft text-warning-strong"
            : "bg-canvas text-muted",
      )}
    >
      {children}
    </span>
  );
}
function FormError({ message }: { message: string }) {
  return (
    <div className="mt-4 flex items-center gap-2 border border-danger/20 bg-danger-soft p-3 text-xs font-bold text-danger">
      <AlertTriangle className="size-4" />
      {message}
    </div>
  );
}
function Loading() {
  return (
    <div className="grid min-h-72 place-items-center border border-line bg-surface">
      <span className="flex items-center gap-2 text-sm font-bold text-muted">
        <LoaderCircle className="size-5 animate-spin text-brand" />
        Đang tải chính sách nghỉ...
      </span>
    </div>
  );
}
function ErrorState({
  message,
  retry,
}: {
  message: string;
  retry: () => void;
}) {
  return (
    <div className="border border-danger/20 bg-danger-soft p-8 text-center">
      <AlertTriangle className="mx-auto size-5 text-danger" />
      <p className="mt-3 text-sm font-bold text-danger">{message}</p>
      <Button className="mt-4" size="sm" variant="outline" onClick={retry}>
        Thử lại
      </Button>
    </div>
  );
}
function Empty() {
  return (
    <div className="border border-line bg-surface p-14 text-center">
      <CalendarCheck2 className="mx-auto size-7 text-muted" />
      <p className="mt-3 text-sm font-extrabold">Chưa có loại nghỉ phù hợp</p>
      <p className="mt-1 text-xs text-muted">
        Thay đổi bộ lọc hoặc tạo loại nghỉ đầu tiên.
      </p>
    </div>
  );
}
function unitLabel(unit: LeaveUnit) {
  return unit === "day"
    ? "Theo ngày"
    : unit === "hour"
      ? "Theo giờ"
      : "Theo ngày và giờ";
}
function amountUnit(unit: LeaveUnit) {
  return unit === "hour" ? "giờ" : "ngày";
}
function accrualLabel(method: AccrualMethod) {
  return method === "monthly"
    ? "Cộng hàng tháng"
    : method === "upfront"
      ? "Cấp đầu kỳ"
      : "Điều chỉnh thủ công";
}
function dateLabel(value: string) {
  return formatApp(new Date(`${value}T00:00:00`), "dd/MM/yyyy");
}
