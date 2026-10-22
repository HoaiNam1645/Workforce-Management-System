"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Download,
  FileSpreadsheet,
  LoaderCircle,
  RefreshCw,
  SlidersHorizontal,
  UsersRound,
} from "lucide-react";
import { format, startOfMonth } from "date-fns";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth/auth-provider";
import {
  exportReport,
  getReports,
  type ReportData,
  type ReportFilters,
} from "@/lib/reports-api";
import { formatDurationMinutes } from "@/lib/time-format";
import { cn } from "@/lib/utils";

const reports = [
  ["overview", "Tổng quan"],
  ["employees", "Nhân sự"],
  ["schedule", "Lịch & độ phủ"],
  ["hours", "Giờ làm"],
  ["attendance", "Chấm công"],
  ["breaks", "Break"],
  ["overtime", "Overtime"],
  ["anomalies", "Đi muộn / vắng"],
  ["leave", "Nghỉ phép"],
  ["timesheets", "Bảng công"],
  ["payroll", "Tiền lương"],
  ["branches", "Chi nhánh"],
  ["departments", "Phòng ban"],
  ["positions", "Vị trí"],
  ["performance", "Hiệu suất"],
  ["plan-actual", "Kế hoạch / thực tế"],
  ["period", "Ngày / tuần / tháng"],
] as const;

type ReportKey = (typeof reports)[number][0];
type MetricItem = {
  label: string;
  value: string;
  note: string;
  icon: typeof UsersRound;
  tone?: "warning";
};

const today = format(new Date(), "yyyy-MM-dd");
const monthStart = format(startOfMonth(new Date()), "yyyy-MM-dd");

