"use client";

import { formatApp } from "@/lib/app-timezone";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  endOfMonth,
  format,
  startOfMonth,
  startOfWeek,
  subDays,
} from "date-fns";
import { vi } from "date-fns/locale";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  Coffee,
  Download,
  FileClock,
  LockKeyhole,
  LoaderCircle,
  Pencil,
  RefreshCw,
  RotateCcw,
  Scale,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  TimerReset,
  UnlockKeyhole,
  UsersRound,
  X,
} from "lucide-react";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth/auth-provider";
import { cn } from "@/lib/utils";
import { formatDurationMinutes } from "@/lib/time-format";
import {
  actOnTimesheet,
  adjustTimesheet,
  exportTimesheets,
  generateTimesheets,
  getTimesheetHistory,
  getTimesheetReport,
  type TimesheetAggregate,
  type TimesheetDimension,
  type TimesheetEntry,
  type TimesheetHistoryItem,
  type TimesheetReport,
  type TimesheetTotals,
} from "@/lib/timesheets-api";

type MainView =
  | "employees"
  | "comparison"
  | "breaks"
  | "overtime"
  | "time"
  | "departments"
  | "branches"
  | "shifts";
type TimeView = "day" | "week" | "month";
type TimesheetItem = TimesheetReport["timesheets"][number];
type WorkflowAction = "approve" | "return" | "lock" | "unlock";

const today = new Date();
const defaultFrom = formatApp(startOfMonth(today), "yyyy-MM-dd");
const defaultTo = formatApp(today, "yyyy-MM-dd");

