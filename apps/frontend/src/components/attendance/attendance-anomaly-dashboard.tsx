"use client";

import { formatApp } from "@/lib/app-timezone";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, subDays } from "date-fns";
import {
  AlertTriangle,
  Ban,
  BarChart3,
  CalendarX2,
  ChevronDown,
  ClockAlert,
  History,
  LoaderCircle,
  MapPinOff,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  TimerOff,
  UserRoundX,
  UsersRound,
  X,
} from "lucide-react";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { formatDurationMinutes } from "@/lib/time-format";
import {
  excludeAttendanceAnomaly,
  getAttendanceAnomalies,
  getAttendanceAnomalyDetail,
  getAttendanceAnomalyOptions,
  getAttendanceAnomalySettings,
  getAttendanceAnomalyStatistics,
  recalculateAllAttendanceAnomalies,
  recalculateAttendanceAnomaly,
  restoreAttendanceAnomaly,
  updateAttendanceAnomalySettings,
  type AttendanceAnomalyDetail,
  type AttendanceAnomalyItem,
  type AttendanceAnomalySettings,
  type AttendanceAnomalyType,
} from "@/lib/attendance-api";
import { cn } from "@/lib/utils";
import { AttendanceSelfie } from "./attendance-selfie";

const EmployeeLocationMap = dynamic(() => import("./employee-location-map"), {
  ssr: false,
  loading: () => (
    <div className="grid min-h-64 place-items-center bg-canvas">
      <LoaderCircle className="size-5 animate-spin text-brand" />
    </div>
  ),
});

const typeMeta: Record<
  AttendanceAnomalyType,
  { label: string; short: string; icon: typeof ClockAlert }
> = {
  late: { label: "Đi muộn", short: "Đi muộn", icon: ClockAlert },
  early_leave: { label: "Về sớm", short: "Về sớm", icon: TimerOff },
  missing_check_in: {
    label: "Thiếu check-in",
    short: "Thiếu vào",
    icon: UserRoundX,
  },
  missing_check_out: {
    label: "Thiếu check-out",
    short: "Thiếu ra",
    icon: TimerOff,
  },
  absence: { label: "Vắng mặt", short: "Vắng mặt", icon: CalendarX2 },
  outside_geofence: {
    label: "Ngoài khu vực",
    short: "Ngoài vùng",
    icon: MapPinOff,
  },
  excessive_break: {
    label: "Nghỉ quá giờ",
    short: "Quá break",
    icon: ClockAlert,
  },
  insufficient_hours: {
    label: "Không đủ giờ làm",
    short: "Thiếu giờ",
    icon: ShieldAlert,
  },
  outside_schedule: {
    label: "Chấm công ngoài lịch",
    short: "Ngoài lịch",
    icon: AlertTriangle,
  },
};