export function ReportsDashboard() {
  const { hasPermission } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const requestedReport = (params.get("report") as ReportKey) || "overview";
  const report = requestedReport === "payroll" && !hasPermission("payroll.view") ? "overview" : requestedReport;
  const availableReports = reports.filter(([key]) => key !== "payroll" || hasPermission("payroll.view"));
  const from = params.get("from") || monthStart;
  const to = params.get("to") || today;
  const interval = params.get("interval") || "day";
  const branchId = params.get("branchId") || "";
  const departmentId = params.get("departmentId") || "";
  const positionId = params.get("positionId") || "";
  const filters: ReportFilters = {
    from,
    to,
    interval,
    branchId: branchId || undefined,
    departmentId: departmentId || undefined,
    positionId: positionId || undefined,
  };
  const update = useCallback(
    (values: Record<string, string | null>) => {
      const next = new URLSearchParams(params);
      Object.entries(values).forEach(([key, value]) =>
        value ? next.set(key, value) : next.delete(key),
      );
      router.replace(`${pathname}?${next}`, { scroll: false });
    },
    [params, pathname, router],
  );
  const query = useQuery({
    queryKey: ["reports", filters],
    queryFn: () => getReports(filters),
  });
  const [exportOpen, setExportOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(
    Boolean(branchId || departmentId || positionId || interval !== "day"),
  );
  const advancedCount = [
    branchId,
    departmentId,
    positionId,
    interval !== "day" ? interval : "",
  ].filter(Boolean).length;
  const exporting = useMutation({
    mutationFn: (value: "csv" | "xls" | "pdf") =>
      exportReport(filters, report, value),
    meta: { successMessage: "Đã xuất báo cáo" },
    onSettled: () => setExportOpen(false),
  });

  return (
    <div className="w-full min-w-0 space-y-5">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-brand">
            Báo cáo và phân tích
          </p>
          <h1 className="mt-2 text-2xl font-black tracking-[-0.04em] sm:text-[30px]">
            Dữ liệu vận hành
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            Mỗi báo cáo sử dụng đúng dữ liệu nghiệp vụ trong cùng khoảng lọc.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            loading={query.isFetching}
            loadingText="Đang cập nhật"
            onClick={() => query.refetch()}
          >
            <RefreshCw className="size-4" />
            Cập nhật
          </Button>
          <div className="relative">
            <Button variant="brand" onClick={() => setExportOpen((value) => !value)}>
              <Download className="size-4" />
              Xuất file
              <ChevronDown className="size-3.5" />
            </Button>
            {exportOpen && (
              <div className="absolute right-0 top-11 z-30 w-44 border border-line bg-surface p-1 shadow-xl">
                {(["csv", "xls", "pdf"] as const).map((value) => (
                  <button
                    key={value}
                    onClick={() => exporting.mutate(value)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-bold hover:bg-canvas"
                  >
                    <FileSpreadsheet className="size-3.5 text-brand" />
                    {value.toUpperCase()}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </header>

      <section className="border border-line bg-surface shadow-panel">
        <div className="grid gap-px bg-line sm:grid-cols-[1fr_1fr_auto]">
          <Filter label="Từ ngày">
            <input
              type="date"
              className="input border-0"
              value={from}
              max={to}
              onChange={(event) => update({ from: event.target.value })}
            />
          </Filter>
          <Filter label="Đến ngày">
            <input
              type="date"
              className="input border-0"
              value={to}
              min={from}
              onChange={(event) => update({ to: event.target.value })}
            />
          </Filter>
          <button
            onClick={() => setAdvancedOpen((value) => !value)}
            className="flex min-h-14 items-center justify-center gap-2 bg-surface px-4 text-sm font-bold text-muted hover:text-ink"
          >
            <SlidersHorizontal className="size-4" />
            Bộ lọc
            {advancedCount > 0 && (
              <span className="grid size-5 place-items-center bg-brand text-[10px] text-white">
                {advancedCount}
              </span>
            )}
            <ChevronDown
              className={cn("size-3.5 transition", advancedOpen && "rotate-180")}
            />
          </button>
        </div>
        {advancedOpen && (
          <div className="grid gap-px border-t border-line bg-line sm:grid-cols-2 xl:grid-cols-4">
            <Filter label="Chi nhánh">
              <select
                className="input border-0"
                value={branchId}
                onChange={(event) =>
                  update({ branchId: event.target.value || null })
                }
              >
                <option value="">Tất cả</option>
                {query.data?.options
                  .filter((item) => item.kind === "branch")
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
              </select>
            </Filter>
            <Filter label="Phòng ban">
              <select
                className="input border-0"
                value={departmentId}
                onChange={(event) =>
                  update({ departmentId: event.target.value || null })
                }
              >
                <option value="">Tất cả</option>
                {query.data?.options
                  .filter((item) => item.kind === "department")
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
              </select>
            </Filter>
            <Filter label="Vị trí">
              <select
                className="input border-0"
                value={positionId}
                onChange={(event) =>
                  update({ positionId: event.target.value || null })
                }
              >
                <option value="">Tất cả</option>
                {query.data?.options
                  .filter((item) => item.kind === "position")
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
              </select>
            </Filter>
            <Filter label="Chu kỳ">
              <select
                className="input border-0"
                value={interval}
                onChange={(event) => update({ interval: event.target.value })}
              >
                <option value="day">Theo ngày</option>
                <option value="week">Theo tuần</option>
                <option value="month">Theo tháng</option>
              </select>
            </Filter>
          </div>
        )}
      </section>

      <div className="sm:hidden">
        <label className="block text-[10px] font-extrabold uppercase tracking-wide text-muted">
          Nội dung báo cáo
        </label>
        <select
          aria-label="Nội dung báo cáo"
          className="mt-2 h-11 w-full border border-line bg-surface px-3 text-sm font-bold"
          value={report}
          onChange={(event) => update({ report: event.target.value })}
        >
          {availableReports.map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <nav className="hidden gap-1 overflow-x-auto border-b border-line sm:flex">
        {availableReports.map(([key, label]) => (
          <button
            key={key}
            onClick={() => update({ report: key })}
            className={cn(
              "shrink-0 border-b-2 px-3 py-3 text-xs font-extrabold",
              report === key
                ? "border-brand text-brand"
                : "border-transparent text-muted hover:text-ink",
            )}
          >
            {label}
          </button>
        ))}
      </nav>

      {query.isLoading ? (
        <Loading />
      ) : query.isError ? (
        <div className="border border-danger/20 bg-danger-soft p-4 text-sm font-bold text-danger">
          {query.error.message}
        </div>
      ) : query.data ? (
        <ReportContent report={report} data={query.data} />
      ) : null}

      {query.data && (
        <div className="flex flex-col gap-1 border-t border-line pt-3 text-[10px] text-muted sm:flex-row sm:items-center sm:justify-between">
          <DataState value={query.data.dataState} />
          <span>
            Cập nhật lúc{" "}
            {format(new Date(query.data.generatedAt), "HH:mm:ss dd/MM/yyyy")}
          </span>
        </div>
      )}
    </div>
  );
}

function ReportContent({
  report,
  data,
}: {
  report: ReportKey;
  data: ReportData;
}) {
  const metrics = metricSet(report, data);
  const dimensionKind =
    report === "branches"
      ? "branch"
      : report === "departments"
        ? "department"
        : report === "positions"
          ? "position"
          : null;

  return (
    <div className="space-y-5">
      <section className="grid grid-cols-2 gap-px overflow-hidden border border-line bg-line xl:grid-cols-4">
        {metrics.map((item) => (
          <Metric key={item.label} {...item} />
        ))}
      </section>
      {report === "overview" && <OverviewContent data={data} />}
      {report === "employees" && <EmployeeTable rows={data.employeeRows} />}
      {report === "schedule" && <ScheduleTable rows={data.scheduleRows} />}
      {report === "hours" && (
        <>
          <TrendChart rows={data.trend} />
          <HoursTable rows={data.performance} />
        </>
      )}
      {report === "attendance" && <AttendanceTable rows={data.attendanceRows} />}
      {report === "breaks" && <BreakTable rows={data.attendanceRows} />}
      {report === "overtime" && (
        <OvertimeTable rows={data.overtimeRows} currency={data.currency} />
      )}
      {report === "anomalies" && <AnomalyDetailTable rows={data.anomalyRows} />}
      {report === "leave" && <LeaveTable rows={data.leaveRows} />}
      {report === "timesheets" && <TimesheetTable rows={data.timesheetRows} />}
      {report === "payroll" && (
        <PayrollTable rows={data.payrollRows} currency={data.currency} />
      )}
      {dimensionKind && (
        <DimensionTable
          rows={data.dimensions.filter((item) => item.kind === dimensionKind)}
        />
      )}
      {report === "performance" && <PerformanceTable rows={data.performance} />}
      {report === "plan-actual" && (
        <>
          <TrendChart rows={data.trend} />
          <PlanActualTable rows={data.trend} />
        </>
      )}
      {report === "period" && (
        <>
          <TrendChart rows={data.trend} />
          <PeriodTable rows={data.trend} />
        </>
      )}
    </div>
  );
}

function metricSet(report: ReportKey, data: ReportData): MetricItem[] {
  const e = data.employees;
  const s = data.schedule;
  const a = data.attendance;
  const l = data.leave;
  const t = data.timesheets;
  const p = data.payroll;
  const planned = data.trend.reduce((sum, row) => sum + row.planned, 0);
  const actual = data.trend.reduce((sum, row) => sum + row.actual, 0);
  const money = (value: number) => moneyValue(value, data.currency);
  const duration = (value: number) => formatDurationMinutes(value || 0);
  const sets: Record<ReportKey, MetricItem[]> = {
    overview: [
      { label: "Nhân viên đang làm", value: String(e.active || 0), note: `${e.new_hires || 0} nhân viên mới`, icon: UsersRound },
      { label: "Độ phủ nhân sự", value: percent(s.assigned, s.required), note: `${s.understaffed || 0} ca thiếu người`, icon: CalendarDays },
      { label: "Giờ thực tế", value: duration(actual), note: `${duration(planned)} dự kiến`, icon: Clock3 },
      { label: "Cần kiểm tra", value: String((a.missing_check_in || 0) + (a.missing_check_out || 0) + (a.absent || 0)), note: "Dữ liệu chấm công", icon: AlertTriangle, tone: "warning" },
    ],
    employees: [
      { label: "Nhân sự cuối kỳ", value: String(e.headcount_end || 0), note: `${e.headcount_start || 0} người đầu kỳ`, icon: UsersRound },
      { label: "Nhân viên mới", value: String(e.new_hires || 0), note: `${e.full_time || 0} full-time · ${e.part_time || 0} part-time`, icon: CheckCircle2 },
      { label: "Nghỉ việc", value: String(e.terminated || 0), note: `Tỷ lệ ${turnover(e)}%`, icon: AlertTriangle, tone: Number(e.terminated) > 0 ? "warning" : undefined },
      { label: "Thâm niên TB", value: tenure(Number(e.average_tenure_days || 0)), note: `${e.on_leave || 0} đang tạm nghỉ`, icon: CalendarDays },
    ],
    schedule: [
      { label: "Ca đã công bố", value: String(s.shifts || 0), note: `${s.required || 0} lượt yêu cầu`, icon: CalendarDays },
      { label: "Tỷ lệ phủ", value: percent(s.assigned, s.required), note: `${s.assigned || 0} lượt đã phân`, icon: UsersRound },
      { label: "Ca thiếu người", value: String(s.understaffed || 0), note: `${s.unassigned || 0} ca chưa có người`, icon: AlertTriangle, tone: Number(s.understaffed) > 0 ? "warning" : undefined },
      { label: "Đủ / vượt", value: `${s.fully_staffed || 0} / ${s.overstaffed || 0}`, note: "Ca đủ người / xếp vượt", icon: BarChart3 },
    ],
    hours: [
      { label: "Dự kiến", value: duration(planned), note: "Theo số lượt được phân ca", icon: CalendarDays },
      { label: "Thực tế", value: duration(actual), note: "Theo chấm công", icon: Clock3 },
      { label: "Chênh lệch", value: signedDuration(actual - planned), note: varianceNote(actual, planned), icon: BarChart3 },
      { label: "Được tính công", value: duration(t.regular_minutes), note: `${duration(t.overtime_minutes)} overtime`, icon: CheckCircle2 },
    ],
    attendance: [
      { label: "Check-in / Check-out", value: `${a.check_ins || 0} / ${a.check_outs || 0}`, note: `${a.completed || 0} phiên hoàn chỉnh`, icon: Clock3 },
      { label: "Thiếu dữ liệu", value: String((a.missing_check_in || 0) + (a.missing_check_out || 0)), note: `${a.missing_check_in || 0} thiếu vào · ${a.missing_check_out || 0} thiếu ra`, icon: AlertTriangle, tone: Number(a.missing_check_in) + Number(a.missing_check_out) > 0 ? "warning" : undefined },
      { label: "GPS / Selfie", value: `${a.events_with_gps || 0} / ${a.events_with_selfie || 0}`, note: `${a.events_without_gps || 0} sự kiện không GPS`, icon: CheckCircle2 },
      { label: "Ngoài lịch / vùng", value: `${a.outside_schedule || 0} / ${a.outside_geofence || 0}`, note: `${a.adjustment_requests || 0} yêu cầu điều chỉnh`, icon: UsersRound },
    ],
    breaks: [
      { label: "Tổng break", value: duration(a.break_minutes), note: `${a.records || 0} phiên công`, icon: Clock3 },
      { label: "Trung bình", value: duration(a.records ? Math.round(a.break_minutes / a.records) : 0), note: "Mỗi phiên", icon: BarChart3 },
      { label: "Đúng / không nghỉ", value: `${a.break_within_limit || 0} / ${a.no_break || 0}`, note: "Trong giới hạn / không phát sinh", icon: CheckCircle2 },
      { label: "Quá giờ / chưa kết thúc", value: `${a.break_over_limit || 0} / ${a.open_breaks || 0}`, note: `Vượt ${duration(a.break_over_minutes)}`, icon: AlertTriangle, tone: Number(a.break_over_limit) + Number(a.open_breaks) > 0 ? "warning" : undefined },
    ],
    overtime: [
      { label: "OT ứng viên", value: duration(a.overtime_minutes), note: `${a.overtime_employees || 0} nhân viên`, icon: Clock3 },
      { label: "OT đã xác nhận", value: duration(t.overtime_minutes), note: `${t.locked || 0} bảng công khóa`, icon: CheckCircle2 },
      { label: "Tiền overtime", value: money(p.overtime_pay), note: "Theo payroll", icon: BarChart3 },
      { label: "Tỷ lệ overtime", value: percent(t.overtime_minutes, t.regular_minutes), note: "Trên giờ tính công", icon: BarChart3 },
    ],
    anomalies: [
      { label: "Đi muộn", value: String(anomaly(data, "late")), note: duration(anomalyMinutes(data, "late")), icon: Clock3 },
      { label: "Vắng mặt", value: String(anomaly(data, "absence")), note: "Không tính nghỉ đã duyệt", icon: UsersRound },
      { label: "Nghỉ quá giờ", value: String(anomaly(data, "excessive_break")), note: duration(anomalyMinutes(data, "excessive_break")), icon: AlertTriangle },
      { label: "Tổng bất thường", value: String(data.anomalies.reduce((sum, row) => sum + Number(row.value || 0), 0)), note: "Đang có hiệu lực", icon: BarChart3 },
    ],
    leave: [
      { label: "Yêu cầu", value: String(l.total || 0), note: `${l.pending || 0} chờ duyệt`, icon: CalendarDays },
      { label: "Đã duyệt", value: String(l.approved || 0), note: `${percent(l.approved, l.total)} · xử lý TB ${l.average_review_hours || 0}h`, icon: CheckCircle2 },
      { label: "Có lương / không lương", value: `${l.paid_amount || 0} / ${l.unpaid_amount || 0}`, note: "Thời lượng đã duyệt", icon: UsersRound },
      { label: "Số dư còn lại", value: `${l.balance_available_days || 0} ngày`, note: `${l.balance_available_hours || 0} giờ · ${l.low_balances || 0} số dư thấp`, icon: AlertTriangle, tone: Number(l.low_balances) > 0 ? "warning" : undefined },
    ],
    timesheets: [
      { label: "Bảng công", value: String(t.total || 0), note: `${t.locked || 0} đã khóa · ${t.approved || 0} đã duyệt`, icon: FileSpreadsheet },
      { label: "Giờ tính công", value: duration(t.regular_minutes), note: `${duration(t.worked_minutes)} thực tế`, icon: Clock3 },
      { label: "Break / Overtime", value: `${duration(t.break_minutes)} / ${duration(t.overtime_minutes)}`, note: "Theo bảng công", icon: BarChart3 },
      { label: "Điều chỉnh / trả lại", value: `${t.adjustments || 0} / ${t.rejected || 0}`, note: "Trong kỳ", icon: AlertTriangle, tone: Number(t.adjustments) + Number(t.rejected) > 0 ? "warning" : undefined },
    ],
    payroll: [
      { label: "Phiếu lương", value: String(p.payslips || 0), note: `${p.finalized || 0} đã chốt`, icon: FileSpreadsheet },
      { label: "Tổng thu nhập", value: money(p.gross_pay), note: `${money(p.base_salary)} lương cơ bản`, icon: BarChart3 },
      { label: "Thực nhận", value: money(p.net_pay), note: `${money(p.paid_total)} đã trả`, icon: CheckCircle2 },
      { label: "Còn phải trả", value: money(p.balance_due), note: `${money(p.deductions)} khấu trừ`, icon: AlertTriangle, tone: Number(p.balance_due) > 0 ? "warning" : undefined },
    ],
    branches: dimensionMetrics(data, "branch"),
    departments: dimensionMetrics(data, "department"),
    positions: dimensionMetrics(data, "position"),
    performance: [
      { label: "Nhân viên có lịch", value: String(data.performance.filter((row) => row.shifts > 0).length), note: "Trong kỳ báo cáo", icon: UsersRound },
      { label: "Tỷ lệ có mặt", value: performanceRate(data.performance, "present_shifts"), note: "Trên tổng ca được phân", icon: CheckCircle2 },
      { label: "Tỷ lệ đúng giờ", value: performanceRate(data.performance, "on_time_shifts", "present_shifts"), note: "Trên ca có mặt", icon: Clock3 },
      { label: "Bất thường", value: String(data.performance.reduce((sum, row) => sum + row.anomalies, 0)), note: "Không tạo điểm xếp hạng", icon: AlertTriangle },
    ],
    "plan-actual": [
      { label: "Giờ kế hoạch", value: duration(planned), note: "Theo số lượt được phân ca", icon: CalendarDays },
      { label: "Giờ thực tế", value: duration(actual), note: "Sau khi trừ break", icon: Clock3 },
      { label: "Chênh lệch", value: signedDuration(actual - planned), note: varianceNote(actual, planned), icon: BarChart3 },
      { label: "Tỷ lệ đạt", value: percent(actual, planned), note: "Thực tế / kế hoạch", icon: CheckCircle2 },
    ],
    period: [
      { label: "Số chu kỳ", value: String(data.trend.length), note: "Theo độ phân giải đang chọn", icon: CalendarDays },
      { label: "Giờ dự kiến", value: duration(planned), note: "Toàn khoảng lọc", icon: Clock3 },
      { label: "Giờ thực tế", value: duration(actual), note: "Toàn khoảng lọc", icon: CheckCircle2 },
      { label: "Tỷ lệ đạt", value: percent(actual, planned), note: "Tổng không đổi khi đổi chu kỳ", icon: BarChart3 },
    ],
  };
  return sets[report];
}

function OverviewContent({ data }: { data: ReportData }) {
  return (
    <div className="grid gap-5 xl:grid-cols-[1.35fr_.65fr]">
      <TrendChart rows={data.trend} />
      <section className="border border-line bg-surface shadow-panel">
        <header className="border-b border-line p-5">
          <h2 className="text-sm font-extrabold">Điểm cần chú ý</h2>
          <p className="mt-1 text-xs text-muted">Chỉ hiển thị dữ liệu cần hành động.</p>
        </header>
        <div className="divide-y divide-line">
          <SummaryRow label="Ca thiếu người" value={data.schedule.understaffed || 0} />
          <SummaryRow label="Thiếu check-in/out" value={(data.attendance.missing_check_in || 0) + (data.attendance.missing_check_out || 0)} />
          <SummaryRow label="Yêu cầu nghỉ chờ duyệt" value={data.leave.pending || 0} />
          <SummaryRow label="Bảng công chưa khóa" value={(data.timesheets.total || 0) - (data.timesheets.locked || 0)} />
        </div>
      </section>
    </div>
  );
}

function EmployeeTable({ rows }: { rows: ReportData["employeeRows"] }) {
  return (
    <Table
      headers={["Nhân viên", "Trạng thái", "Loại", "Ngày vào làm", "Chi nhánh", "Phòng ban", "Vị trí"]}
      rows={rows.map((row) => [
        `${row.name}\n${row.employee_code}`,
        statusLabel(row.employment_status),
        row.employment_type === "full_time" ? "Full-time" : "Part-time",
        dateValue(row.hire_date),
        row.branch || "—",
        row.department || "—",
        row.position || "—",
      ])}
    />
  );
}

function ScheduleTable({ rows }: { rows: ReportData["scheduleRows"] }) {
  return (
    <Table
      headers={["Ca làm", "Thời gian", "Đơn vị", "Yêu cầu", "Đã phân", "Còn thiếu", "Độ phủ"]}
      rows={rows.map((row) => [
        row.name,
        `${dateTime(row.starts_at)}\nđến ${dateTime(row.ends_at)}`,
        `${row.department || "Mọi phòng ban"}\n${row.branch}`,
        String(row.required),
        String(row.assigned),
        String(row.missing),
        coverageLabel(row.coverage_status),
      ])}
    />
  );
}

function HoursTable({ rows }: { rows: ReportData["performance"] }) {
  return (
    <Table
      headers={["Nhân viên", "Đơn vị", "Dự kiến", "Thực tế", "Chênh lệch", "Tính công", "Overtime"]}
      rows={rows.map((row) => [
        `${row.name}\n${row.employee_code}`,
        `${row.department || "—"}\n${row.branch || "—"}`,
        formatDurationMinutes(row.scheduled_minutes),
        formatDurationMinutes(row.worked_minutes),
        signedDuration(row.worked_minutes - row.scheduled_minutes),
        row.sufficient_shifts >= row.shifts && row.shifts > 0 ? "Đủ giờ" : `${row.sufficient_shifts}/${row.shifts} ca đủ giờ`,
        formatDurationMinutes(row.overtime_minutes),
      ])}
    />
  );
}

function AttendanceTable({ rows }: { rows: ReportData["attendanceRows"] }) {
  return (
    <Table
      headers={["Nhân viên", "Ngày / ca", "Check-in", "Check-out", "Trạng thái", "GPS / Selfie", "Điều chỉnh"]}
      rows={rows.map((row) => [
        `${row.employee}\n${row.employee_code}`,
        `${dateValue(row.work_date)}\n${row.shift}`,
        timeValue(row.check_in_at),
        timeValue(row.check_out_at),
        statusLabel(row.status),
        `${row.gps_events} GPS · ${row.selfie_events} selfie${row.outside_geofence_events ? `\n${row.outside_geofence_events} ngoài vùng` : ""}`,
        String(row.adjustment_requests),
      ])}
    />
  );
}

function BreakTable({ rows }: { rows: ReportData["attendanceRows"] }) {
  return (
    <Table
      headers={["Nhân viên", "Ngày / ca", "Số lần nghỉ", "Quy định", "Thực tế", "Chênh lệch", "Kết quả"]}
      rows={rows.map((row) => {
        const difference = row.break_minutes - row.allowed_break_minutes;
        return [
          `${row.employee}\n${row.employee_code}`,
          `${dateValue(row.work_date)}\n${row.shift}`,
          String(row.break_count),
          formatDurationMinutes(row.allowed_break_minutes),
          formatDurationMinutes(row.break_minutes),
          signedDuration(difference),
          row.break_open ? "Chưa kết thúc nghỉ" : difference > 0 ? "Nghỉ quá thời gian" : row.break_count ? "Trong giới hạn" : "Không nghỉ",
        ];
      })}
    />
  );
}

function OvertimeTable({ rows, currency }: { rows: ReportData["overtimeRows"]; currency: string }) {
  return (
    <Table
      headers={["Nhân viên", "Đơn vị", "OT ứng viên", "OT xác nhận", "Chênh lệch", "Tiền overtime"]}
      rows={rows.map((row) => [
        `${row.employee}\n${row.employee_code}`,
        `${row.department || "—"}\n${row.branch || "—"}`,
        formatDurationMinutes(row.candidate_minutes),
        formatDurationMinutes(row.confirmed_minutes),
        signedDuration(row.confirmed_minutes - row.candidate_minutes),
        moneyValue(row.overtime_pay, currency),
      ])}
    />
  );
}

function AnomalyDetailTable({ rows }: { rows: ReportData["anomalyRows"] }) {
  return (
    <Table
      headers={["Nhân viên", "Ngày", "Bất thường", "Ảnh hưởng", "Mức độ", "Đơn vị"]}
      rows={rows.map((row) => [
        `${row.employee}\n${row.employee_code}`,
        dateValue(row.violation_date),
        anomalyLabel(row.violation_type),
        formatDurationMinutes(row.minutes_affected),
        statusLabel(row.severity),
        `${row.department || "—"}\n${row.branch || "—"}`,
      ])}
    />
  );
}

function LeaveTable({ rows }: { rows: ReportData["leaveRows"] }) {
  return (
    <Table
      headers={["Nhân viên", "Loại nghỉ", "Khoảng nghỉ", "Thời lượng", "Hưởng lương", "Trạng thái", "Xử lý"]}
      rows={rows.map((row) => [
        `${row.employee}\n${row.employee_code}`,
        row.leave_type,
        `${dateTime(row.starts_at)}\nđến ${dateTime(row.ends_at)}`,
        row.unit === "hour" ? formatDurationMinutes(row.amount * 60) : `${row.amount} ngày`,
        row.is_paid ? "Có" : "Không",
        statusLabel(row.status),
        row.reviewed_at ? dateTime(row.reviewed_at) : "Chưa xử lý",
      ])}
    />
  );
}

function TimesheetTable({ rows }: { rows: ReportData["timesheetRows"] }) {
  return (
    <Table
      headers={["Nhân viên", "Kỳ công", "Trạng thái", "Dự kiến", "Thực tế", "Tính công", "Break", "OT", "Điều chỉnh"]}
      rows={rows.map((row) => [
        `${row.employee}\n${row.employee_code}`,
        `${row.period}\n${dateValue(row.starts_on)}–${dateValue(row.ends_on)}`,
        statusLabel(row.status),
        formatDurationMinutes(row.scheduled_minutes),
        formatDurationMinutes(row.worked_minutes),
        formatDurationMinutes(row.regular_minutes),
        formatDurationMinutes(row.break_minutes),
        formatDurationMinutes(row.overtime_minutes),
        String(row.adjustments),
      ])}
    />
  );
}

function PayrollTable({ rows, currency }: { rows: ReportData["payrollRows"]; currency: string }) {
  return (
    <Table
      headers={["Nhân viên", "Kỳ lương", "Trạng thái", "Lương cơ bản", "Overtime", "Phụ cấp / thưởng", "Khấu trừ", "Thực nhận", "Còn lại"]}
      rows={rows.map((row) => [
        `${row.employee}\n${row.employee_code}`,
        `${row.period}\n${dateValue(row.starts_on)}–${dateValue(row.ends_on)}`,
        statusLabel(row.status),
        moneyValue(row.base_salary, row.currency_code || currency),
        moneyValue(row.overtime_pay, row.currency_code || currency),
        `${moneyValue(row.allowance_total, row.currency_code || currency)}\n+ ${moneyValue(row.bonus_total, row.currency_code || currency)} thưởng`,
        moneyValue(row.deduction_total, row.currency_code || currency),
        moneyValue(row.net_pay, row.currency_code || currency),
        moneyValue(row.balance_due, row.currency_code || currency),
      ])}
    />
  );
}

function DimensionTable({ rows }: { rows: ReportData["dimensions"] }) {
  return (
    <Table
      headers={["Đơn vị", "Nhân viên", "Giờ dự kiến", "Giờ thực tế", "Tỷ lệ đạt", "Overtime", "Đi muộn", "Vắng"]}
      rows={rows.map((row) => [
        row.name,
        String(row.employees),
        formatDurationMinutes(row.scheduled_minutes),
        formatDurationMinutes(row.worked_minutes),
        percent(row.worked_minutes, row.scheduled_minutes),
        formatDurationMinutes(row.overtime_minutes),
        formatDurationMinutes(row.late_minutes),
        String(row.absences),
      ])}
    />
  );
}

function PerformanceTable({ rows }: { rows: ReportData["performance"] }) {
  return (
    <Table
      headers={["Nhân viên", "Ca được phân", "Có mặt", "Đúng giờ", "Đủ giờ", "Overtime", "Bất thường"]}
      rows={rows.map((row) => [
        `${row.name}\n${row.employee_code}\n${row.department || "—"}`,
        String(row.shifts),
        `${row.present_shifts} · ${percent(row.present_shifts, row.shifts)}`,
        `${row.on_time_shifts} · ${percent(row.on_time_shifts, row.present_shifts)}`,
        `${row.sufficient_shifts} · ${percent(row.sufficient_shifts, row.present_shifts)}`,
        formatDurationMinutes(row.overtime_minutes),
        String(row.anomalies),
      ])}
    />
  );
}

function PlanActualTable({ rows }: { rows: ReportData["trend"] }) {
  return (
    <Table
      headers={["Ngày / chu kỳ", "Kế hoạch", "Thực tế", "Chênh lệch", "Tỷ lệ đạt", "Đánh giá"]}
      rows={rows.map((row) => [
        dateValue(row.key),
        formatDurationMinutes(row.planned),
        formatDurationMinutes(row.actual),
        signedDuration(row.actual - row.planned),
        percent(row.actual, row.planned),
        row.planned === 0 && row.actual > 0 ? "Phát sinh ngoài kế hoạch" : varianceNote(row.actual, row.planned),
      ])}
    />
  );
}

function PeriodTable({ rows }: { rows: ReportData["trend"] }) {
  return (
    <Table
      headers={["Chu kỳ bắt đầu", "Giờ dự kiến", "Giờ thực tế", "Chênh lệch", "Tỷ lệ đạt"]}
      rows={rows.map((row) => [
        dateValue(row.key),
        formatDurationMinutes(row.planned),
        formatDurationMinutes(row.actual),
        signedDuration(row.actual - row.planned),
        percent(row.actual, row.planned),
      ])}
    />
  );
}

function TrendChart({ rows }: { rows: ReportData["trend"] }) {
  const max = Math.max(1, ...rows.flatMap((row) => [row.planned, row.actual]));
  return (
    <section className="border border-line bg-surface p-4 shadow-panel sm:p-5">
      <div>
        <h2 className="text-sm font-extrabold">Kế hoạch và thực tế</h2>
        <p className="mt-1 text-xs text-muted">
          Giờ kế hoạch tính theo từng lượt nhân viên được phân ca.
        </p>
      </div>
      <div className="mt-5 overflow-x-auto">
        <div className="flex h-56 min-w-[720px] items-end gap-2 border-b border-line px-2">
          {rows.map((row) => (
            <div
              key={row.key}
              className="flex h-full min-w-8 flex-1 items-end justify-center gap-1"
            >
              <div
                title={`Dự kiến ${formatDurationMinutes(row.planned)}`}
                className="w-2.5 bg-line-strong"
                style={{ height: `${Math.max((row.planned / max) * 100, row.planned ? 1 : 0)}%` }}
              />
              <div
                title={`Thực tế ${formatDurationMinutes(row.actual)}`}
                className="w-2.5 bg-brand"
                style={{ height: `${Math.max((row.actual / max) * 100, row.actual ? 1 : 0)}%` }}
              />
            </div>
          ))}
        </div>
        <div className="mt-2 flex min-w-[720px] gap-2 px-2">
          {rows.map((row) => (
            <span
              key={row.key}
              className="min-w-8 flex-1 text-center text-[9px] text-muted"
            >
              {format(new Date(`${row.key}T12:00:00`), "dd/MM")}
            </span>
          ))}
        </div>
      </div>
      <div className="mt-4 flex gap-4 text-[10px] font-bold text-muted">
        <span>
          <i className="mr-1.5 inline-block size-2 bg-line-strong" />
          Dự kiến
        </span>
        <span>
          <i className="mr-1.5 inline-block size-2 bg-brand" />
          Thực tế
        </span>
      </div>
    </section>
  );
}

function Table({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <section className="overflow-hidden border border-line bg-surface shadow-panel">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-left">
          <thead>
            <tr className="border-b border-line bg-canvas/60">
              {headers.map((header) => (
                <th
                  key={header}
                  className="px-4 py-3 text-[10px] font-extrabold uppercase text-muted"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.length ? (
              rows.map((row, index) => (
                <tr key={index} className="hover:bg-canvas/30">
                  {row.map((cell, cellIndex) => (
                    <td
                      key={cellIndex}
                      className={cn(
                        "whitespace-pre-line px-4 py-3 text-xs",
                        cellIndex === 0 && "font-extrabold",
                      )}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={headers.length}
                  className="p-10 text-center text-sm text-muted"
                >
                  Không có dữ liệu trong kỳ
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Metric({ label, value, note, icon: Icon, tone }: MetricItem) {
  return (
    <div className="min-w-0 bg-surface p-3 sm:p-4">
      <span
        className={cn(
          "grid size-8 place-items-center bg-info-soft text-brand",
          tone === "warning" && "bg-warning-soft text-warning-strong",
        )}
      >
        <Icon className="size-4" />
      </span>
      <p className="mt-3 truncate text-[9px] font-extrabold uppercase text-muted sm:text-[10px]">
        {label}
      </p>
      <p className="mt-1 truncate font-mono text-lg font-bold sm:text-xl">
        {value}
      </p>
      <p className="mt-1 truncate text-[10px] text-muted sm:text-[11px]">
        {note}
      </p>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between px-5 py-4 text-sm">
      <span className="text-muted">{label}</span>
      <b className={value > 0 ? "text-warning-strong" : "text-success"}>
        {value}
      </b>
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
    <label className="bg-surface">
      <span className="block px-3 pt-2 text-[9px] font-extrabold uppercase text-muted">
        {label}
      </span>
      {children}
    </label>
  );
}

function Loading() {
  return (
    <div className="grid min-h-80 place-items-center border border-line bg-surface">
      <p className="flex items-center gap-2 text-sm font-bold text-muted">
        <LoaderCircle className="size-4 animate-spin" />
        Đang tổng hợp báo cáo...
      </p>
    </div>
  );
}

function DataState({ value }: { value: ReportData["dataState"] }) {
  const map = {
    live: "Dữ liệu đang cập nhật",
    provisional: "Dữ liệu tạm tính",
    locked_timesheet: "Đã có bảng công khóa",
  };
  return <span className="font-bold">{map[value]}</span>;
}

function dimensionMetrics(data: ReportData, kind: string): MetricItem[] {
  const rows = data.dimensions.filter((row) => row.kind === kind);
  const scheduled = rows.reduce((sum, row) => sum + row.scheduled_minutes, 0);
  const worked = rows.reduce((sum, row) => sum + row.worked_minutes, 0);
  return [
    { label: "Số đơn vị", value: String(rows.length), note: "Trong phạm vi được xem", icon: BarChart3 },
    { label: "Nhân viên", value: String(rows.reduce((sum, row) => sum + row.employees, 0)), note: "Theo đơn vị hiện tại", icon: UsersRound },
    { label: "Giờ thực tế", value: formatDurationMinutes(worked), note: `${formatDurationMinutes(scheduled)} dự kiến`, icon: Clock3 },
    { label: "Tỷ lệ đạt", value: percent(worked, scheduled), note: `${rows.reduce((sum, row) => sum + row.absences, 0)} lượt vắng`, icon: CheckCircle2 },
  ];
}

function performanceRate(
  rows: ReportData["performance"],
  numerator: "present_shifts" | "on_time_shifts",
  denominator: "shifts" | "present_shifts" = "shifts",
) {
  return percent(
    rows.reduce((sum, row) => sum + row[numerator], 0),
    rows.reduce((sum, row) => sum + row[denominator], 0),
  );
}

function turnover(employee: Record<string, number>) {
  const average =
    (Number(employee.headcount_start || 0) + Number(employee.headcount_end || 0)) /
    2;
  return average ? Math.round((Number(employee.terminated || 0) / average) * 1000) / 10 : 0;
}

function tenure(days: number) {
  if (days < 365) return `${Math.round(days)} ngày`;
  return `${Math.round((days / 365) * 10) / 10} năm`;
}

function dateValue(value: string | null) {
  return value ? format(new Date(`${value.slice(0, 10)}T12:00:00`), "dd/MM/yyyy") : "—";
}

function dateTime(value: string | null) {
  return value ? format(new Date(value), "dd/MM/yyyy HH:mm") : "—";
}

function timeValue(value: string | null) {
  return value ? format(new Date(value), "HH:mm:ss") : "—";
}

function moneyValue(value: number, currency: string) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: currency.trim() || "VND",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function percent(value: number, total: number) {
  return total ? `${Math.round((value / total) * 100)}%` : "0%";
}

function signedDuration(minutes: number) {
  if (!minutes) return formatDurationMinutes(0);
  return `${minutes > 0 ? "+" : "-"}${formatDurationMinutes(Math.abs(minutes))}`;
}

function varianceNote(actual: number, planned: number) {
  if (!planned && actual > 0) return "Phát sinh ngoài kế hoạch";
  if (actual === planned) return "Khớp kế hoạch";
  return actual > planned ? "Vượt kế hoạch" : "Thiếu so với kế hoạch";
}

function anomaly(data: ReportData, key: string) {
  return Number(data.anomalies.find((row) => row.key === key)?.value || 0);
}

function anomalyMinutes(data: ReportData, key: string) {
  return Number(data.anomalies.find((row) => row.key === key)?.minutes || 0);
}

function anomalyLabel(key: string) {
  return (
    {
      late: "Đi muộn",
      early_leave: "Về sớm",
      missing_check_in: "Thiếu check-in",
      missing_check_out: "Thiếu check-out",
      absence: "Vắng mặt",
      outside_geofence: "Ngoài khu vực",
      insufficient_hours: "Không đủ giờ",
      excessive_break: "Nghỉ quá thời gian",
      outside_schedule: "Ngoài lịch",
    } as Record<string, string>
  )[key] || key;
}

function statusLabel(value: string) {
  return (
    {
      active: "Đang làm",
      on_leave: "Tạm nghỉ",
      terminated: "Đã nghỉ việc",
      completed: "Hoàn chỉnh",
      open: "Đang mở",
      missing_check_in: "Thiếu check-in",
      missing_check_out: "Thiếu check-out",
      absent: "Vắng mặt",
      draft: "Nháp",
      pending: "Chờ duyệt",
      pending_approval: "Chờ duyệt",
      approved: "Đã duyệt",
      rejected: "Trả lại",
      locked: "Đã khóa",
      paid: "Đã trả",
      partially_paid: "Trả một phần",
      needs_review: "Cần kiểm tra",
      warning: "Cảnh báo",
      critical: "Nghiêm trọng",
      info: "Thông tin",
    } as Record<string, string>
  )[value] || value;
}

function coverageLabel(value: string) {
  return (
    {
      staffed: "Đủ người",
      understaffed: "Thiếu người",
      overstaffed: "Xếp vượt",
      unassigned: "Chưa phân người",
    } as Record<string, string>
  )[value] || value;
}