export function TimesheetDashboard() {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const from = searchParams.get("from") || defaultFrom;
  const to = searchParams.get("to") || defaultTo;
  const branchId = searchParams.get("branchId") || "";
  const departmentId = searchParams.get("departmentId") || "";
  const search = searchParams.get("search") || "";
  const [filtersOpen, setFiltersOpen] = useState(Boolean(branchId || departmentId || search));
  const [view, setView] = useState<MainView>("employees");
  const [timeView, setTimeView] = useState<TimeView>("day");
  const [adjusting, setAdjusting] = useState<{
    timesheet: TimesheetItem;
    entry: TimesheetEntry;
  } | null>(null);
  const [workflow, setWorkflow] = useState<{
    timesheet: TimesheetItem;
    action: WorkflowAction;
  } | null>(null);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const deferredSearch = useDeferredValue(search.trim());
  const report = useQuery({
    queryKey: ["timesheets", from, to, branchId, departmentId, deferredSearch],
    queryFn: () =>
      getTimesheetReport({
        from,
        to,
        branchId: branchId || undefined,
        departmentId: departmentId || undefined,
        search: deferredSearch || undefined,
      }),
  });
  const data = report.data;
  const filters = {
    from,
    to,
    branchId: branchId || undefined,
    departmentId: departmentId || undefined,
    search: deferredSearch || undefined,
  };
  const generate = useMutation({
    mutationFn: () =>
      generateTimesheets({
        from,
        to,
        branchId: branchId || undefined,
        departmentId: departmentId || undefined,
      }),
    meta: { successMessage: "Đã tạo bảng công nháp" },
    onSuccess: (result) =>
      queryClient.setQueryData(
        ["timesheets", from, to, branchId, departmentId, deferredSearch],
        result,
      ),
  });
  const exporting = useMutation({
    mutationFn: () => exportTimesheets(filters),
    meta: { successMessage: "Đã xuất bảng công CSV" },
  });

  const updateFilterQuery = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      Object.entries(updates).forEach(([key, value]) => {
        if (value) params.set(key, value);
        else params.delete(key);
      });
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      });
    },
    [pathname, router, searchParams],
  );

  useEffect(() => {
    const missingDefaults: Record<string, string> = {};
    if (!searchParams.get("from")) missingDefaults.from = defaultFrom;
    if (!searchParams.get("to")) missingDefaults.to = defaultTo;
    if (Object.keys(missingDefaults).length) updateFilterQuery(missingDefaults);
  }, [searchParams, updateFilterQuery]);

  const setPreset = (preset: "week" | "month" | "previous-month") => {
    const now = new Date();
    if (preset === "week") {
      updateFilterQuery({
        from: formatApp(startOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd"),
        to: formatApp(now, "yyyy-MM-dd"),
      });
    } else if (preset === "month") {
      updateFilterQuery({
        from: formatApp(startOfMonth(now), "yyyy-MM-dd"),
        to: formatApp(now, "yyyy-MM-dd"),
      });
    } else {
      const previous = subDays(startOfMonth(now), 1);
      updateFilterQuery({
        from: formatApp(startOfMonth(previous), "yyyy-MM-dd"),
        to: formatApp(endOfMonth(previous), "yyyy-MM-dd"),
      });
    }
  };

  const timeRows =
    timeView === "day"
      ? data?.byDay
      : timeView === "week"
        ? data?.byWeek
        : data?.byMonth;
  const maxRegular = useMemo(
    () => Math.max(1, ...(timeRows ?? []).map((item) => item.regularMinutes)),
    [timeRows],
  );

  return (
    <div className="w-full min-w-0 space-y-5">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-brand">
            Quản lý bảng công
          </p>
          <h1 className="mt-2 text-2xl font-black tracking-[-0.04em] sm:text-[30px]">
            Giờ làm được công nhận
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
            Đối chiếu lịch đã công bố với chấm công thực tế. Phiên thiếu dữ liệu
            và giờ ngoài lịch được tách riêng để không làm sai số công.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select aria-label="Chọn nhanh khoảng thời gian" defaultValue="" onChange={(event) => { if (event.target.value) setPreset(event.target.value as "week" | "month" | "previous-month"); event.target.value = ""; }} className="h-9 border border-line bg-surface px-3 text-xs font-bold outline-none focus:border-brand">
            <option value="">Chọn khoảng nhanh</option>
            <option value="week">Tuần này</option>
            <option value="month">Tháng này</option>
            <option value="previous-month">Tháng trước</option>
          </select>
          <Button
            size="sm"
            variant="outline"
            loading={report.isFetching}
            loadingText="Đang cập nhật"
            onClick={() => report.refetch()}
          >
            <RefreshCw className="size-3.5" />
            Cập nhật
          </Button>
          {hasPermission("timesheets.export") && (
            <Button
              size="sm"
              variant="outline"
              loading={exporting.isPending}
              loadingText="Đang xuất"
              onClick={() => exporting.mutate()}
            >
              <Download className="size-3.5" />
              Xuất CSV
            </Button>
          )}
          {hasPermission("timesheets.adjust") && (
            <Button
              size="sm"
              variant="brand"
              loading={generate.isPending}
              loadingText="Đang tổng hợp"
              onClick={() => generate.mutate()}
            >
              <FileClock className="size-3.5" />
              Tổng hợp & lưu
            </Button>
          )}
        </div>
      </header>

      {data && <SummaryCards totals={data.summary} />}

      {data?.period && <TimesheetProgress data={data} to={to} updateTo={(value) => updateFilterQuery({ to: value })} />}

      <section className="border border-line bg-surface shadow-panel">
        <div className="grid gap-px bg-line sm:grid-cols-[1fr_1fr_auto]">
          <FilterField label="Từ ngày">
            <input
              type="date"
              value={from}
              max={to}
              onChange={(event) =>
                updateFilterQuery({ from: event.target.value })
              }
              className="input border-0"
            />
          </FilterField>
          <FilterField label="Đến ngày">
            <input
              type="date"
              value={to}
              min={from}
              onChange={(event) =>
                updateFilterQuery({ to: event.target.value })
              }
              className="input border-0"
            />
          </FilterField>
          <button onClick={() => setFiltersOpen((value) => !value)} className="flex min-h-14 items-center justify-center gap-2 bg-surface px-4 text-sm font-bold text-muted hover:text-ink"><SlidersHorizontal className="size-4" />Bộ lọc{[branchId, departmentId, search].filter(Boolean).length > 0 && <span className="grid size-5 place-items-center bg-brand text-[10px] text-white">{[branchId, departmentId, search].filter(Boolean).length}</span>}<ChevronDown className={cn('size-3.5 transition', filtersOpen && 'rotate-180')} /></button>
        </div>
        {filtersOpen && <div className="grid gap-px border-t border-line bg-line sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1.5fr]">
          <FilterField label="Chi nhánh">
            <select
              value={branchId}
              onChange={(event) =>
                updateFilterQuery({
                  branchId: event.target.value,
                  departmentId: null,
                })
              }
              className="input border-0"
            >
              <option value="">Tất cả chi nhánh</option>
              {data?.options.branches.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label="Phòng ban">
            <select
              value={departmentId}
              onChange={(event) =>
                updateFilterQuery({ departmentId: event.target.value })
              }
              className="input border-0"
            >
              <option value="">Tất cả phòng ban</option>
              {data?.options.departments.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label="Tìm nhân viên / ca">
            <div className="relative">
              <Search className="absolute left-3 top-3 size-4 text-muted" />
              <input
                value={search}
                onChange={(event) =>
                  updateFilterQuery({ search: event.target.value })
                }
                className="input border-0 pl-9"
                placeholder="Tên, mã nhân viên, tên ca..."
              />
            </div>
          </FilterField>
        </div>}
      </section>

      {report.isLoading ? (
        <LoadingState />
      ) : report.isError ? (
        <ErrorState
          message={report.error.message}
          retry={() => report.refetch()}
        />
      ) : data ? (
        <>
          {data.summary.entries > 0 && (
            <div className="flex gap-1 overflow-x-auto border-b border-line pb-px">
              {(
                [
                  ["employees", "Nhân viên", UsersRound],
                  ["comparison", "Dự kiến / thực tế", Scale],
                  ["breaks", "Thời gian break", Coffee],
                  ["overtime", "Tăng ca", TimerReset],
                  ["time", "Ngày / tuần / tháng", CalendarDays],
                  ["departments", "Phòng ban", UsersRound],
                  ["branches", "Chi nhánh", Building2],
                  ["shifts", "Ca làm", Clock3],
                ] as const
              ).map(([key, label, Icon]) => (
                <button
                  key={key}
                  onClick={() => setView(key)}
                  className={cn(
                    "flex h-10 shrink-0 items-center gap-2 border-b-2 px-3 text-xs font-extrabold transition",
                    view === key
                      ? "border-brand text-brand"
                      : "border-transparent text-muted hover:text-ink",
                  )}
                >
                  <Icon className="size-4" />
                  {label}
                </button>
              ))}
            </div>
          )}

          {view === "employees" && (
            <EmployeeTimesheets
              items={data.timesheets}
              canAdjust={hasPermission("timesheets.adjust")}
              canApprove={hasPermission("timesheets.approve")}
              canLock={hasPermission("timesheets.lock")}
              canUnlock={hasPermission("timesheets.unlock")}
              onAdjust={(timesheet, entry) =>
                setAdjusting({ timesheet, entry })
              }
              onAction={(timesheet, action) =>
                setWorkflow({ timesheet, action })
              }
              onHistory={setHistoryId}
            />
          )}
          {view === "comparison" && (
            <ComparisonBreakdown items={data.timesheets} />
          )}
          {view === "breaks" && <BreakBreakdown items={data.timesheets} />}
          {view === "overtime" && <OvertimeBreakdown items={data.timesheets} />}
          {view === "time" && (
            <TimeBreakdown
              rows={timeRows ?? []}
              view={timeView}
              setView={setTimeView}
              maxRegular={maxRegular}
            />
          )}
          {view === "departments" && (
            <DimensionBreakdown
              title="Giờ làm theo phòng ban"
              description="Phân bổ theo phòng ban của ca; nếu ca không chỉ định thì dùng phòng ban của nhân viên."
              rows={data.byDepartment}
            />
          )}
          {view === "branches" && (
            <DimensionBreakdown
              title="Giờ làm theo chi nhánh"
              description="Giờ được ghi nhận cho nơi ca làm phát sinh, không mặc định theo chi nhánh chính của nhân viên."
              rows={data.byBranch}
            />
          )}
          {view === "shifts" && (
            <DimensionBreakdown
              title="Giờ làm theo ca"
              description="Đối chiếu nhu cầu lịch với thời gian thực tế của từng loại ca trong kỳ."
              rows={data.byShift}
            />
          )}

          <p className="text-right text-[10px] text-muted">
            Dữ liệu cập nhật lúc{" "}
            {formatApp(new Date(data.generatedAt), "HH:mm:ss dd/MM/yyyy")} · Múi
            giờ {data.range.timezone}
          </p>
          {adjusting && (
            <AdjustmentModal
              value={adjusting}
              close={() => setAdjusting(null)}
              updated={() => {
                setAdjusting(null);
                queryClient.invalidateQueries({ queryKey: ["timesheets"] });
              }}
            />
          )}
          {workflow && (
            <WorkflowModal
              value={workflow}
              close={() => setWorkflow(null)}
              updated={() => {
                setWorkflow(null);
                queryClient.invalidateQueries({ queryKey: ["timesheets"] });
              }}
            />
          )}
          {historyId && (
            <HistoryModal id={historyId} close={() => setHistoryId(null)} />
          )}
        </>
      ) : null}
    </div>
  );
}

function TimesheetProgress({
  data,
  to,
  updateTo,
}: {
  data: TimesheetReport;
  to: string;
  updateTo: (value: string) => void;
}) {
  const counts = data.timesheets.reduce(
    (result, item) => {
      if (["draft", "pending_approval", "rejected"].includes(item.status)) result.draft += 1;
      if (item.status === "approved") result.approved += 1;
      if (item.status === "locked") result.locked += 1;
      return result;
    },
    { draft: 0, approved: 0, locked: 0 },
  );
  const todayValue = formatApp(new Date(), "yyyy-MM-dd");
  const periodStillOpen = to >= todayValue;

  return (
    <section className="border border-line bg-surface px-4 py-3 shadow-panel sm:px-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs font-bold">
          <span className="text-muted">Tiến độ</span>
          <span className={counts.draft ? "text-warning-strong" : "text-muted"}>Nháp {counts.draft}</span>
          <ChevronRight className="size-3.5 text-muted" />
          <span className={counts.approved ? "text-info" : "text-muted"}>Đã duyệt {counts.approved}</span>
          <ChevronRight className="size-3.5 text-muted" />
          <span className={counts.locked ? "text-success" : "text-muted"}>Đã khóa {counts.locked}</span>
        </div>
        {counts.draft > 0 && periodStillOpen && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-warning-strong">
            <AlertTriangle className="size-4" />
            <span>{to === todayValue ? "Kỳ công kết thúc hôm nay, chưa thể duyệt." : "Kỳ công chưa kết thúc, chưa thể duyệt."}</span>
            <Button size="sm" variant="outline" onClick={() => updateTo(formatApp(subDays(new Date(), 1), "yyyy-MM-dd"))}>
              Chọn đến hôm qua
            </Button>
          </div>
        )}
        {counts.draft > 0 && !periodStillOpen && (
          <p className="text-xs font-bold text-muted">Mở từng nhân viên để duyệt bảng công.</p>
        )}
      </div>
    </section>
  );
}

function SummaryCards({
  totals,
}: {
  totals: TimesheetTotals & { employees: number };
}) {
  const difference = totals.regularMinutes - totals.scheduledMinutes;
  const cards = [
    {
      label: "Nhân viên",
      value: totals.employees.toLocaleString("vi-VN"),
      note: `${totals.entries} dòng công`,
      icon: UsersRound,
      tone: "text-brand bg-info-soft",
    },
    {
      label: "Giờ dự kiến",
      value: hours(totals.scheduledMinutes),
      note: "Theo lịch đã công bố",
      icon: CalendarDays,
      tone: "text-info bg-info-soft",
    },
    {
      label: "Giờ thực tế",
      value: hours(totals.workedMinutes),
      note: `${hours(totals.breakMinutes)} break`,
      icon: Clock3,
      tone: "text-success bg-success-soft",
    },
    {
      label: "Giờ tính công",
      value: hours(totals.regularMinutes),
      note:
        difference === 0
          ? "Khớp kế hoạch"
          : `${difference > 0 ? "+" : ""}${hoursSigned(difference)} so với lịch`,
      icon: CheckCircle2,
      tone: "text-success bg-success-soft",
    },
    {
      label: "Cần kiểm tra",
      value: totals.issues.toLocaleString("vi-VN"),
      note: `${hours(totals.overtimeCandidateMinutes)} vượt lịch`,
      icon: AlertTriangle,
      tone: totals.issues
        ? "text-warning-strong bg-warning-soft"
        : "text-success bg-success-soft",
    },
  ];
  return (
    <section className="grid grid-cols-2 gap-px overflow-hidden border border-line bg-line [&>*:last-child]:col-span-2 xl:grid-cols-5 xl:[&>*:last-child]:col-span-1">
      {cards.map(({ label, value, note, icon: Icon, tone }) => (
        <div key={label} className="min-w-0 bg-surface p-3 sm:p-5">
          <div className={cn("grid size-8 place-items-center", tone)}>
            <Icon className="size-4" />
          </div>
          <p className="mt-3 truncate text-[9px] font-extrabold uppercase tracking-[0.08em] text-muted sm:mt-4 sm:text-[10px] sm:tracking-[0.12em]">
            {label}
          </p>
          <p className="mt-1 truncate font-mono text-xl font-bold tracking-[-0.04em] sm:text-2xl">
            {value}
          </p>
          <p className="mt-1 truncate text-[10px] text-muted sm:text-[11px]">{note}</p>
        </div>
      ))}
    </section>
  );
}

function EmployeeTimesheets({
  items,
  canAdjust,
  canApprove,
  canLock,
  canUnlock,
  onAdjust,
  onAction,
  onHistory,
}: {
  items: TimesheetItem[];
  canAdjust: boolean;
  canApprove: boolean;
  canLock: boolean;
  canUnlock: boolean;
  onAdjust: (timesheet: TimesheetItem, entry: TimesheetEntry) => void;
  onAction: (timesheet: TimesheetItem, action: WorkflowAction) => void;
  onHistory: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  useEffect(() => {
    if (expanded && !items.some((item) => item.employee.id === expanded))
      setExpanded(null);
  }, [expanded, items]);
  if (!items.length) return <EmptyState />;
  return (
    <section className="overflow-hidden border border-line bg-surface shadow-panel">
      <header className="hidden grid-cols-[minmax(240px,1.5fr)_repeat(5,minmax(100px,0.7fr))_44px] gap-3 border-b border-line bg-canvas/55 px-5 py-3 text-[10px] font-extrabold uppercase tracking-wide text-muted lg:grid">
        <span>Nhân viên</span>
        <span className="text-right">Dự kiến</span>
        <span className="text-right">Thực tế</span>
        <span className="text-right">Break</span>
        <span className="text-right">Tính công</span>
        <span className="text-right">Cảnh báo</span>
        <span />
      </header>
      <div className="divide-y divide-line">
        {items.map((item) => {
          const open = expanded === item.employee.id;
          return (
            <div key={item.employee.id}>
              <button
                onClick={() => setExpanded(open ? null : item.employee.id)}
                className={cn(
                  "grid w-full gap-3 px-4 py-4 text-left transition hover:bg-canvas/50 lg:grid-cols-[minmax(240px,1.5fr)_repeat(5,minmax(100px,0.7fr))_44px] lg:items-center lg:px-5",
                  open && "bg-info-soft/35",
                )}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="grid size-9 shrink-0 place-items-center bg-sidebar text-xs font-black text-white">
                    {initials(item.employee.fullName)}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-extrabold">
                      {item.employee.fullName}
                    </p>
                    <p className="mt-1 truncate text-[11px] text-muted">
                      {item.employee.employeeCode} ·{" "}
                      {item.employee.department.name} ·{" "}
                      {item.employee.branch.name}
                    </p>
                  </div>
                </div>
                <MobileMetric
                  label="Dự kiến"
                  value={hours(item.totals.scheduledMinutes)}
                />
                <MobileMetric
                  label="Thực tế"
                  value={hours(item.totals.workedMinutes)}
                />
                <MobileMetric
                  label="Break"
                  value={hours(item.totals.breakMinutes)}
                />
                <MobileMetric
                  label="Tính công"
                  value={hours(item.totals.regularMinutes)}
                  strong
                />
                <div className="flex items-center justify-between lg:justify-end">
                  <span className="lg:hidden text-[10px] font-bold uppercase text-muted">
                    Cảnh báo
                  </span>
                  <StatusCount count={item.totals.issues} />
                </div>
                <div className="hidden justify-end lg:flex">
                  {open ? (
                    <ChevronDown className="size-4 text-brand" />
                  ) : (
                    <ChevronRight className="size-4 text-muted" />
                  )}
                </div>
              </button>
              {open && (
                <div className="border-t border-line bg-[#f8fbff]">
                  <div className="flex flex-col gap-3 border-b border-line px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                    <div className="flex items-center gap-2">
                      <TimesheetStatus status={item.status} />
                      {!item.id && (
                        <span className="text-[10px] font-bold text-muted">
                          Bấm “Tổng hợp & lưu” để bắt đầu quy trình duyệt.
                        </span>
                      )}
                    </div>
                    {item.id && (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onHistory(item.id!)}
                        >
                          <FileClock className="size-3.5" />
                          Lịch sử
                        </Button>
                        {canApprove &&
                          ["draft", "pending_approval", "approved"].includes(
                            item.status,
                          ) && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => onAction(item, "return")}
                            >
                              <RotateCcw className="size-3.5" />
                              Trả lại
                            </Button>
                          )}
                        {canApprove &&
                          ["draft", "pending_approval", "rejected"].includes(
                            item.status,
                          ) && (
                            <Button
                              size="sm"
                              variant="brand"
                              onClick={() => onAction(item, "approve")}
                            >
                              <ShieldCheck className="size-3.5" />
                              Duyệt
                            </Button>
                          )}
                        {canLock && item.status === "approved" && (
                          <Button
                            size="sm"
                            variant="brand"
                            onClick={() => onAction(item, "lock")}
                          >
                            <LockKeyhole className="size-3.5" />
                            Khóa
                          </Button>
                        )}
                        {canUnlock && item.status === "locked" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onAction(item, "unlock")}
                          >
                            <UnlockKeyhole className="size-3.5" />
                            Mở khóa
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                  <EntryTable
                    entries={item.entries}
                    canAdjust={
                      canAdjust &&
                      Boolean(item.id) &&
                      ["draft", "rejected"].includes(item.status)
                    }
                    onAdjust={(entry) => onAdjust(item, entry)}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function EntryTable({
  entries,
  canAdjust,
  onAdjust,
}: {
  entries: TimesheetEntry[];
  canAdjust: boolean;
  onAdjust: (entry: TimesheetEntry) => void;
}) {
  return (
    <div className="px-3 py-3 sm:px-5">
      <div className="overflow-x-auto border border-line bg-white">
        <table className="w-full min-w-[1040px] border-collapse text-left">
          <thead>
            <tr className="border-b border-line bg-canvas/70 text-[10px] font-extrabold uppercase tracking-wide text-muted">
              <th className="px-3 py-2.5">Ngày / ca</th>
              <th className="px-3 py-2.5">Lịch dự kiến</th>
              <th className="px-3 py-2.5">Chấm công</th>
              <th className="px-3 py-2.5 text-right">Dự kiến</th>
              <th className="px-3 py-2.5 text-right">Thực tế</th>
              <th className="px-3 py-2.5 text-right">Break</th>
              <th className="px-3 py-2.5 text-right">Tính công</th>
              <th className="px-3 py-2.5 text-right">OT duyệt</th>
              <th className="px-3 py-2.5">Trạng thái</th>
              <th />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {entries.map((entry) => (
              <tr key={entry.key} className="text-xs">
                <td className="px-3 py-3">
                  <p className="font-extrabold">{formatDate(entry.workDate)}</p>
                  <p className="mt-1 text-[11px] text-muted">
                    {entry.shiftName} · {entry.branchName}
                  </p>
                </td>
                <td className="px-3 py-3 font-mono font-bold">
                  {timeRange(entry.scheduledStartAt, entry.scheduledEndAt)}
                </td>
                <td className="px-3 py-3 font-mono font-bold">
                  {timeRange(entry.actualCheckInAt, entry.actualCheckOutAt)}
                </td>
                <td className="px-3 py-3 text-right font-mono">
                  {hours(entry.scheduledMinutes)}
                </td>
                <td className="px-3 py-3 text-right font-mono">
                  {hours(entry.workedMinutes)}
                </td>
                <td className="px-3 py-3 text-right font-mono">
                  {hours(entry.breakMinutes)}
                </td>
                <td className="px-3 py-3 text-right font-mono font-black text-success">
                  {hours(entry.regularMinutes)}
                </td>
                <td className="px-3 py-3 text-right font-mono font-bold text-brand">
                  {hours(entry.overtimeMinutes)}
                </td>
                <td className="px-3 py-3">
                  <EntryState entry={entry} />
                </td>
                <td className="px-3 py-3 text-right">
                  {canAdjust && (
                    <button
                      aria-label="Điều chỉnh dòng công"
                      onClick={() => onAdjust(entry)}
                      className="grid size-8 place-items-center border border-line text-muted hover:border-brand/30 hover:text-brand"
                    >
                      <Pencil className="size-3.5" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TimeBreakdown({
  rows,
  view,
  setView,
  maxRegular,
}: {
  rows: TimesheetAggregate[];
  view: TimeView;
  setView: (value: TimeView) => void;
  maxRegular: number;
}) {
  return (
    <section className="border border-line bg-surface shadow-panel">
      <header className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div>
          <h2 className="font-extrabold">Giờ làm theo thời gian</h2>
          <p className="mt-1 text-xs text-muted">
            Chuyển cấp xem mà không thay đổi nguồn dữ liệu hoặc tổng giờ.
          </p>
        </div>
        <div className="flex border border-line bg-canvas p-1">
          {(["day", "week", "month"] as const).map((key) => (
            <button
              key={key}
              onClick={() => setView(key)}
              className={cn(
                "h-8 px-3 text-xs font-extrabold",
                view === key ? "bg-white text-brand shadow-sm" : "text-muted",
              )}
            >
              {key === "day" ? "Ngày" : key === "week" ? "Tuần" : "Tháng"}
            </button>
          ))}
        </div>
      </header>
      {rows.length ? (
        <div className="divide-y divide-line">
          {rows.map((row) => (
            <div
              key={row.key}
              className="grid gap-4 p-4 sm:px-5 xl:grid-cols-[180px_minmax(220px,1fr)_repeat(4,110px)] xl:items-center"
            >
              <div>
                <p className="text-sm font-extrabold capitalize">{row.label}</p>
                <p className="mt-1 text-[11px] text-muted">
                  {row.entries} dòng · {row.issues} cần kiểm tra
                </p>
              </div>
              <div>
                <div className="flex h-2 overflow-hidden bg-line/70">
                  <span
                    className="bg-brand"
                    style={{
                      width: `${Math.max(2, (row.regularMinutes / maxRegular) * 100)}%`,
                    }}
                  />
                </div>
                <p className="mt-1.5 text-[10px] text-muted">
                  Mức giờ công được ghi nhận trong kỳ
                </p>
              </div>
              <Metric label="Dự kiến" value={hours(row.scheduledMinutes)} />
              <Metric label="Thực tế" value={hours(row.workedMinutes)} />
              <Metric label="Break" value={hours(row.breakMinutes)} />
              <Metric
                label="Tính công"
                value={hours(row.regularMinutes)}
                accent
              />
            </div>
          ))}
        </div>
      ) : (
        <EmptyState />
      )}
    </section>
  );
}

function DimensionBreakdown({
  title,
  description,
  rows,
}: {
  title: string;
  description: string;
  rows: TimesheetDimension[];
}) {
  const max = Math.max(1, ...rows.map((row) => row.regularMinutes));
  return (
    <section className="border border-line bg-surface shadow-panel">
      <header className="border-b border-line p-4 sm:px-5">
        <h2 className="font-extrabold">{title}</h2>
        <p className="mt-1 text-xs leading-5 text-muted">{description}</p>
      </header>
      {rows.length ? (
        <div className="divide-y divide-line">
          {rows.map((row, index) => (
            <div
              key={row.id}
              className="grid gap-4 p-4 sm:px-5 lg:grid-cols-[38px_minmax(200px,1fr)_minmax(180px,1.2fr)_repeat(4,105px)] lg:items-center"
            >
              <span className="font-mono text-xs font-bold text-muted">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div>
                <p className="text-sm font-extrabold">{row.name}</p>
                <p className="mt-1 text-[11px] text-muted">
                  {row.employees} nhân viên · {row.entries} dòng công
                </p>
              </div>
              <div>
                <div className="h-2 bg-line/70">
                  <div
                    className="h-full bg-brand"
                    style={{
                      width: `${Math.max(2, (row.regularMinutes / max) * 100)}%`,
                    }}
                  />
                </div>
              </div>
              <Metric label="Dự kiến" value={hours(row.scheduledMinutes)} />
              <Metric label="Thực tế" value={hours(row.workedMinutes)} />
              <Metric
                label="Tính công"
                value={hours(row.regularMinutes)}
                accent
              />
              <Metric
                label="Cảnh báo"
                value={String(row.issues)}
                warning={row.issues > 0}
              />
            </div>
          ))}
        </div>
      ) : (
        <EmptyState />
      )}
    </section>
  );
}

function ComparisonBreakdown({ items }: { items: TimesheetItem[] }) {
  if (!items.length) return <EmptyState />;
  return (
    <section className="border border-line bg-surface shadow-panel">
      <header className="border-b border-line p-4 sm:px-5">
        <h2 className="font-extrabold">So sánh giờ dự kiến / thực tế</h2>
        <p className="mt-1 text-xs text-muted">
          Sai lệch dương chưa đồng nghĩa với overtime; chỉ giờ đã duyệt mới
          chuyển sang payroll.
        </p>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-left">
          <thead>
            <tr className="border-b border-line bg-canvas/60 text-[10px] font-extrabold uppercase text-muted">
              <th className="px-5 py-3">Nhân viên</th>
              <th className="px-3 py-3 text-right">Dự kiến</th>
              <th className="px-3 py-3 text-right">Thực tế</th>
              <th className="px-3 py-3 text-right">Sai lệch</th>
              <th className="px-3 py-3 text-right">Tính công</th>
              <th className="px-5 py-3">Mức đáp ứng</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {items.map((item) => {
              const difference =
                item.totals.workedMinutes - item.totals.scheduledMinutes;
              const coverage = item.totals.scheduledMinutes
                ? Math.min(
                    100,
                    (item.totals.regularMinutes /
                      item.totals.scheduledMinutes) *
                      100,
                  )
                : 0;
              return (
                <tr key={item.employee.id} className="text-xs">
                  <td className="px-5 py-4">
                    <p className="font-extrabold">{item.employee.fullName}</p>
                    <p className="mt-1 text-[11px] text-muted">
                      {item.employee.employeeCode} ·{" "}
                      {item.employee.department.name}
                    </p>
                  </td>
                  <td className="px-3 py-4 text-right font-mono">
                    {hours(item.totals.scheduledMinutes)}
                  </td>
                  <td className="px-3 py-4 text-right font-mono">
                    {hours(item.totals.workedMinutes)}
                  </td>
                  <td
                    className={cn(
                      "px-3 py-4 text-right font-mono font-bold",
                      difference < 0
                        ? "text-danger"
                        : difference > 0
                          ? "text-warning-strong"
                          : "text-success",
                    )}
                  >
                    {difference > 0 ? "+" : ""}
                    {hours(difference)}
                  </td>
                  <td className="px-3 py-4 text-right font-mono font-black text-success">
                    {hours(item.totals.regularMinutes)}
                  </td>
                  <td className="px-5 py-4">
                    <div className="h-2 w-36 bg-line">
                      <div
                        className={cn(
                          "h-full",
                          coverage >= 95
                            ? "bg-success"
                            : coverage >= 75
                              ? "bg-warning"
                              : "bg-danger",
                        )}
                        style={{ width: `${coverage}%` }}
                      />
                    </div>
                    <p className="mt-1 font-mono text-[10px] text-muted">
                      {coverage.toFixed(0)}%
                    </p>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function BreakBreakdown({ items }: { items: TimesheetItem[] }) {
  const entries = items
    .flatMap((item) => item.entries)
    .filter((entry) => entry.breakMinutes > 0 || entry.scheduledMinutes > 0)
    .sort((a, b) => b.breakMinutes - a.breakMinutes);
  if (!entries.length) return <EmptyState />;
  return (
    <section className="border border-line bg-surface shadow-panel">
      <header className="border-b border-line p-4 sm:px-5">
        <h2 className="font-extrabold">Tổng hợp thời gian break</h2>
        <p className="mt-1 text-xs text-muted">
          Break thực tế được tách riêng; thay đổi do điều chỉnh luôn hiển thị
          dấu hiệu đã sửa.
        </p>
      </header>
      <div className="divide-y divide-line">
        {entries.map((entry) => (
          <div
            key={entry.key}
            className="grid gap-3 p-4 sm:px-5 lg:grid-cols-[1.2fr_1fr_120px_120px] lg:items-center"
          >
            <div>
              <p className="text-sm font-extrabold">{entry.employeeName}</p>
              <p className="mt-1 text-[11px] text-muted">
                {formatDate(entry.workDate)} · {entry.shiftName}
              </p>
            </div>
            <div className="h-2 bg-line">
              <div
                className={cn(
                  "h-full",
                  entry.breakMinutes > 60 ? "bg-warning" : "bg-brand",
                )}
                style={{
                  width: `${Math.min(100, (entry.breakMinutes / 120) * 100)}%`,
                }}
              />
            </div>
            <Metric
              label="Break thực tế"
              value={hours(entry.breakMinutes)}
              warning={entry.breakMinutes > 60}
            />
            <div className="text-right">
              {entry.adjustment ? (
                <span className="bg-info-soft px-2 py-1 text-[10px] font-extrabold text-info">
                  Đã điều chỉnh
                </span>
              ) : (
                <span className="text-[10px] font-bold text-muted">
                  Dữ liệu chấm công
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function OvertimeBreakdown({ items }: { items: TimesheetItem[] }) {
  const entries = items
    .flatMap((item) => item.entries)
    .filter(
      (entry) =>
        entry.overtimeCandidateMinutes > 0 || entry.overtimeMinutes > 0,
    )
    .sort((a, b) => b.overtimeCandidateMinutes - a.overtimeCandidateMinutes);
  if (!entries.length) return <EmptyState />;
  return (
    <section className="border border-line bg-surface shadow-panel">
      <header className="border-b border-line p-4 sm:px-5">
        <h2 className="font-extrabold">Tính và xác nhận giờ tăng ca</h2>
        <p className="mt-1 text-xs text-muted">
          Giờ vượt lịch chỉ là đề xuất. Cột được duyệt mới là dữ liệu chuyển
          sang payroll.
        </p>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px]">
          <thead>
            <tr className="border-b border-line bg-canvas/60 text-left text-[10px] font-extrabold uppercase text-muted">
              <th className="px-5 py-3">Nhân viên / ca</th>
              <th className="px-3 py-3 text-right">Thực tế</th>
              <th className="px-3 py-3 text-right">OT đề xuất</th>
              <th className="px-3 py-3 text-right">OT đã duyệt</th>
              <th className="px-5 py-3">Kết quả</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {entries.map((entry) => (
              <tr key={entry.key} className="text-xs">
                <td className="px-5 py-4">
                  <p className="font-extrabold">{entry.employeeName}</p>
                  <p className="mt-1 text-[11px] text-muted">
                    {formatDate(entry.workDate)} · {entry.shiftName}
                  </p>
                </td>
                <td className="px-3 py-4 text-right font-mono">
                  {hours(entry.workedMinutes)}
                </td>
                <td className="px-3 py-4 text-right font-mono font-bold text-warning-strong">
                  {hours(entry.overtimeCandidateMinutes)}
                </td>
                <td className="px-3 py-4 text-right font-mono font-black text-brand">
                  {hours(entry.overtimeMinutes)}
                </td>
                <td className="px-5 py-4">
                  {entry.adjustment ? (
                    <span className="bg-success-soft px-2 py-1 text-[10px] font-extrabold text-success">
                      Đã xử lý
                    </span>
                  ) : (
                    <span className="bg-warning-soft px-2 py-1 text-[10px] font-extrabold text-warning-strong">
                      Chờ xem xét
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function AdjustmentModal({
  value,
  close,
  updated,
}: {
  value: { timesheet: TimesheetItem; entry: TimesheetEntry };
  close: () => void;
  updated: () => void;
}) {
  const { timesheet, entry } = value;
  const [breakMinutes, setBreakMinutes] = useState(entry.breakMinutes);
  const [regularMinutes, setRegularMinutes] = useState(entry.regularMinutes);
  const [overtimeMinutes, setOvertimeMinutes] = useState(entry.overtimeMinutes);
  const [reason, setReason] = useState(entry.adjustment?.reason ?? "");
  const mutation = useMutation({
    mutationFn: () =>
      adjustTimesheet(timesheet.id!, {
        sourceKey: entry.key,
        workDate: entry.workDate,
        breakMinutes,
        regularMinutes,
        overtimeMinutes,
        reason,
      }),
    meta: { successMessage: "Đã điều chỉnh bảng công" },
    onSuccess: updated,
  });
  const valid =
    reason.trim().length >= 5 &&
    [breakMinutes, regularMinutes, overtimeMinutes].every(
      (number) => Number.isInteger(number) && number >= 0 && number <= 1440,
    );
  return (
    <ModalShell
      title="Điều chỉnh dòng công"
      subtitle={`${entry.employeeName} · ${formatDate(entry.workDate)} · ${entry.shiftName}`}
      close={close}
    >
      <div className="grid gap-px border border-line bg-line sm:grid-cols-3">
        <NumberField
          label="Break (phút)"
          value={breakMinutes}
          change={setBreakMinutes}
        />
        <NumberField
          label="Giờ thường (phút)"
          value={regularMinutes}
          change={setRegularMinutes}
        />
        <NumberField
          label="Overtime duyệt (phút)"
          value={overtimeMinutes}
          change={setOvertimeMinutes}
        />
      </div>
      <div className="mt-4 grid gap-3 border border-line bg-canvas p-4 sm:grid-cols-3">
        <Metric label="Dự kiến" value={hours(entry.scheduledMinutes)} />
        <Metric label="Thực tế" value={hours(entry.workedMinutes)} />
        <Metric
          label="OT đề xuất"
          value={hours(entry.overtimeCandidateMinutes)}
          warning={entry.overtimeCandidateMinutes > 0}
        />
      </div>
      <label className="mt-4 block">
        <span className="mb-2 block text-[10px] font-extrabold uppercase text-muted">
          Lý do điều chỉnh bắt buộc
        </span>
        <textarea
          rows={3}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          className="w-full resize-none border border-line p-3 text-sm outline-none focus:border-brand"
          placeholder="Nêu căn cứ điều chỉnh giờ công..."
        />
      </label>
      <div className="mt-5 flex justify-end gap-2">
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
          Lưu điều chỉnh
        </Button>
      </div>
    </ModalShell>
  );
}

function WorkflowModal({
  value,
  close,
  updated,
}: {
  value: { timesheet: TimesheetItem; action: WorkflowAction };
  close: () => void;
  updated: () => void;
}) {
  const [note, setNote] = useState("");
  const labels: Record<
    WorkflowAction,
    { title: string; button: string; description: string }
  > = {
    approve: {
      title: "Duyệt bảng công",
      button: "Xác nhận duyệt",
      description: "Kiểm tra dữ liệu giờ công trước khi duyệt.",
    },
    return: {
      title: "Trả lại bảng công",
      button: "Trả lại",
      description:
        "Bảng công quay về trạng thái cần điều chỉnh và phải duyệt lại.",
    },
    lock: {
      title: "Khóa bảng công",
      button: "Khóa bảng công",
      description: "Bảng công đã khóa không thể chỉnh sửa.",
    },
    unlock: {
      title: "Mở khóa bảng công",
      button: "Mở khóa",
      description: "Chỉ mở khóa được bảng công chưa hoàn tất trả lương.",
    },
  };
  const content = labels[value.action];
  const mutation = useMutation({
    mutationFn: () => actOnTimesheet(value.timesheet.id!, value.action, note),
    meta: { successMessage: `Đã ${content.button.toLowerCase()}` },
    onSuccess: updated,
  });
  return (
    <ModalShell
      title={content.title}
      subtitle={`${value.timesheet.employee.fullName} · ${value.timesheet.employee.employeeCode}`}
      close={close}
    >
      <div className="border border-info/20 bg-info-soft p-4 text-xs leading-5 text-info">
        {content.description}
      </div>
      <label className="mt-4 block">
        <span className="mb-2 block text-[10px] font-extrabold uppercase text-muted">
          Lý do / ghi chú bắt buộc
        </span>
        <textarea
          rows={3}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          className="w-full resize-none border border-line p-3 text-sm outline-none focus:border-brand"
        />
      </label>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="outline" disabled={mutation.isPending} onClick={close}>
          Hủy
        </Button>
        <Button
          variant="brand"
          disabled={note.trim().length < 3}
          loading={mutation.isPending}
          loadingText="Đang xử lý"
          onClick={() => mutation.mutate()}
        >
          {content.button}
        </Button>
      </div>
    </ModalShell>
  );
}

function HistoryModal({ id, close }: { id: string; close: () => void }) {
  const history = useQuery({
    queryKey: ["timesheet-history", id],
    queryFn: () => getTimesheetHistory(id),
  });
  return (
    <ModalShell
      title="Lịch sử thay đổi bảng công"
      subtitle="Theo dõi điều chỉnh, duyệt, trả lại, khóa và mở khóa"
      close={close}
    >
      {history.isLoading ? (
        <div className="flex min-h-40 items-center justify-center">
          <LoaderCircle className="size-5 animate-spin text-brand" />
        </div>
      ) : history.data?.length ? (
        <div className="max-h-[60vh] divide-y divide-line overflow-y-auto border border-line">
          {history.data.map((item) => (
            <HistoryRow key={item.id} item={item} />
          ))}
        </div>
      ) : (
        <div className="p-10 text-center text-sm text-muted">
          Chưa có thay đổi được ghi nhận.
        </div>
      )}
    </ModalShell>
  );
}

function HistoryRow({ item }: { item: TimesheetHistoryItem }) {
  return (
    <div className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-extrabold">{historyAction(item.action)}</p>
          <p className="mt-1 text-[11px] text-muted">
            {item.actor} ·{" "}
            {formatApp(new Date(item.createdAt), "HH:mm dd/MM/yyyy")}
          </p>
        </div>
        <span
          className={cn(
            "px-2 py-1 text-[9px] font-extrabold uppercase",
            item.type === "status"
              ? "bg-info-soft text-info"
              : "bg-warning-soft text-warning-strong",
          )}
        >
          {item.type === "status" ? "Trạng thái" : "Dữ liệu"}
        </span>
      </div>
      {item.note && (
        <p className="mt-3 border-l-2 border-brand pl-3 text-xs leading-5">
          {item.note}
        </p>
      )}
      {item.type === "change" && item.oldValues && item.newValues && (
        <div className="mt-3 grid gap-2 bg-canvas p-3 text-[10px] sm:grid-cols-2">
          <pre className="overflow-auto whitespace-pre-wrap text-muted">
            Trước: {JSON.stringify(item.oldValues, null, 2)}
          </pre>
          <pre className="overflow-auto whitespace-pre-wrap text-ink">
            Sau: {JSON.stringify(item.newValues, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

function ModalShell({
  title,
  subtitle,
  close,
  children,
}: {
  title: string;
  subtitle: string;
  close: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-ink/45 sm:items-center sm:p-5">
      <button aria-label="Đóng" className="absolute inset-0" onClick={close} />
      <div className="relative z-10 max-h-[94vh] w-full overflow-y-auto border border-line bg-surface shadow-2xl sm:max-w-2xl">
        <header className="flex items-start justify-between border-b border-line p-5">
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
      </div>
    </div>
  );
}

function NumberField({
  label,
  value,
  change,
}: {
  label: string;
  value: number;
  change: (value: number) => void;
}) {
  return (
    <label className="block bg-white p-3">
      <span className="mb-2 block text-[10px] font-extrabold uppercase text-muted">
        {label}
      </span>
      <input
        type="number"
        min="0"
        max="1440"
        value={value}
        onChange={(event) => change(Number(event.target.value))}
        className="input font-mono font-bold"
      />
    </label>
  );
}

function TimesheetStatus({ status }: { status: string }) {
  const values: Record<string, [string, string]> = {
    unpersisted: ["Chưa tổng hợp", "bg-canvas text-muted"],
    draft: ["Nháp", "bg-info-soft text-info"],
    pending_approval: ["Chờ duyệt", "bg-warning-soft text-warning-strong"],
    approved: ["Đã duyệt", "bg-success-soft text-success"],
    rejected: ["Đã trả lại", "bg-danger-soft text-danger"],
    locked: ["Đã khóa", "bg-sidebar text-white"],
  };
  const [label, color] = values[status] ?? [status, "bg-canvas text-muted"];
  return (
    <span
      className={cn("px-2 py-1 text-[10px] font-extrabold uppercase", color)}
    >
      {label}
    </span>
  );
}

function historyAction(action: string) {
  const labels: Record<string, string> = {
    timesheet_generated: "Tạo bảng công",
    timesheet_regenerated: "Tổng hợp lại bảng công",
    timesheet_adjusted: "Điều chỉnh dòng công",
    timesheet_adjustment_updated: "Cập nhật điều chỉnh",
    timesheet_approved: "Duyệt bảng công",
    timesheet_rejected: "Trả lại bảng công",
    timesheet_locked: "Khóa bảng công",
    timesheet_unlocked: "Mở khóa bảng công",
  };
  return labels[action] ?? action.replaceAll("_", " ");
}

function EntryState({ entry }: { entry: TimesheetEntry }) {
  const states = {
    complete: ["Hoàn chỉnh", "bg-success-soft text-success"],
    incomplete: ["Thiếu dữ liệu", "bg-danger-soft text-danger"],
    absent: ["Vắng mặt", "bg-danger-soft text-danger"],
    scheduled: ["Chưa diễn ra", "bg-canvas text-muted"],
    outside_schedule: ["Ngoài lịch", "bg-warning-soft text-warning-strong"],
    adjusted: ["Đã điều chỉnh", "bg-info-soft text-info"],
  } as const;
  const [label, color] = states[entry.state];
  return (
    <div>
      <span
        className={cn(
          "inline-flex px-2 py-1 text-[10px] font-extrabold uppercase",
          color,
        )}
      >
        {label}
      </span>
      {entry.overtimeCandidateMinutes > 0 && (
        <p className="mt-1.5 text-[10px] font-bold text-warning-strong">
          +{hours(entry.overtimeCandidateMinutes)} chờ duyệt OT
        </p>
      )}
      {entry.lateMinutes > 15 && (
        <p className="mt-1 text-[10px] font-bold text-warning-strong">
          Muộn {formatDurationMinutes(entry.lateMinutes)}
        </p>
      )}
    </div>
  );
}

function StatusCount({ count }: { count: number }) {
  return count ? (
    <span className="inline-flex items-center gap-1 bg-warning-soft px-2 py-1 text-[10px] font-extrabold text-warning-strong">
      <AlertTriangle className="size-3" />
      {count}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 bg-success-soft px-2 py-1 text-[10px] font-extrabold text-success">
      <CheckCircle2 className="size-3" />
      Không cảnh báo
    </span>
  );
}
function Metric({
  label,
  value,
  accent,
  warning,
}: {
  label: string;
  value: string;
  accent?: boolean;
  warning?: boolean;
}) {
  return (
    <div className="flex items-center justify-between lg:block lg:text-right">
      <span className="text-[10px] font-bold uppercase text-muted">
        {label}
      </span>
      <p
        className={cn(
          "mt-0.5 font-mono text-sm font-bold",
          accent && "text-success",
          warning && "text-warning-strong",
        )}
      >
        {value}
      </p>
    </div>
  );
}
function MobileMetric({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between lg:block lg:text-right">
      <span className="text-[10px] font-bold uppercase text-muted lg:hidden">
        {label}
      </span>
      <span
        className={cn("font-mono text-sm font-bold", strong && "text-success")}
      >
        {value}
      </span>
    </div>
  );
}
function FilterField({
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
function LoadingState() {
  return (
    <div className="flex min-h-72 items-center justify-center border border-line bg-surface">
      <LoaderCircle className="mr-2 size-5 animate-spin text-brand" />
      <span className="text-sm font-bold text-muted">
        Đang tổng hợp bảng công...
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
    <div className="border border-danger/20 bg-danger-soft p-6 text-center">
      <AlertTriangle className="mx-auto size-5 text-danger" />
      <p className="mt-3 text-sm font-bold text-danger">{message}</p>
      <Button className="mt-4" size="sm" variant="outline" onClick={retry}>
        Thử lại
      </Button>
    </div>
  );
}
function EmptyState() {
  return (
    <div className="p-12 text-center">
      <TimerReset className="mx-auto size-6 text-muted" />
      <p className="mt-3 text-sm font-extrabold">Chưa có dữ liệu bảng công</p>
      <p className="mt-1 text-xs text-muted">
        Hãy đổi khoảng ngày hoặc bộ lọc để kiểm tra dữ liệu khác.
      </p>
    </div>
  );
}
function hours(minutes: number) {
  return formatDurationMinutes(minutes);
}
function hoursSigned(minutes: number) {
  return hours(minutes);
}
function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(-2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}
function formatDate(value: string) {
  return formatApp(new Date(`${value}T00:00:00`), "EEE, dd/MM", { locale: vi });
}
function timeRange(start: string | null, end: string | null) {
  return `${start ? formatApp(new Date(start), "HH:mm") : "--:--"} → ${end ? formatApp(new Date(end), "HH:mm") : "--:--"}`;
}