export function AttendanceAnomalyDashboard() {
  const { hasPermission } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const from =
    params.get("anomalyFrom") ?? formatApp(subDays(new Date(), 29), "yyyy-MM-dd");
  const to = params.get("anomalyTo") ?? formatApp(new Date(), "yyyy-MM-dd");
  const type = params.get("anomalyType") ?? "";
  const status = params.get("anomalyStatus") ?? "";
  const severity = params.get("anomalySeverity") ?? "";
  const employeeId = params.get("anomalyEmployee") ?? "";
  const branchId = params.get("anomalyBranch") ?? "";
  const departmentId = params.get("anomalyDepartment") ?? "";
  const search = params.get("anomalySearch") ?? "";
  const page = Number(params.get("anomalyPage") ?? 1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(Boolean(type || status || severity || branchId || departmentId || search));
  const updateQuery = useCallback(
    (updates: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      Object.entries(updates).forEach(([key, value]) =>
        value ? next.set(key, value) : next.delete(key),
      );
      if (!("anomalyPage" in updates)) next.delete("anomalyPage");
      router.replace(`${pathname}?${next}`, { scroll: false });
    },
    [params, pathname, router],
  );
  const filters = {
    from,
    to,
    type: type || undefined,
    status: status || undefined,
    severity: severity || undefined,
    employeeId: employeeId || undefined,
    branchId: branchId || undefined,
    departmentId: departmentId || undefined,
    search: search || undefined,
    page,
    pageSize: 30,
  };
  const overview = useQuery({
    queryKey: ["attendance-anomalies", filters],
    queryFn: () => getAttendanceAnomalies(filters),
    refetchInterval: 60_000,
  });
  const statistics = useQuery({
    queryKey: [
      "attendance-anomaly-statistics",
      { from, to, employeeId, branchId, departmentId },
    ],
    queryFn: () =>
      getAttendanceAnomalyStatistics({
        from,
        to,
        employeeId: employeeId || undefined,
        branchId: branchId || undefined,
        departmentId: departmentId || undefined,
      }),
  });
  const options = useQuery({
    queryKey: ["attendance-anomaly-options"],
    queryFn: getAttendanceAnomalyOptions,
  });
  const queryClient = useQueryClient();
  const recalculateAll = useMutation({
    mutationFn: recalculateAllAttendanceAnomalies,
    meta: { successMessage: "Đã tính lại toàn bộ bất thường chấm công" },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["attendance-anomalies"] }),
  });
  const summary = overview.data?.summary;
  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-brand">
            Kiểm soát sai lệch
          </p>
          <h2 className="mt-2 text-2xl font-black tracking-[-0.04em]">
            Bất thường chấm công
          </h2>
          <p className="mt-2 text-sm text-muted">
            Một nguồn dữ liệu thống nhất cho lịch, chấm công thực tế, GPS, nghỉ
            phép và bảng công.
          </p>
        </div>
        {hasPermission("attendance_anomalies.exclude") && (
          <Button
            variant="outline"
            loading={recalculateAll.isPending}
            loadingText="Đang tính lại"
            onClick={() => recalculateAll.mutate()}
          >
            <RefreshCw className="size-4" />
            Tính lại dữ liệu
          </Button>
        )}
      </div>
      <section className="grid grid-cols-2 gap-px border border-line bg-line [&>*:last-child]:col-span-2 xl:grid-cols-5 xl:[&>*:last-child]:col-span-1">
        <Metric
          icon={AlertTriangle}
          label="Đang hiệu lực"
          value={summary?.totalActive ?? 0}
          note={`${summary?.provisional ?? 0} đang theo dõi`}
          warning
        />
        <Metric
          icon={UsersRound}
          label="Nhân viên ảnh hưởng"
          value={summary?.affectedEmployees ?? 0}
          note="Không đếm trùng nhân viên"
        />
        <Metric
          icon={ClockAlert}
          label="Phút ảnh hưởng"
          value={formatDurationMinutes(summary?.minutesAffected ?? 0)}
          note="Không dùng trực tiếp để trừ lương"
        />
        <Metric
          icon={CalendarX2}
          label="Vắng mặt"
          value={summary?.types.absence ?? 0}
          note={`Tỷ lệ ${statistics.data?.absenceRate ?? 0}%`}
          danger={(summary?.types.absence ?? 0) > 0}
        />
        <Metric
          icon={ShieldAlert}
          label="Nghiêm trọng"
          value={summary?.critical ?? 0}
          note="Cần ưu tiên kiểm tra"
          danger={(summary?.critical ?? 0) > 0}
        />
      </section>
      <section className="border border-line bg-white">
        <div className="grid gap-px bg-line sm:grid-cols-[1fr_1fr_auto]">
          <Filter label="Từ ngày">
            <input
              type="date"
              value={from}
              onChange={(event) =>
                updateQuery({ anomalyFrom: event.target.value })
              }
              className="input border-0"
            />
          </Filter>
          <Filter label="Đến ngày">
            <input
              type="date"
              min={from}
              value={to}
              onChange={(event) =>
                updateQuery({ anomalyTo: event.target.value })
              }
              className="input border-0"
            />
          </Filter>
          <button onClick={() => setFiltersOpen((value) => !value)} className="flex min-h-14 items-center justify-center gap-2 bg-white px-4 text-sm font-bold text-muted hover:text-ink"><SlidersHorizontal className="size-4" />Bộ lọc{[type,status,severity,branchId,departmentId,search].filter(Boolean).length > 0 && <span className="grid size-5 place-items-center bg-brand text-[10px] text-white">{[type,status,severity,branchId,departmentId,search].filter(Boolean).length}</span>}<ChevronDown className={cn('size-3.5 transition', filtersOpen && 'rotate-180')} /></button>
        </div>
        {filtersOpen && <div className="grid gap-px border-t border-line bg-line sm:grid-cols-2 xl:grid-cols-3">
          <Filter label="Loại">
            <select
              value={type}
              onChange={(event) =>
                updateQuery({ anomalyType: event.target.value })
              }
              className="input border-0"
            >
              <option value="">Tất cả bất thường</option>
              {Object.entries(typeMeta).map(([key, meta]) => (
                <option key={key} value={key}>
                  {meta.label}
                </option>
              ))}
            </select>
          </Filter>
          <Filter label="Trạng thái">
            <select
              value={status}
              onChange={(event) =>
                updateQuery({ anomalyStatus: event.target.value })
              }
              className="input border-0"
            >
              <option value="">Đang hiệu lực + tạm thời</option>
              <option value="active">Đã xác nhận</option>
              <option value="provisional">Đang theo dõi</option>
              <option value="cleared">Đã hết hiệu lực</option>
              <option value="excluded">Đã loại ngoại lệ</option>
            </select>
          </Filter>
          <Filter label="Mức độ">
            <select
              value={severity}
              onChange={(event) =>
                updateQuery({ anomalySeverity: event.target.value })
              }
              className="input border-0"
            >
              <option value="">Tất cả mức độ</option>
              <option value="info">Thông tin</option>
              <option value="warning">Cảnh báo</option>
              <option value="critical">Nghiêm trọng</option>
            </select>
          </Filter>
          <Filter label="Chi nhánh">
            <select
              value={branchId}
              onChange={(event) =>
                updateQuery({ anomalyBranch: event.target.value })
              }
              className="input border-0"
            >
              <option value="">Tất cả chi nhánh</option>
              {options.data?.branches.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </Filter>
          <Filter label="Phòng ban">
            <select
              value={departmentId}
              onChange={(event) =>
                updateQuery({ anomalyDepartment: event.target.value })
              }
              className="input border-0"
            >
              <option value="">Tất cả phòng ban</option>
              {options.data?.departments.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </Filter>
          <Filter label="Tìm nhân viên">
            <div className="relative">
              <Search className="absolute left-3 top-3 size-4 text-muted" />
              <input
                value={search}
                onChange={(event) =>
                  updateQuery({ anomalySearch: event.target.value })
                }
                className="input border-0 pl-9"
                placeholder="Tên hoặc mã..."
              />
            </div>
          </Filter>
        </div>}
      </section>
      <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_310px]">
        <AnomalyTable
          loading={overview.isLoading}
          error={overview.error?.message}
          items={overview.data?.items ?? []}
          select={setSelectedId}
        />
        <div className="hidden 2xl:block"><StatisticsPanel data={statistics.data} /></div>
      </div>
      <details className="border border-line bg-white 2xl:hidden"><summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-extrabold [&::-webkit-details-marker]:hidden"><span className="flex items-center gap-2"><BarChart3 className="size-4 text-brand" />Xem cơ cấu bất thường</span><ChevronDown className="size-4 text-muted" /></summary><div className="border-t border-line"><StatisticsPanel data={statistics.data} embedded /></div></details>
      {overview.data && overview.data.pagination.pages > 1 && (
        <div className="flex items-center justify-between border border-line bg-white px-4 py-3 text-xs">
          <span className="text-muted">
            Trang {overview.data.pagination.page}/
            {overview.data.pagination.pages} · {overview.data.pagination.total}{" "}
            kết quả
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1}
              onClick={() => updateQuery({ anomalyPage: String(page - 1) })}
            >
              Trước
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= overview.data.pagination.pages}
              onClick={() => updateQuery({ anomalyPage: String(page + 1) })}
            >
              Sau
            </Button>
          </div>
        </div>
      )}
      {selectedId && (
        <AnomalyDetailDrawer
          id={selectedId}
          close={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}

export function AttendanceAnomalySettingsPanel() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["attendance-anomaly-settings"],
    queryFn: getAttendanceAnomalySettings,
  });
  const [form, setForm] = useState<Omit<
    AttendanceAnomalySettings,
    "id"
  > | null>(null);
  useEffect(() => {
    if (query.data) {
      const { id: _id, ...values } = query.data;
      setForm(values);
    }
  }, [query.data]);
  const mutation = useMutation({
    mutationFn: () => updateAttendanceAnomalySettings(form!),
    meta: { successMessage: "Đã lưu quy tắc phát hiện bất thường" },
    onSuccess: (data) => {
      queryClient.setQueryData(["attendance-anomaly-settings"], data);
    },
  });
  if (query.isLoading || !form)
    return (
      <div className="grid min-h-52 place-items-center">
        <LoaderCircle className="size-5 animate-spin text-brand" />
      </div>
    );
  const field = (key: keyof typeof form, value: number) =>
    setForm((current) => (current ? { ...current, [key]: value } : current));
  const fields = [
    ["lateGraceMinutes", "Cho phép đi muộn", "phút"],
    ["earlyLeaveGraceMinutes", "Cho phép về sớm", "phút"],
    ["insufficientToleranceMinutes", "Dung sai thiếu giờ", "phút"],
    ["missingCheckInReminderMinutes", "Nhắc chưa check-in sau", "phút"],
    ["maxLocationAccuracyM", "Sai số GPS tối đa", "mét"],
    ["lateCriticalMinutes", "Đi muộn nghiêm trọng từ", "phút"],
    ["earlyLeaveCriticalMinutes", "Về sớm nghiêm trọng từ", "phút"],
    ["breakCriticalMinutes", "Vượt break nghiêm trọng từ", "phút"],
    ["insufficientCriticalMinutes", "Thiếu giờ nghiêm trọng từ", "phút"],
  ] as Array<[keyof typeof form, string, string]>;
  const renderFields = (items: typeof fields) => (
    <div className="grid gap-px bg-line sm:grid-cols-2 xl:grid-cols-3">
      {items.map(([key, label, unit]) => (
        <label key={key} className="bg-white p-4">
          <span className="text-[10px] font-extrabold uppercase text-muted">
            {label}
          </span>
          <div className="mt-2 flex items-center border border-line">
            <input
              type="number"
              min="0"
              value={form[key]}
              onChange={(event) => field(key, Number(event.target.value))}
              className="min-w-0 flex-1 px-3 py-2 font-mono text-sm outline-none"
            />
            <span className="border-l border-line px-3 text-xs text-muted">
              {unit}
            </span>
          </div>
        </label>
      ))}
    </div>
  );
  return (
    <section className="border border-line bg-white">
      <header className="flex flex-col gap-3 border-b border-line p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-extrabold">Quy tắc phát hiện bất thường</p>
          <p className="mt-1 text-xs text-muted">
            Mặc định tiêu chuẩn phù hợp với phần lớn doanh nghiệp.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            setForm({
              ...form,
              lateGraceMinutes: 15,
              earlyLeaveGraceMinutes: 15,
              insufficientToleranceMinutes: 15,
              missingCheckInReminderMinutes: 15,
              maxLocationAccuracyM: 100,
              lateCriticalMinutes: 60,
              earlyLeaveCriticalMinutes: 60,
              breakCriticalMinutes: 30,
              insufficientCriticalMinutes: 60,
            })
          }
        >
          Dùng mức tiêu chuẩn
        </Button>
      </header>
      {renderFields(fields.slice(0, 4))}
      <details className="border-t border-line">
        <summary className="cursor-pointer p-4 text-xs font-extrabold text-brand">
          Cấu hình nâng cao
        </summary>
        {renderFields(fields.slice(4))}
      </details>
      <footer className="flex justify-end border-t border-line p-4">
        <Button
          variant="brand"
          loading={mutation.isPending}
          disabled={Object.values(form).some(
            (value) => !Number.isFinite(value) || value < 0,
          )}
          onClick={() => mutation.mutate()}
        >
          Lưu quy tắc
        </Button>
      </footer>
    </section>
  );
}

function AnomalyTable({
  loading,
  error,
  items,
  select,
}: {
  loading: boolean;
  error?: string;
  items: AttendanceAnomalyItem[];
  select: (id: string) => void;
}) {
  if (loading)
    return (
      <div className="grid min-h-96 place-items-center border border-line bg-white">
        <LoaderCircle className="size-6 animate-spin text-brand" />
      </div>
    );
  if (error)
    return (
      <div className="border border-danger/20 bg-danger-soft p-5 text-sm font-bold text-danger">
        {error}
      </div>
    );
  if (!items.length)
    return (
      <div className="grid min-h-80 place-items-center border border-line bg-white text-center">
        <div>
          <ShieldAlert className="mx-auto size-7 text-success" />
          <p className="mt-3 text-sm font-extrabold">
            Không có bất thường phù hợp
          </p>
          <p className="mt-1 text-xs text-muted">
            Thử thay đổi khoảng ngày hoặc bộ lọc.
          </p>
        </div>
      </div>
    );
  return (
    <section className="overflow-hidden border border-line bg-white">
      <div className="hidden grid-cols-[minmax(220px,1.4fr)_150px_130px_110px_110px] gap-4 border-b border-line bg-canvas/70 px-5 py-3 text-[10px] font-extrabold uppercase text-muted lg:grid">
        <span>Nhân viên</span>
        <span>Bất thường</span>
        <span>Thời gian</span>
        <span className="text-right">Ảnh hưởng</span>
        <span className="text-right">Trạng thái</span>
      </div>
      <div className="divide-y divide-line">
        {items.map((item) => {
          const meta = typeMeta[item.type];
          const Icon = meta.icon;
          return (
            <button
              key={item.id}
              onClick={() => select(item.id)}
              className="grid w-full gap-3 p-4 text-left hover:bg-canvas/50 sm:px-5 lg:grid-cols-[minmax(220px,1.4fr)_150px_130px_110px_110px] lg:items-center"
            >
              <div>
                <p className="text-sm font-extrabold">
                  {item.employee.fullName}
                </p>
                <p className="mt-1 text-[11px] text-muted">
                  {item.employee.employeeCode} · {item.employee.department.name}{" "}
                  · {item.employee.branch.name}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Icon
                  className={cn(
                    "size-4",
                    item.severity === "critical"
                      ? "text-danger"
                      : item.severity === "warning"
                        ? "text-warning-strong"
                        : "text-brand",
                  )}
                />
                <div>
                  <p className="text-xs font-extrabold">{meta.label}</p>
                  <p className="mt-1 text-[10px] text-muted">
                    {item.shift?.name ?? "Không có ca"}
                  </p>
                </div>
              </div>
              <div>
                <p className="font-mono text-xs font-bold">
                  {formatDate(item.date)}
                </p>
                <p className="mt-1 text-[10px] text-muted">{timeRange(item)}</p>
              </div>
              <div className="flex justify-between lg:block lg:text-right">
                <span className="text-[9px] font-bold uppercase text-muted lg:hidden">
                  Ảnh hưởng
                </span>
                <span className="font-mono text-xs font-extrabold">
                  {item.minutesAffected
                    ? formatDurationMinutes(item.minutesAffected)
                    : "Theo sự kiện"}
                </span>
              </div>
              <div className="lg:text-right">
                <Status value={item.status} severity={item.severity} />
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function StatisticsPanel({
  data,
  embedded,
}: {
  data?: Awaited<ReturnType<typeof getAttendanceAnomalyStatistics>>;
  embedded?: boolean;
}) {
  const max = Math.max(...(data?.byType.map((item) => item.count) ?? [1]), 1);
  return (
    <aside className={cn("bg-white", !embedded && "border border-line")}>
      <header className="border-b border-line p-4">
        <div className="flex items-center gap-2">
          <BarChart3 className="size-4 text-brand" />
          <p className="text-sm font-extrabold">Cơ cấu bất thường</p>
        </div>
        <p className="mt-1 text-[10px] text-muted">
          {data?.scheduledShifts ?? 0} ca dự kiến trong kỳ
        </p>
      </header>
      <div className="space-y-4 p-4">
        {data?.byType.length ? (
          data.byType.map((item) => (
            <div key={item.type}>
              <div className="flex justify-between gap-3 text-xs">
                <span className="font-bold">{typeMeta[item.type].short}</span>
                <b className="font-mono">{item.count}</b>
              </div>
              <div className="mt-2 h-1.5 bg-line">
                <div
                  className="h-full bg-brand"
                  style={{ width: `${Math.max((item.count / max) * 100, 4)}%` }}
                />
              </div>
              <p className="mt-1 text-[10px] text-muted">
                {item.employees} nhân viên ·{" "}
                {formatDurationMinutes(item.minutes)}
              </p>
            </div>
          ))
        ) : (
          <p className="py-10 text-center text-xs text-muted">
            Chưa có số liệu
          </p>
        )}
      </div>
    </aside>
  );
}

function AnomalyDetailDrawer({ id, close }: { id: string; close: () => void }) {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["attendance-anomaly-detail", id],
    queryFn: () => getAttendanceAnomalyDetail(id),
  });
  const [reason, setReason] = useState("");
  const [confirmExclude, setConfirmExclude] = useState(false);
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["attendance-anomalies"] });
    queryClient.invalidateQueries({
      queryKey: ["attendance-anomaly-statistics"],
    });
    query.refetch();
  };
  const exclude = useMutation({
    mutationFn: () => excludeAttendanceAnomaly(id, reason),
    meta: { successMessage: "Đã bỏ bản ghi khỏi thống kê" },
    onSuccess: () => {
      setConfirmExclude(false);
      setReason("");
      refresh();
    },
  });
  const restore = useMutation({
    mutationFn: () => restoreAttendanceAnomaly(id),
    meta: { successMessage: "Đã khôi phục bất thường" },
    onSuccess: refresh,
  });
  const recalculate = useMutation({
    mutationFn: () => recalculateAttendanceAnomaly(id),
    meta: { successMessage: "Đã tính lại bất thường" },
    onSuccess: refresh,
  });
  const item = query.data;
  return (
    <div className="fixed inset-0 z-[100] flex justify-end bg-ink/45">
      <button className="absolute inset-0" onClick={close} />
      <section className="relative z-10 h-full w-full overflow-y-auto border-l border-line bg-white shadow-2xl sm:max-w-2xl">
        <header className="sticky top-0 z-20 flex items-start justify-between border-b border-line bg-white p-5">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-wide text-brand">
              Chi tiết cách tính
            </p>
            <h3 className="mt-2 text-lg font-black">
              {item ? typeMeta[item.type].label : "Đang tải..."}
            </h3>
            {item && (
              <p className="mt-1 text-xs text-muted">
                {item.employee.fullName} · {formatDate(item.date)} ·{" "}
                {item.shift?.name ?? "Ngoài lịch"}
              </p>
            )}
          </div>
          <button
            onClick={close}
            className="grid size-8 place-items-center hover:bg-canvas"
          >
            <X className="size-4" />
          </button>
        </header>
        {query.isLoading ? (
          <div className="grid min-h-96 place-items-center">
            <LoaderCircle className="size-6 animate-spin text-brand" />
          </div>
        ) : item ? (
          <div className="space-y-5 p-5">
            <section className="grid gap-px border border-line bg-line sm:grid-cols-3">
              <DetailMetric label="Trạng thái">
                <Status value={item.status} severity={item.severity} />
              </DetailMetric>
              <DetailMetric label="Mức độ">
                <span className="font-bold">
                  {severityLabel(item.severity)}
                </span>
              </DetailMetric>
              <DetailMetric label="Ảnh hưởng">
                <span className="font-mono font-bold">
                  {formatDurationMinutes(item.minutesAffected)}
                </span>
              </DetailMetric>
            </section>
            <section className="border border-line bg-canvas/40 p-4">
              <p className="text-xs font-extrabold">Kết luận</p>
              <p className="mt-2 text-sm leading-6">{item.details}</p>
            </section>
            <Timeline item={item} />
            <Calculation data={item.calculation} grace={item.graceMinutes} />
            {locationView(item)}
            <Evidence events={item.events} />
            <HistoryPanel items={item.history} />
            {item.status === "excluded" && (
              <div className="border border-warning/30 bg-warning-soft p-4 text-xs">
                <b>Đã loại ngoại lệ:</b> {item.exclusion.reason}
                <br />
                <span className="text-muted">
                  {item.exclusion.by} ·{" "}
                  {item.exclusion.at
                    ? formatApp(new Date(item.exclusion.at), "dd/MM/yyyy HH:mm")
                    : ""}
                </span>
              </div>
            )}
            {hasPermission("attendance_anomalies.exclude") && (
              <footer className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
                <Button
                  variant="outline"
                  loading={recalculate.isPending}
                  onClick={() => recalculate.mutate()}
                >
                  <RefreshCw className="size-4" />
                  Cập nhật kết quả
                </Button>
                {item.status === "excluded" ? (
                  <Button
                    variant="brand"
                    loading={restore.isPending}
                    onClick={() => restore.mutate()}
                  >
                    <RotateCcw className="size-4" />
                    Khôi phục
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    onClick={() => setConfirmExclude(true)}
                  >
                    <Ban className="size-4" />
                    Không tính thống kê
                  </Button>
                )}
              </footer>
            )}
            {confirmExclude && (
              <div className="border border-warning/30 bg-warning-soft p-4">
                <p className="text-xs font-extrabold">
                  Lý do không tính vào thống kê
                </p>
                <textarea
                  rows={3}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  className="mt-3 w-full border border-line bg-white p-3 text-sm outline-none focus:border-brand"
                  placeholder="Nhập lý do..."
                />
                <div className="mt-3 flex justify-end gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setConfirmExclude(false)}
                  >
                    Hủy
                  </Button>
                  <Button
                    size="sm"
                    variant="brand"
                    disabled={reason.trim().length < 5}
                    loading={exclude.isPending}
                    onClick={() => exclude.mutate()}
                  >
                    Xác nhận
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="m-5 border border-danger/20 bg-danger-soft p-4 text-sm font-bold text-danger">
            {query.error?.message ?? "Không tải được chi tiết"}
          </div>
        )}
      </section>
    </div>
  );
}

function Timeline({ item }: { item: AttendanceAnomalyDetail }) {
  const points = [
    { label: "Bắt đầu ca", value: item.scheduledStartAt },
    { label: "Check-in", value: item.actualStartAt },
    { label: "Check-out", value: item.actualEndAt },
    { label: "Kết thúc ca", value: item.scheduledEndAt },
  ];
  return (
    <section>
      <p className="text-xs font-extrabold">Timeline dự kiến / thực tế</p>
      <div className="mt-3 grid gap-px border border-line bg-line sm:grid-cols-4">
        {points.map((point) => (
          <div key={point.label} className="bg-white p-3">
            <p className="text-[9px] font-bold uppercase text-muted">
              {point.label}
            </p>
            <p className="mt-2 font-mono text-xs font-extrabold">
              {point.value
                ? formatApp(new Date(point.value), "dd/MM HH:mm")
                : "--"}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
function Calculation({
  data,
  grace,
}: {
  data: Record<string, unknown>;
  grace: number;
}) {
  const labels: Record<string, string> = {
    scheduledStartAt: "Giờ bắt đầu ca",
    scheduledEndAt: "Giờ kết thúc ca",
    actualCheckInAt: "Giờ check-in",
    actualCheckOutAt: "Giờ check-out",
    lateMinutes: "Thời gian đi muộn",
    earlyMinutes: "Thời gian về sớm",
    missingMinutes: "Thời gian còn thiếu",
    breakMinutes: "Thời gian nghỉ",
    allowedMinutes: "Thời gian nghỉ cho phép",
    actualMinutes: "Thời gian nghỉ thực tế",
    minutesOver: "Thời gian nghỉ vượt mức",
    workedMinutes: "Thời gian làm thực tế",
    expectedMinutes: "Thời gian cần làm",
    scheduledMinutes: "Thời gian dự kiến",
    approvedLeaveMinutes: "Thời gian nghỉ đã duyệt",
    graceMinutes: "Mốc cho phép",
    exceededGraceMinutes: "Thời gian vượt mốc",
    maxDistanceM: "Khoảng cách xa nhất",
    radiusM: "Bán kính cho phép",
    rejectedAttempts: "Số lần bị từ chối",
  };
  const rows = Object.entries({ ...data, graceMinutes: grace }).filter(
    ([key]) => labels[key],
  );
  return (
    <section>
      <p className="text-xs font-extrabold">Cách xác định</p>
      <div className="mt-3 divide-y divide-line border border-line">
        {rows.map(
          ([key, value]) => (
            <div
              key={key}
              className="grid grid-cols-[minmax(130px,.75fr)_1.25fr] gap-3 px-3 py-2 text-xs"
            >
              <span className="text-muted">{labels[key]}</span>
              <span className="break-all text-right font-mono font-semibold">
                {formatCalculationValue(key, value)}
              </span>
            </div>
          ),
        )}
      </div>
    </section>
  );
}
function Evidence({ events }: { events: AttendanceAnomalyDetail["events"] }) {
  if (!events.length) return null;
  return (
    <section>
      <p className="text-xs font-extrabold">Bằng chứng sự kiện</p>
      <div className="mt-3 space-y-2">
        {events.map((event) => (
          <div
            key={event.id}
            className={cn(
              "grid gap-3 border p-3 sm:grid-cols-[1fr_auto] sm:items-center",
              event.rejected
                ? "border-danger/25 bg-danger-soft"
                : "border-line",
            )}
          >
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-extrabold">
                  {eventLabel(event.type)} ·{" "}
                  {formatApp(new Date(event.occurredAt), "HH:mm:ss dd/MM/yyyy")}
                </p>
                {event.rejected && (
                  <span className="bg-danger px-2 py-0.5 text-[9px] font-black uppercase text-white">
                    Đã chặn
                  </span>
                )}
              </div>
              <p className="mt-1 text-[10px] text-muted">
                {event.method === "web" ? "Trình duyệt" : "Điện thoại"} ·{" "}
                {event.latitude == null || event.longitude == null
                  ? "Không có tọa độ"
                  : event.distanceM == null
                    ? `Có GPS${event.accuracyM == null ? "" : ` · chính xác ±${Math.round(event.accuracyM)}m`}`
                    : `${Math.round(event.distanceM)}m từ chi nhánh`}{" "}
                {event.withinGeofence === false ? "· Ngoài vùng" : ""}
              </p>
              {event.rejectionReason && (
                <p className="mt-1 text-[10px] font-semibold text-danger">
                  {event.rejectionReason}
                </p>
              )}
            </div>
            {event.photoUrl && (
              <AttendanceSelfie
                path={event.photoUrl}
                alt="Selfie chấm công"
                className="h-16 w-20"
              />
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
function HistoryPanel({
  items,
}: {
  items: AttendanceAnomalyDetail["history"];
}) {
  return (
    <section>
      <p className="flex items-center gap-2 text-xs font-extrabold">
        <History className="size-4 text-brand" />
        Lịch sử bất thường
      </p>
      <div className="mt-3 border-l-2 border-line pl-4">
        {items.map((item) => (
          <div
            key={item.id}
            className="relative pb-4 before:absolute before:-left-[21px] before:top-1 before:size-2 before:bg-brand"
          >
            <p className="text-xs font-extrabold">
              {historyLabel(item.eventType)}
            </p>
            <p className="mt-1 text-[10px] text-muted">
              {item.actor} ·{" "}
              {formatApp(new Date(item.createdAt), "dd/MM/yyyy HH:mm:ss")}
            </p>
            {item.reason && <p className="mt-1 text-xs">{item.reason}</p>}
          </div>
        ))}
      </div>
    </section>
  );
}
function locationView(item: AttendanceAnomalyDetail) {
  const event = item.events.find(
    (value) => value.latitude !== null && value.longitude !== null,
  );
  if (
    !event ||
    item.geofence?.latitude == null ||
    item.geofence.longitude == null
  )
    return null;
  return (
    <section>
      <p className="text-xs font-extrabold">Đối chiếu vị trí</p>
      <div className="mt-3 h-72 overflow-hidden border border-line">
        <EmployeeLocationMap
          branchLatitude={item.geofence.latitude}
          branchLongitude={item.geofence.longitude}
          radiusM={item.geofence.radiusM}
          employeeLatitude={event.latitude!}
          employeeLongitude={event.longitude!}
          accuracyM={event.accuracyM ?? 1}
          withinGeofence={Boolean(event.withinGeofence)}
        />
      </div>
    </section>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  note,
  warning,
  danger,
}: {
  icon: typeof AlertTriangle;
  label: string;
  value: string | number;
  note: string;
  warning?: boolean;
  danger?: boolean;
}) {
  return (
    <div className="min-w-0 bg-white p-3 sm:p-4">
      <Icon
        className={cn(
          "size-4",
          danger
            ? "text-danger"
            : warning
              ? "text-warning-strong"
              : "text-brand",
        )}
      />
      <p className="mt-3 truncate text-[9px] font-extrabold uppercase text-muted sm:text-[10px]">
        {label}
      </p>
      <p className="mt-1 truncate font-mono text-lg font-black sm:text-xl">{value}</p>
      <p className="mt-1 truncate text-[9px] text-muted sm:text-[10px]">{note}</p>
    </div>
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
    <label className="bg-white p-3">
      <span className="mb-1.5 block text-[9px] font-extrabold uppercase text-muted">
        {label}
      </span>
      {children}
    </label>
  );
}
function DetailMetric({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white p-3">
      <p className="text-[9px] font-bold uppercase text-muted">{label}</p>
      <div className="mt-2 text-xs">{children}</div>
    </div>
  );
}
function Status({ value, severity }: { value: string; severity: string }) {
  const labels: Record<string, string> = {
    provisional: "Đang theo dõi",
    active: "Đã xác nhận",
    cleared: "Hết hiệu lực",
    excluded: "Đã loại",
  };
  return (
    <span
      className={cn(
        "inline-flex px-2 py-1 text-[9px] font-extrabold uppercase",
        value === "provisional"
          ? "bg-info-soft text-brand"
          : value === "cleared"
            ? "bg-canvas text-muted"
            : value === "excluded"
              ? "bg-warning-soft text-warning-strong"
              : severity === "critical"
                ? "bg-danger-soft text-danger"
                : "bg-warning-soft text-warning-strong",
      )}
    >
      {labels[value] ?? value}
    </span>
  );
}
function severityLabel(value: string) {
  return value === "critical"
    ? "Nghiêm trọng"
    : value === "warning"
      ? "Cảnh báo"
      : "Thông tin";
}
function timeRange(item: AttendanceAnomalyItem) {
  if (item.actualStartAt || item.actualEndAt)
    return `${item.actualStartAt ? formatApp(new Date(item.actualStartAt), "HH:mm") : "--:--"} → ${item.actualEndAt ? formatApp(new Date(item.actualEndAt), "HH:mm") : "--:--"}`;
  return item.scheduledStartAt
    ? formatApp(new Date(item.scheduledStartAt), "HH:mm")
    : "--:--";
}
function formatDate(value: string) {
  return formatApp(new Date(`${value}T12:00:00`), "dd/MM/yyyy");
}
function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "--";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value))
    return formatApp(new Date(value), "dd/MM/yyyy HH:mm:ss");
  return String(value);
}
function formatCalculationValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return "--";
  if (key.endsWith("Minutes") && typeof value === "number")
    return formatDurationMinutes(value);
  if (key.endsWith("At") && typeof value === "string")
    return formatApp(new Date(value), "dd/MM/yyyy HH:mm:ss");
  if (key.endsWith("DistanceM") || key === "radiusM") return `${value}m`;
  return formatValue(value);
}
function eventLabel(value: string) {
  return (
    (
      {
        check_in: "Check-in",
        check_out: "Check-out",
        break_start: "Bắt đầu nghỉ",
        break_end: "Kết thúc nghỉ",
      } as Record<string, string>
    )[value] ?? value
  );
}
function historyLabel(value: string) {
  return (
    (
      {
        detected: "Phát hiện lần đầu",
        recalculated: "Cập nhật kết quả",
        cleared: "Tự hết hiệu lực",
        excluded: "Loại ngoại lệ",
        restored: "Khôi phục bất thường",
      } as Record<string, string>
    )[value] ?? value
  );
}
