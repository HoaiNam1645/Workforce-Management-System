"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addMonths, format, startOfMonth, endOfMonth } from "date-fns";
import {
  AlertTriangle,
  Banknote,
  Calculator,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Download,
  LoaderCircle,
  LockKeyhole,
  Plus,
  ReceiptText,
  RotateCcw,
  Search,
  Settings2,
  ShieldCheck,
  UsersRound,
  X,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { generateBusinessCode } from "@/lib/business-code";
import { getDashboard } from "@/lib/dashboard-api";
import {
  actOnPayrollPeriod,
  calculatePayrollPeriod,
  createPayrollPeriod,
  createSalaryRate,
  deletePayrollItem,
  exportPayrollPeriod,
  getEmployeePayroll,
  getPayrollPeriod,
  getPayrollPeriods,
  getPayrollRules,
  getSalaryHistory,
  getSalaryRates,
  recordPayrollPayment,
  reversePayrollPayment,
  savePayrollItem,
  savePayrollRule,
  type EmployeePayroll,
  type PayrollItem,
  type PayrollItemPayload,
  type PayrollPeriod,
  type PayrollRule,
  type PayrollRulePayload,
  type PayrollStatus,
  type SalaryRate,
} from "@/lib/payroll-api";
import { cn } from "@/lib/utils";

type View = "periods" | "salaries" | "rules";

export function PayrollDashboard() {
  const { hasPermission } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const view = (params.get("view") as View) || "periods";
  const search = params.get("search") ?? "";
  const status = params.get("status") ?? "all";
  const periodId = params.get("period");
  const [createOpen, setCreateOpen] = useState(false);
  const readiness = useQuery({
    queryKey: ["admin-dashboard"],
    queryFn: getDashboard,
  });
  const canCreatePeriod = Boolean(readiness.data?.setup.lockedTimesheets);
  const draftTimesheets = readiness.data?.setup.draftTimesheets ?? 0;
  const approvedTimesheets = readiness.data?.setup.approvedTimesheets ?? 0;
  const updateQuery = useCallback(
    (updates: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      Object.entries(updates).forEach(([key, value]) =>
        value && value !== "all" ? next.set(key, value) : next.delete(key),
      );
      router.replace(next.size ? `${pathname}?${next}` : pathname, {
        scroll: false,
      });
    },
    [params, pathname, router],
  );

  return (
    <div className="mx-auto w-full max-w-[1760px] space-y-5">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-brand">
            Quản lý tiền lương
          </p>
          <h1 className="mt-2 text-2xl font-black tracking-[-0.04em] sm:text-[30px]">
            Payroll và phiếu lương
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
            Tính lương từ bảng công đã khóa, kiểm tra sai lệch và theo dõi phê
            duyệt, khóa kỳ, thanh toán theo một luồng kiểm soát.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {view === "periods" && hasPermission("payroll.calculate") && (
            <Button
              variant="brand"
              disabled={!canCreatePeriod}
              title={
                !canCreatePeriod ? "Cần có bảng công đã khóa trước" : undefined
              }
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="size-4" />
              Tạo kỳ lương
            </Button>
          )}
          {view === "salaries" && hasPermission("employees.salary.manage") && (
            <Button variant="brand" onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" />
              Thiết lập mức lương
            </Button>
          )}
          {view === "rules" && hasPermission("payroll.calculate") && (
            <Button variant="brand" onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" />
              Thêm quy tắc
            </Button>
          )}
        </div>
      </header>
      {view === "periods" && readiness.data && !canCreatePeriod && (
        <div className="flex flex-col gap-3 border border-warning/30 bg-warning-soft p-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-extrabold text-warning-strong">
              Chưa có bảng công đã khóa
            </p>
            <p className="mt-1 text-xs text-warning-strong/80">
              {approvedTimesheets > 0
                ? `${approvedTimesheets} bảng công đã duyệt đang chờ khóa.`
                : draftTimesheets > 0
                  ? `${draftTimesheets} bảng công đang chờ duyệt.`
                  : "Chưa có bảng công được tổng hợp trong hệ thống."}
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => router.push("/admin/timesheets")}
          >
            Mở bảng công
            <ChevronRight className="size-4" />
          </Button>
        </div>
      )}
      <nav className="flex overflow-x-auto border-b border-line bg-surface px-2">
        {(
          [
            ["periods", "Kỳ lương", CalendarDays],
            ["salaries", "Mức lương", Banknote],
            ["rules", "Overtime & ngày lễ", Settings2],
          ] as const
        ).map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() =>
              updateQuery({
                view: key === "periods" ? null : key,
                period: null,
                search: null,
                status: null,
              })
            }
            className={cn(
              "flex h-12 shrink-0 items-center gap-2 border-b-2 px-4 text-sm font-bold",
              view === key
                ? "border-brand text-brand"
                : "border-transparent text-muted hover:text-ink",
            )}
          >
            <Icon className="size-4" />
            {label}
          </button>
        ))}
      </nav>
      {view === "periods" &&
        (periodId ? (
          <PeriodDetail
            id={periodId}
            search={search}
            status={status}
            updateQuery={updateQuery}
          />
        ) : (
          <Periods search={search} status={status} updateQuery={updateQuery} />
        ))}
      {view === "salaries" && (
        <Salaries search={search} updateQuery={updateQuery} />
      )}
      {view === "rules" && <Rules />}
      {createOpen && view === "periods" && (
        <PeriodForm close={() => setCreateOpen(false)} />
      )}
      {createOpen && view === "salaries" && (
        <SalaryForm close={() => setCreateOpen(false)} />
      )}
      {createOpen && view === "rules" && (
        <RuleForm close={() => setCreateOpen(false)} />
      )}
    </div>
  );
}

function Periods({
  search,
  status,
  updateQuery,
}: {
  search: string;
  status: string;
  updateQuery: (values: Record<string, string | null>) => void;
}) {
  const report = useQuery({
    queryKey: ["payroll-periods", search, status],
    queryFn: () =>
      getPayrollPeriods({
        search: search || undefined,
        status: status === "all" ? undefined : status,
      }),
  });
  return (
    <>
      <Summary
        cards={[
          [
            "Tổng kỳ lương",
            report.data?.summary.periods ?? 0,
            `${report.data?.summary.open ?? 0} kỳ đang xử lý`,
            CalendarDays,
          ],
          [
            "Cần kiểm tra",
            report.data?.summary.needsReview ?? 0,
            "Có lỗi chặn tính hoặc duyệt",
            AlertTriangle,
          ],
          [
            "Tổng thực nhận",
            money(report.data?.summary.netPay),
            "Theo dữ liệu đang lọc",
            CircleDollarSign,
          ],
          [
            "Đã thanh toán",
            money(report.data?.summary.paid),
            "Giao dịch đã ghi nhận",
            CheckCircle2,
          ],
        ]}
      />
      <Filters
        search={search}
        status={status}
        updateQuery={updateQuery}
        statusOptions={periodStatuses}
        placeholder="Mã hoặc tên kỳ lương..."
      />
      {report.isLoading ? (
        <Loading label="Đang tải kỳ lương..." />
      ) : report.isError ? (
        <ErrorBox error={report.error.message} retry={() => report.refetch()} />
      ) : report.data?.items.length ? (
        <section className="overflow-hidden border border-line bg-surface shadow-panel">
          <div className="hidden grid-cols-[1.2fr_1fr_140px_150px_150px_80px] gap-4 border-b border-line bg-canvas/60 px-5 py-3 text-[10px] font-extrabold uppercase text-muted lg:grid">
            <span>Kỳ lương</span>
            <span>Thời gian</span>
            <span>Nhân viên</span>
            <span>Thực nhận</span>
            <span>Trạng thái</span>
            <span />
          </div>
          <div className="divide-y divide-line">
            {report.data.items.map((period) => (
              <button
                key={period.id}
                onClick={() =>
                  updateQuery({ period: period.id, search: null, status: null })
                }
                className="grid w-full gap-3 p-4 text-left hover:bg-canvas/50 sm:p-5 lg:grid-cols-[1.2fr_1fr_140px_150px_150px_80px] lg:items-center"
              >
                <div>
                  <p className="text-sm font-extrabold">{period.name}</p>
                  <p className="mt-1 font-mono text-[10px] text-muted">
                    {period.code}
                  </p>
                </div>
                <Cell label="Thời gian">
                  <p className="text-xs font-bold">
                    {date(period.startsOn)} - {date(period.endsOn)}
                  </p>
                  <p className="mt-1 text-[10px] text-muted">
                    Trả dự kiến{" "}
                    {period.paymentDate ? date(period.paymentDate) : "chưa đặt"}
                  </p>
                </Cell>
                <Cell label="Nhân viên">
                  <p className="font-mono text-sm font-bold">
                    {period.employeeCount}
                  </p>
                  <p
                    className={cn(
                      "mt-1 text-[10px]",
                      period.issueCount ? "text-danger" : "text-muted",
                    )}
                  >
                    {period.issueCount} lỗi
                  </p>
                </Cell>
                <Cell label="Thực nhận">
                  <p className="font-mono text-sm font-bold">
                    {money(period.totals.netPay)}
                  </p>
                  <p className="mt-1 text-[10px] text-muted">
                    Còn {money(period.totals.balanceDue)}
                  </p>
                </Cell>
                <Cell label="Trạng thái">
                  <Status status={period.status} />
                </Cell>
                <ChevronRight className="hidden size-4 justify-self-end text-muted lg:block" />
              </button>
            ))}
          </div>
        </section>
      ) : (
        <Empty
          icon={ReceiptText}
          title="Chưa có kỳ lương"
          description="Tạo kỳ lương đầu tiên sau khi bảng công tương ứng đã được khóa."
        />
      )}
    </>
  );
}

function PeriodDetail({
  id,
  search,
  status,
  updateQuery,
}: {
  id: string;
  search: string;
  status: string;
  updateQuery: (values: Record<string, string | null>) => void;
}) {
  const { hasPermission } = useAuth();
  const qc = useQueryClient();
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [action, setAction] = useState<
    "submit" | "approve" | "return" | "lock" | "unlock" | null
  >(null);
  const report = useQuery({
    queryKey: ["payroll-period", id, search, status],
    queryFn: () =>
      getPayrollPeriod(id, {
        search: search || undefined,
        status: status === "all" ? undefined : status,
      }),
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["payroll-period", id] });
    qc.invalidateQueries({ queryKey: ["payroll-periods"] });
  };
  const calculate = useMutation({
    mutationFn: () => calculatePayrollPeriod(id),
    meta: { successMessage: "Đã tính lại kỳ lương" },
    onSuccess: refresh,
  });
  const exporting = useMutation({
    mutationFn: () => exportPayrollPeriod(id, report.data!.period.code),
    meta: { successMessage: "Đã xuất payroll CSV" },
  });
  const period = report.data?.period;
  return (
    <>
      {period && (
        <>
          <button
            className="text-xs font-bold text-brand hover:underline"
            onClick={() =>
              updateQuery({ period: null, search: null, status: null })
            }
          >
            ← Danh sách kỳ lương
          </button>
          <section className="border border-line bg-surface p-4 sm:p-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-black">{period.name}</h2>
                  <Status status={period.status} />
                </div>
                <p className="mt-1 text-xs text-muted">
                  {period.code} · {date(period.startsOn)} -{" "}
                  {date(period.endsOn)} · phiên tính #
                  {period.calculationVersion}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {hasPermission("payroll.calculate") &&
                  ["draft", "returned", "needs_review"].includes(
                    period.status,
                  ) && (
                    <Button
                      variant="outline"
                      loading={calculate.isPending}
                      loadingText="Đang tính"
                      onClick={() => calculate.mutate()}
                    >
                      <Calculator className="size-4" />
                      Tính lương
                    </Button>
                  )}
                {hasPermission("payroll.calculate") &&
                  ["draft", "returned"].includes(period.status) && (
                    <Button variant="brand" onClick={() => setAction("submit")}>
                      Gửi duyệt
                    </Button>
                  )}
                {hasPermission("payroll.approve") &&
                  period.status === "pending_approval" && (
                    <>
                      <Button
                        variant="outline"
                        onClick={() => setAction("return")}
                      >
                        Trả lại
                      </Button>
                      <Button
                        variant="brand"
                        onClick={() => setAction("approve")}
                      >
                        Duyệt kỳ
                      </Button>
                    </>
                  )}
                {hasPermission("payroll.lock") &&
                  period.status === "approved" && (
                    <Button variant="brand" onClick={() => setAction("lock")}>
                      <LockKeyhole className="size-4" />
                      Khóa & công bố
                    </Button>
                  )}
                {hasPermission("payroll.unlock") &&
                  period.status === "locked" && (
                    <Button
                      variant="outline"
                      onClick={() => setAction("unlock")}
                    >
                      <RotateCcw className="size-4" />
                      Mở khóa
                    </Button>
                  )}
                {hasPermission("payroll.export") && (
                  <Button
                    variant="outline"
                    loading={exporting.isPending}
                    onClick={() => exporting.mutate()}
                  >
                    <Download className="size-4" />
                    CSV
                  </Button>
                )}
              </div>
            </div>
            {period.returnReason && (
              <p className="mt-4 border-l-2 border-warning bg-warning-soft p-3 text-xs font-bold text-warning-strong">
                Lý do trả lại: {period.returnReason}
              </p>
            )}
          </section>
          <Summary
            cards={[
              [
                "Nhân viên",
                period.employeeCount,
                `${period.issueCount} bảng lương có lỗi`,
                UsersRound,
              ],
              [
                "Tổng thu nhập",
                money(period.totals.grossPay),
                "Trước khấu trừ",
                CircleDollarSign,
              ],
              [
                "Thực nhận",
                money(period.totals.netPay),
                `Khấu trừ ${money(period.totals.deductionTotal)}`,
                ReceiptText,
              ],
              [
                "Còn phải trả",
                money(period.totals.balanceDue),
                `Đã trả ${money(period.totals.paidTotal)}`,
                Banknote,
              ],
            ]}
          />
        </>
      )}
      <Filters
        search={search}
        status={status}
        updateQuery={updateQuery}
        statusOptions={employeeStatuses}
        placeholder="Tên hoặc mã nhân viên..."
      />
      {report.isLoading ? (
        <Loading label="Đang tải chi tiết kỳ lương..." />
      ) : report.isError ? (
        <ErrorBox error={report.error.message} retry={() => report.refetch()} />
      ) : report.data?.items.length ? (
        <section className="overflow-hidden border border-line bg-surface">
          <div className="hidden grid-cols-[1.3fr_110px_repeat(5,125px)_130px_44px] gap-3 border-b border-line bg-canvas/60 px-4 py-3 text-[9px] font-extrabold uppercase text-muted xl:grid">
            <span>Nhân viên</span>
            <span>Giờ/Lương</span>
            <span>Lương thường</span>
            <span>OT</span>
            <span>Phụ cấp + thưởng</span>
            <span>Khấu trừ</span>
            <span>Thực nhận</span>
            <span>Trạng thái</span>
            <span />
          </div>
          <div className="divide-y divide-line">
            {report.data.items.map((payroll) => (
              <button
                key={payroll.id}
                onClick={() => setEmployeeId(payroll.id)}
                className="grid w-full gap-3 p-4 text-left hover:bg-canvas/45 xl:grid-cols-[1.3fr_110px_repeat(5,125px)_130px_44px] xl:items-center"
              >
                <div>
                  <p className="text-sm font-extrabold">
                    {payroll.employee?.fullName}
                  </p>
                  <p className="mt-1 text-[10px] text-muted">
                    {payroll.employee?.employeeCode} ·{" "}
                    {payroll.employee?.department?.name ?? "Chưa có phòng ban"}
                  </p>
                  {Boolean(payroll.validationErrors.length) && (
                    <p className="mt-1 text-[10px] font-bold text-danger">
                      {payroll.validationErrors[0]}
                    </p>
                  )}
                </div>
                <Cell label="Loại lương">
                  <p className="text-xs font-bold">
                    {payroll.payType === "monthly"
                      ? "Cố định"
                      : payroll.payType === "hourly"
                        ? "Theo giờ"
                        : (payroll.payType ?? "Chưa có")}
                  </p>
                  <p className="mt-1 font-mono text-[10px] text-muted">
                    {money(payroll.baseRate)}
                  </p>
                </Cell>
                <MoneyCell label="Lương thường" value={payroll.regularPay} />
                <MoneyCell label="Overtime" value={payroll.overtimePay} />
                <MoneyCell
                  label="Phụ cấp + thưởng"
                  value={
                    Number(payroll.allowanceTotal) + Number(payroll.bonusTotal)
                  }
                />
                <MoneyCell
                  label="Khấu trừ"
                  value={payroll.deductionTotal}
                  danger
                />
                <MoneyCell label="Thực nhận" value={payroll.netPay} strong />
                <Cell label="Trạng thái">
                  <Status status={payroll.status} />
                </Cell>
                <ChevronRight className="hidden size-4 justify-self-end text-muted xl:block" />
              </button>
            ))}
          </div>
        </section>
      ) : (
        <Empty
          icon={Calculator}
          title="Chưa có bảng lương"
          description="Chọn Tính lương để lấy dữ liệu từ bảng công đã khóa."
        />
      )}
      {employeeId && (
        <PayrollDrawer
          id={employeeId}
          close={() => setEmployeeId(null)}
          refresh={refresh}
        />
      )}
      {action && period && (
        <PeriodActionModal
          period={period}
          action={action}
          close={() => setAction(null)}
          saved={() => {
            setAction(null);
            refresh();
          }}
        />
      )}
    </>
  );
}

function Salaries({
  search,
  updateQuery,
}: {
  search: string;
  updateQuery: (values: Record<string, string | null>) => void;
}) {
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [setupEmployeeId, setSetupEmployeeId] = useState<string | null>(null);
  const report = useQuery({
    queryKey: ["salary-rates", search],
    queryFn: () => getSalaryRates({ search: search || undefined }),
  });
  return (
    <>
      <Summary
        cards={[
          [
            "Nhân viên",
            report.data?.summary.employees ?? 0,
            "Trong phạm vi hiện tại",
            UsersRound,
          ],
          [
            "Đã cấu hình",
            report.data?.summary.configured ?? 0,
            `${report.data?.summary.missing ?? 0} người còn thiếu`,
            CheckCircle2,
          ],
          [
            "Lương theo giờ",
            report.data?.summary.hourly ?? 0,
            "Đơn giá theo giờ",
            Clock3,
          ],
          [
            "Lương cố định",
            report.data?.summary.monthly ?? 0,
            "Phân bổ theo công chuẩn",
            Banknote,
          ],
        ]}
      />
      <Filters
        search={search}
        status="all"
        updateQuery={updateQuery}
        placeholder="Tên hoặc mã nhân viên..."
      />
      {report.isLoading ? (
        <Loading label="Đang tải mức lương..." />
      ) : report.data?.items.length ? (
        <section className="overflow-hidden border border-line bg-surface">
          <div className="hidden grid-cols-[1.4fr_1fr_160px_180px_90px] gap-4 border-b border-line bg-canvas/60 px-5 py-3 text-[10px] font-extrabold uppercase text-muted lg:grid">
            <span>Nhân viên</span>
            <span>Đơn vị</span>
            <span>Loại lương</span>
            <span>Mức hiện tại</span>
            <span />
          </div>
          <div className="divide-y divide-line">
            {report.data.items.map(
              ({ employee, currentRate, historyCount }) => (
                <button
                  key={employee.id}
                  onClick={() =>
                    currentRate
                      ? setHistoryId(employee.id)
                      : setSetupEmployeeId(employee.id)
                  }
                  className="grid w-full gap-3 p-4 text-left hover:bg-canvas/45 sm:p-5 lg:grid-cols-[1.4fr_1fr_160px_180px_90px] lg:items-center"
                >
                  <div>
                    <p className="text-sm font-extrabold">
                      {employee.fullName}
                    </p>
                    <p className="mt-1 font-mono text-[10px] text-muted">
                      {employee.employeeCode}
                    </p>
                  </div>
                  <Cell label="Đơn vị">
                    <p className="text-xs font-bold">
                      {employee.department?.name ?? "Chưa có phòng ban"}
                    </p>
                    <p className="mt-1 text-[10px] text-muted">
                      {employee.branch?.name}
                    </p>
                  </Cell>
                  <Cell label="Loại lương">
                    {currentRate ? (
                      <Badge variant="info">
                        {currentRate.payType === "hourly"
                          ? "Theo giờ"
                          : "Cố định"}
                      </Badge>
                    ) : (
                      <Badge variant="danger">Thiếu mức lương</Badge>
                    )}
                  </Cell>
                  <Cell label="Mức hiện tại">
                    <p className="font-mono text-sm font-black">
                      {currentRate ? money(currentRate.baseRate) : "—"}
                    </p>
                    <p className="mt-1 text-[10px] text-muted">
                      {currentRate
                        ? `Từ ${date(currentRate.effectiveFrom)}`
                        : "Cần cấu hình"}
                    </p>
                  </Cell>
                  <span className="text-right text-[10px] font-bold text-muted">
                    {historyCount} bản ghi
                  </span>
                </button>
              ),
            )}
          </div>
        </section>
      ) : (
        <Empty
          icon={Banknote}
          title="Chưa có nhân viên phù hợp"
          description="Dữ liệu mức lương sẽ hiển thị theo hồ sơ nhân viên."
        />
      )}
      {historyId && (
        <SalaryHistory
          employeeId={historyId}
          close={() => setHistoryId(null)}
        />
      )}
      {setupEmployeeId && (
        <SalaryForm
          initialEmployeeId={setupEmployeeId}
          close={() => setSetupEmployeeId(null)}
        />
      )}
    </>
  );
}

function Rules() {
  const { hasPermission } = useAuth();
  const [editing, setEditing] = useState<PayrollRule | null>(null);
  const query = useQuery({
    queryKey: ["payroll-rules"],
    queryFn: getPayrollRules,
  });
  const active = query.data?.filter((item) => item.isActive).length ?? 0;
  return (
    <>
      <Summary
        cards={[
          [
            "Tổng quy tắc",
            query.data?.length ?? 0,
            `${active} đang áp dụng`,
            Settings2,
          ],
          [
            "Overtime",
            query.data?.filter((item) => item.ruleType === "overtime").length ??
              0,
            "Hệ số giờ làm thêm",
            Clock3,
          ],
          [
            "Ngày lễ / nghỉ",
            query.data?.filter((item) => item.ruleType === "holiday").length ??
              0,
            "Cách trả lương đặc biệt",
            CalendarDays,
          ],
          [
            "Trạng thái",
            query.data?.length && active === query.data.length
              ? "Đầy đủ"
              : "Cần rà soát",
            "Theo ngày hiệu lực",
            ShieldCheck,
          ],
        ]}
      />
      {query.isLoading ? (
        <Loading label="Đang tải quy tắc lương..." />
      ) : query.data?.length ? (
        <section className="grid gap-px border border-line bg-line lg:grid-cols-2">
          {query.data.map((rule) => (
            <article key={rule.id} className="bg-surface p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-extrabold">{rule.name}</h3>
                    <Badge variant={rule.isActive ? "success" : "neutral"}>
                      {rule.isActive ? "Đang dùng" : "Tạm ngưng"}
                    </Badge>
                  </div>
                  <p className="mt-1 font-mono text-[10px] text-muted">
                    {rule.code} · {rule.ruleType}
                  </p>
                </div>
                {hasPermission("payroll.calculate") && (
                  <button
                    onClick={() => setEditing(rule)}
                    className="grid size-8 place-items-center border border-line text-muted hover:text-brand"
                  >
                    <Settings2 className="size-4" />
                  </button>
                )}
              </div>
              <div className="mt-5 grid grid-cols-3 gap-px bg-line">
                <Metric label="Hệ số" value={`${Number(rule.multiplier)}x`} />
                <Metric label="Ưu tiên" value={rule.priority} />
                <Metric label="Hiệu lực" value={date(rule.effectiveFrom)} />
              </div>
            </article>
          ))}
        </section>
      ) : (
        <Empty
          icon={Settings2}
          title="Chưa có quy tắc payroll"
          description="Cấu hình hệ số overtime và ngày lễ trước khi tính kỳ có phát sinh các loại giờ này."
        />
      )}
      {editing && <RuleForm item={editing} close={() => setEditing(null)} />}
    </>
  );
}

function PayrollDrawer({
  id,
  close,
  refresh,
}: {
  id: string;
  close: () => void;
  refresh: () => void;
}) {
  const { hasPermission } = useAuth();
  const qc = useQueryClient();
  const [itemForm, setItemForm] = useState<PayrollItem | "new" | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const query = useQuery({
    queryKey: ["employee-payroll", id],
    queryFn: () => getEmployeePayroll(id),
  });
  const update = () => {
    qc.invalidateQueries({ queryKey: ["employee-payroll", id] });
    refresh();
  };
  const remove = useMutation({
    mutationFn: (itemId: string) => deletePayrollItem(id, itemId),
    meta: { successMessage: "Đã xóa khoản lương thủ công" },
    onSuccess: update,
  });
  const reverse = useMutation({
    mutationFn: ({
      paymentId,
      reason,
    }: {
      paymentId: string;
      reason: string;
    }) => reversePayrollPayment(id, paymentId, reason),
    meta: { successMessage: "Đã đảo giao dịch thanh toán" },
    onSuccess: update,
  });
  const payroll = query.data;
  const editable =
    payroll?.period &&
    ["draft", "returned", "needs_review"].includes(payroll.period.status);
  return (
    <Modal
      title={
        payroll
          ? `${payroll.employee?.fullName} · ${payroll.employee?.employeeCode}`
          : "Chi tiết bảng lương"
      }
      subtitle={
        payroll?.period
          ? `${payroll.period.name} · ${statusLabel(payroll.status)}`
          : "Đang tải dữ liệu"
      }
      close={close}
      wide
    >
      {query.isLoading ? (
        <Loading label="Đang tải bảng lương..." />
      ) : payroll ? (
        <div className="space-y-5">
          <div className="grid gap-px border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Tổng thu nhập" value={money(payroll.grossPay)} />
            <Metric label="Khấu trừ" value={money(payroll.deductionTotal)} />
            <Metric label="Thực nhận" value={money(payroll.netPay)} accent />
            <Metric label="Còn phải trả" value={money(payroll.balanceDue)} />
          </div>
          {Boolean(
            payroll.validationErrors.length ||
              payroll.validationWarnings.length,
          ) && (
            <section className="border border-warning/30 bg-warning-soft p-4">
              <p className="text-xs font-extrabold text-warning-strong">
                Kiểm tra dữ liệu
              </p>
              {payroll.validationErrors.map((item) => (
                <p key={item} className="mt-2 text-xs font-bold text-danger">
                  • {item}
                </p>
              ))}
              {payroll.validationWarnings.map((item) => (
                <p key={item} className="mt-2 text-xs text-warning-strong">
                  • {item}
                </p>
              ))}
            </section>
          )}
          <section className="border border-line">
            <header className="flex items-center justify-between border-b border-line p-4">
              <div>
                <h3 className="text-sm font-extrabold">Chi tiết khoản lương</h3>
                <p className="mt-1 text-[11px] text-muted">
                  Khoản hệ thống được tạo lại khi tính; khoản thủ công được giữ
                  nguyên.
                </p>
              </div>
              {editable && hasPermission("payroll.items.manage") && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setItemForm("new")}
                >
                  <Plus className="size-3.5" />
                  Thêm khoản
                </Button>
              )}
            </header>
            <div className="divide-y divide-line">
              {payroll.items?.map((item) => (
                <div
                  key={item.id}
                  className="grid gap-3 p-4 sm:grid-cols-[1fr_110px_140px_auto] sm:items-center"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xs font-extrabold">
                        {item.description}
                      </p>
                      <Badge
                        variant={
                          item.source === "manual" ? "warning" : "neutral"
                        }
                      >
                        {item.source === "manual" ? "Thủ công" : "Hệ thống"}
                      </Badge>
                    </div>
                    <p className="mt-1 font-mono text-[9px] text-muted">
                      {item.code}
                      {item.workDate ? ` · ${date(item.workDate)}` : ""}
                    </p>
                  </div>
                  <p className="text-[11px] text-muted">
                    {item.quantity} × {item.rate ? money(item.rate) : "—"}
                  </p>
                  <p
                    className={cn(
                      "font-mono text-sm font-black",
                      item.itemType === "deduction" && "text-danger",
                    )}
                  >
                    {item.itemType === "deduction" ? "−" : "+"}
                    {money(item.amount)}
                  </p>
                  <div className="flex gap-1">
                    {editable &&
                      item.source === "manual" &&
                      hasPermission("payroll.items.manage") && (
                        <>
                          <button
                            onClick={() => setItemForm(item)}
                            className="px-2 py-1 text-[10px] font-bold text-brand"
                          >
                            Sửa
                          </button>
                          <button
                            disabled={remove.isPending}
                            onClick={() =>
                              confirm("Xóa khoản lương thủ công này?") &&
                              remove.mutate(item.id)
                            }
                            className="px-2 py-1 text-[10px] font-bold text-danger"
                          >
                            Xóa
                          </button>
                        </>
                      )}
                  </div>
                </div>
              ))}
            </div>
          </section>
          <section className="border border-line">
            <header className="flex items-center justify-between border-b border-line p-4">
              <div>
                <h3 className="text-sm font-extrabold">Lịch sử thanh toán</h3>
                <p className="mt-1 text-[11px] text-muted">
                  Không xóa giao dịch; sai sót được ghi bằng thao tác đảo.
                </p>
              </div>
              {hasPermission("payroll.payment.record") &&
                ["locked", "partially_paid"].includes(payroll.status) &&
                Number(payroll.balanceDue) > 0 && (
                  <Button
                    size="sm"
                    variant="brand"
                    onClick={() => setPaymentOpen(true)}
                  >
                    <Banknote className="size-3.5" />
                    Ghi nhận trả
                  </Button>
                )}
            </header>
            {payroll.payments?.length ? (
              <div className="divide-y divide-line">
                {payroll.payments.map((payment) => (
                  <div
                    key={payment.id}
                    className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center"
                  >
                    <div className="flex-1">
                      <p className="font-mono text-sm font-black">
                        {money(payment.amount)}
                      </p>
                      <p className="mt-1 text-[10px] text-muted">
                        {format(new Date(payment.paidAt), "dd/MM/yyyy HH:mm")} ·{" "}
                        {payment.paymentMethod} ·{" "}
                        {payment.referenceNumber || "Không có mã tham chiếu"}
                      </p>
                      {payment.note && (
                        <p className="mt-1 text-[10px] text-muted">
                          {payment.note}
                        </p>
                      )}
                    </div>
                    <Badge
                      variant={
                        payment.status === "completed" ? "success" : "neutral"
                      }
                    >
                      {payment.status === "completed"
                        ? "Đã ghi nhận"
                        : "Đã đảo"}
                    </Badge>
                    {payment.status === "completed" &&
                      hasPermission("payroll.payment.record") && (
                        <button
                          onClick={() => {
                            const reason = prompt("Lý do đảo giao dịch");
                            if (reason?.trim())
                              reverse.mutate({ paymentId: payment.id, reason });
                          }}
                          className="text-[10px] font-bold text-danger"
                        >
                          Đảo giao dịch
                        </button>
                      )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="p-6 text-center text-xs text-muted">
                Chưa có giao dịch thanh toán.
              </p>
            )}
          </section>
          <details className="border border-line">
            <summary className="cursor-pointer p-4 text-xs font-extrabold">
              Dữ liệu nguồn và công thức
            </summary>
            <pre className="max-h-72 overflow-auto border-t border-line bg-canvas p-4 text-[10px] leading-5 text-muted">
              {JSON.stringify(
                {
                  salary: payroll.salarySnapshot,
                  timesheet: payroll.timesheetSnapshot,
                  calculation: payroll.calculationSnapshot,
                },
                null,
                2,
              )}
            </pre>
          </details>
        </div>
      ) : (
        <ErrorBox
          error={query.error?.message ?? "Không thể tải bảng lương"}
          retry={() => query.refetch()}
        />
      )}
      {itemForm && payroll && (
        <ItemForm
          payroll={payroll}
          item={itemForm === "new" ? null : itemForm}
          close={() => setItemForm(null)}
          saved={() => {
            setItemForm(null);
            update();
          }}
        />
      )}
      {paymentOpen && payroll && (
        <PaymentForm
          payroll={payroll}
          close={() => setPaymentOpen(false)}
          saved={() => {
            setPaymentOpen(false);
            update();
          }}
        />
      )}
    </Modal>
  );
}

function PeriodForm({ close }: { close: () => void }) {
  const qc = useQueryClient();
  const now = new Date();
  const from = format(startOfMonth(now), "yyyy-MM-dd");
  const to = format(endOfMonth(now), "yyyy-MM-dd");
  const [form, setForm] = useState({
    code: generateBusinessCode("KL"),
    name: `Lương tháng ${format(now, "MM/yyyy")}`,
    startsOn: from,
    endsOn: to,
    paymentDate: format(addMonths(startOfMonth(now), 1), "yyyy-MM-05"),
  });
  const mutation = useMutation({
    mutationFn: () => createPayrollPeriod(form),
    meta: { successMessage: "Đã tạo kỳ lương" },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payroll-periods"] });
      close();
    },
  });
  return (
    <Modal
      title="Tạo kỳ lương"
      subtitle="Khoảng kỳ phải khớp bảng công dự kiến dùng để tính"
      close={close}
    >
      <FormGrid>
        <Input label="Mã kỳ tự động" value={form.code} readOnly />
        <Input
          label="Tên kỳ"
          value={form.name}
          onChange={(value) => setForm({ ...form, name: value })}
        />
        <Input
          label="Từ ngày"
          type="date"
          value={form.startsOn}
          onChange={(value) => setForm({ ...form, startsOn: value })}
        />
        <Input
          label="Đến ngày"
          type="date"
          value={form.endsOn}
          onChange={(value) => setForm({ ...form, endsOn: value })}
        />
        <Input
          label="Ngày trả dự kiến"
          type="date"
          value={form.paymentDate}
          onChange={(value) => setForm({ ...form, paymentDate: value })}
        />
      </FormGrid>
      <FormActions
        mutation={mutation}
        close={close}
        valid={
          form.code.length >= 2 &&
          form.name.length >= 2 &&
          form.endsOn >= form.startsOn &&
          form.paymentDate >= form.endsOn
        }
        label="Tạo kỳ lương"
      />
    </Modal>
  );
}

function SalaryForm({
  close,
  initialEmployeeId = "",
}: {
  close: () => void;
  initialEmployeeId?: string;
}) {
  const qc = useQueryClient();
  const employees = useQuery({
    queryKey: ["salary-rates", ""],
    queryFn: () => getSalaryRates({}),
  });
  const [form, setForm] = useState({
    employeeId: initialEmployeeId,
    payType: "monthly" as "hourly" | "monthly",
    baseRate: 0,
    currencyCode: "VND",
    effectiveFrom: format(new Date(), "yyyy-MM-dd"),
    effectiveTo: "",
    note: "",
  });
  const mutation = useMutation({
    mutationFn: () =>
      createSalaryRate({ ...form, effectiveTo: form.effectiveTo || null }),
    meta: { successMessage: "Đã thiết lập mức lương" },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["salary-rates"] });
      close();
    },
  });
  return (
    <Modal
      title="Thiết lập mức lương"
      subtitle="Mỗi ngày chỉ có tối đa một mức lương hiệu lực"
      close={close}
    >
      <FormGrid>
        <Select
          label="Nhân viên"
          value={form.employeeId}
          onChange={(value) => setForm({ ...form, employeeId: value })}
          options={[
            ["", "Chọn nhân viên"],
            ...(employees.data?.items.map(
              (item) =>
                [
                  item.employee.id,
                  `${item.employee.employeeCode} · ${item.employee.fullName}`,
                ] as [string, string],
            ) ?? []),
          ]}
        />
        <Select
          label="Loại lương"
          value={form.payType}
          onChange={(value) =>
            setForm({ ...form, payType: value as "hourly" | "monthly" })
          }
          options={[
            ["hourly", "Theo giờ"],
            ["monthly", "Cố định theo tháng"],
          ]}
        />
        <Input
          label="Mức tiền"
          type="number"
          value={String(form.baseRate)}
          onChange={(value) => setForm({ ...form, baseRate: Number(value) })}
        />
        <Input
          label="Đồng tiền"
          value={form.currencyCode}
          onChange={(value) =>
            setForm({ ...form, currencyCode: value.toUpperCase() })
          }
        />
        <Input
          label="Hiệu lực từ"
          type="date"
          value={form.effectiveFrom}
          onChange={(value) => setForm({ ...form, effectiveFrom: value })}
        />
        <Input
          label="Hiệu lực đến (tùy chọn)"
          type="date"
          value={form.effectiveTo}
          onChange={(value) => setForm({ ...form, effectiveTo: value })}
        />
        <Input
          label="Lý do / ghi chú"
          value={form.note}
          onChange={(value) => setForm({ ...form, note: value })}
          wide
        />
      </FormGrid>
      <FormActions
        mutation={mutation}
        close={close}
        valid={Boolean(
          form.employeeId &&
            form.baseRate >= 0 &&
            form.effectiveFrom &&
            (!form.effectiveTo || form.effectiveTo >= form.effectiveFrom),
        )}
        label="Lưu mức lương"
      />
    </Modal>
  );
}

function RuleForm({ item, close }: { item?: PayrollRule; close: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<PayrollRulePayload>(
    item
      ? {
          code: item.code,
          name: item.name,
          ruleType: item.ruleType,
          multiplier: Number(item.multiplier),
          fixedAmount: item.fixedAmount ? Number(item.fixedAmount) : null,
          dayType: item.dayType,
          priority: item.priority,
          effectiveFrom: item.effectiveFrom,
          effectiveTo: item.effectiveTo,
          isActive: item.isActive,
          conditions: item.conditions,
        }
      : {
          code: generateBusinessCode("QT"),
          name: "",
          ruleType: "overtime",
          multiplier: 1.5,
          priority: 100,
          effectiveFrom: format(new Date(), "yyyy-MM-dd"),
          isActive: true,
        },
  );
  const mutation = useMutation({
    mutationFn: () => savePayrollRule(form, item?.id),
    meta: {
      successMessage: item
        ? "Đã cập nhật quy tắc lương"
        : "Đã tạo quy tắc lương",
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payroll-rules"] });
      close();
    },
  });
  return (
    <Modal
      title={item ? "Cập nhật quy tắc" : "Thêm quy tắc payroll"}
      subtitle="Quy tắc được snapshot khi tính để không làm thay đổi kỳ đã khóa"
      close={close}
    >
      <FormGrid>
        <Input label="Mã quy tắc tự động" value={form.code} readOnly />
        <Input
          label="Tên quy tắc"
          value={form.name}
          onChange={(value) => setForm({ ...form, name: value })}
        />
        <Select
          label="Loại"
          value={form.ruleType}
          onChange={(value) =>
            setForm({
              ...form,
              ruleType: value as PayrollRulePayload["ruleType"],
            })
          }
          options={[
            ["overtime", "Overtime"],
            ["holiday", "Ngày lễ / ngày nghỉ"],
            ["allowance", "Phụ cấp"],
          ]}
        />
        <Input
          label="Hệ số"
          type="number"
          value={String(form.multiplier)}
          onChange={(value) => setForm({ ...form, multiplier: Number(value) })}
        />
        <Input
          label="Mức cố định (tùy chọn)"
          type="number"
          value={String(form.fixedAmount ?? "")}
          onChange={(value) =>
            setForm({ ...form, fixedAmount: value ? Number(value) : null })
          }
        />
        <Input
          label="Độ ưu tiên"
          type="number"
          value={String(form.priority ?? 100)}
          onChange={(value) => setForm({ ...form, priority: Number(value) })}
        />
        <Input
          label="Hiệu lực từ"
          type="date"
          value={form.effectiveFrom}
          onChange={(value) => setForm({ ...form, effectiveFrom: value })}
        />
        <Input
          label="Hiệu lực đến"
          type="date"
          value={form.effectiveTo ?? ""}
          onChange={(value) => setForm({ ...form, effectiveTo: value || null })}
        />
      </FormGrid>
      <label className="mt-4 flex items-center gap-2 text-xs font-bold">
        <input
          type="checkbox"
          checked={form.isActive}
          onChange={(event) =>
            setForm({ ...form, isActive: event.target.checked })
          }
        />
        Đang áp dụng
      </label>
      <FormActions
        mutation={mutation}
        close={close}
        valid={
          form.code.length >= 2 &&
          form.name.length >= 2 &&
          form.multiplier >= 0 &&
          Boolean(form.effectiveFrom)
        }
        label="Lưu quy tắc"
      />
    </Modal>
  );
}

function ItemForm({
  payroll,
  item,
  close,
  saved,
}: {
  payroll: EmployeePayroll;
  item: PayrollItem | null;
  close: () => void;
  saved: () => void;
}) {
  const [form, setForm] = useState<PayrollItemPayload>(
    item
      ? {
          itemType: item.itemType,
          code: item.code,
          description: item.description,
          quantity: Number(item.quantity),
          rate: item.rate ? Number(item.rate) : null,
          amount: Number(item.amount),
          workDate: item.workDate,
          reason: String(item.ruleSnapshot?.reason ?? ""),
        }
      : {
          itemType: "allowance",
          code: generateBusinessCode("KM"),
          description: "",
          quantity: 1,
          amount: 0,
          reason: "",
        },
  );
  const mutation = useMutation({
    mutationFn: () => savePayrollItem(payroll.id, form, item?.id),
    meta: {
      successMessage: item ? "Đã cập nhật khoản lương" : "Đã thêm khoản lương",
    },
    onSuccess: saved,
  });
  return (
    <NestedModal
      title={item ? "Sửa khoản lương thủ công" : "Thêm khoản lương thủ công"}
      close={close}
    >
      <FormGrid>
        <Select
          label="Loại khoản"
          value={form.itemType}
          onChange={(value) =>
            setForm({
              ...form,
              itemType: value as PayrollItemPayload["itemType"],
            })
          }
          options={[
            ["earning", "Thu nhập khác"],
            ["allowance", "Phụ cấp"],
            ["bonus", "Thưởng"],
            ["deduction", "Khấu trừ"],
          ]}
        />
        <Input label="Mã khoản tự động" value={form.code} readOnly />
        <Input
          label="Mô tả"
          value={form.description}
          onChange={(value) => setForm({ ...form, description: value })}
          wide
        />
        <Input
          label="Số lượng"
          type="number"
          value={String(form.quantity ?? 1)}
          onChange={(value) => setForm({ ...form, quantity: Number(value) })}
        />
        <Input
          label="Đơn giá"
          type="number"
          value={String(form.rate ?? "")}
          onChange={(value) =>
            setForm({ ...form, rate: value ? Number(value) : null })
          }
        />
        <Input
          label="Thành tiền"
          type="number"
          value={String(form.amount)}
          onChange={(value) => setForm({ ...form, amount: Number(value) })}
        />
        <Input
          label="Ngày phát sinh"
          type="date"
          value={form.workDate ?? ""}
          onChange={(value) => setForm({ ...form, workDate: value || null })}
        />
        <Input
          label="Lý do / căn cứ"
          value={form.reason}
          onChange={(value) => setForm({ ...form, reason: value })}
          wide
        />
      </FormGrid>
      <FormActions
        mutation={mutation}
        close={close}
        valid={
          form.code.length >= 2 &&
          form.description.length >= 2 &&
          form.amount >= 0 &&
          form.reason.length >= 3
        }
        label="Lưu khoản lương"
      />
    </NestedModal>
  );
}

function PaymentForm({
  payroll,
  close,
  saved,
}: {
  payroll: EmployeePayroll;
  close: () => void;
  saved: () => void;
}) {
  const [form, setForm] = useState({
    amount: Number(payroll.balanceDue),
    paidAt: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
    paymentMethod: "bank_transfer",
    referenceNumber: "",
    note: "",
  });
  const mutation = useMutation({
    mutationFn: () =>
      recordPayrollPayment(payroll.id, {
        ...form,
        paidAt: new Date(form.paidAt).toISOString(),
      }),
    meta: { successMessage: "Đã ghi nhận thanh toán" },
    onSuccess: saved,
  });
  return (
    <NestedModal title="Ghi nhận trả lương" close={close}>
      <p className="mb-4 border-l-2 border-brand bg-info-soft p-3 text-xs">
        Còn phải trả: <b className="font-mono">{money(payroll.balanceDue)}</b>
      </p>
      <FormGrid>
        <Input
          label="Số tiền"
          type="number"
          value={String(form.amount)}
          onChange={(value) => setForm({ ...form, amount: Number(value) })}
        />
        <Input
          label="Thời điểm trả"
          type="datetime-local"
          value={form.paidAt}
          onChange={(value) => setForm({ ...form, paidAt: value })}
        />
        <Select
          label="Phương thức"
          value={form.paymentMethod}
          onChange={(value) => setForm({ ...form, paymentMethod: value })}
          options={[
            ["bank_transfer", "Chuyển khoản"],
            ["cash", "Tiền mặt"],
            ["other", "Khác"],
          ]}
        />
        <Input
          label="Mã tham chiếu"
          value={form.referenceNumber}
          onChange={(value) => setForm({ ...form, referenceNumber: value })}
        />
        <Input
          label="Ghi chú"
          value={form.note}
          onChange={(value) => setForm({ ...form, note: value })}
          wide
        />
      </FormGrid>
      <FormActions
        mutation={mutation}
        close={close}
        valid={
          form.amount > 0 &&
          form.amount <= Number(payroll.balanceDue) &&
          Boolean(form.paidAt && form.paymentMethod)
        }
        label="Ghi nhận thanh toán"
      />
    </NestedModal>
  );
}

function PeriodActionModal({
  period,
  action,
  close,
  saved,
}: {
  period: PayrollPeriod;
  action: "submit" | "approve" | "return" | "lock" | "unlock";
  close: () => void;
  saved: () => void;
}) {
  const [reason, setReason] = useState("");
  const labels = {
    submit: "Gửi duyệt",
    approve: "Duyệt kỳ lương",
    return: "Trả lại kỳ lương",
    lock: "Khóa và công bố",
    unlock: "Mở khóa kỳ lương",
  };
  const mutation = useMutation({
    mutationFn: () => actOnPayrollPeriod(period.id, action, reason),
    meta: { successMessage: `Đã ${labels[action].toLowerCase()}` },
    onSuccess: saved,
  });
  const required = ["return", "unlock"].includes(action);
  return (
    <Modal
      title={labels[action]}
      subtitle={`${period.name} · ${period.code}`}
      close={close}
    >
      <p className="border-l-2 border-brand bg-info-soft p-4 text-xs leading-5">
        {action === "lock"
          ? "Sau khi khóa, phiếu lương được công bố cho nhân viên và dữ liệu không thể sửa trực tiếp."
          : action === "unlock"
            ? "Chỉ có thể mở khóa khi chưa phát sinh bất kỳ thanh toán nào."
            : "Thao tác được ghi vào lịch sử kỳ lương và audit log."}
      </p>
      <label className="mt-4 block">
        <span className="mb-2 block text-[10px] font-extrabold uppercase text-muted">
          {required ? "Lý do bắt buộc" : "Ghi chú"}
        </span>
        <textarea
          rows={4}
          className="w-full border border-line p-3 text-sm outline-none focus:border-brand"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
      <FormActions
        mutation={mutation}
        close={close}
        valid={!required || reason.trim().length >= 3}
        label={labels[action]}
      />
    </Modal>
  );
}

function SalaryHistory({
  employeeId,
  close,
}: {
  employeeId: string;
  close: () => void;
}) {
  const query = useQuery({
    queryKey: ["salary-history", employeeId],
    queryFn: () => getSalaryHistory(employeeId),
  });
  return (
    <Modal
      title={query.data?.employee.fullName ?? "Lịch sử mức lương"}
      subtitle={query.data?.employee.employeeCode ?? "Theo ngày hiệu lực"}
      close={close}
    >
      {query.isLoading ? (
        <Loading label="Đang tải lịch sử..." />
      ) : query.isError ? (
        <div className="p-5">
          <ErrorBox
            error={query.error.message}
            retry={() => query.refetch()}
          />
        </div>
      ) : !query.data?.items.length ? (
        <div className="p-5">
          <Empty
            icon={Banknote}
            title="Chưa có lịch sử mức lương"
            description="Nhân viên này chưa được thiết lập mức lương. Hãy đóng cửa sổ và chọn lại nhân viên để bắt đầu cấu hình."
          />
        </div>
      ) : (
        <div className="divide-y divide-line border border-line">
          {query.data?.items.map((rate: SalaryRate) => (
            <div
              key={rate.id}
              className="grid gap-3 p-4 sm:grid-cols-[1fr_150px_180px]"
            >
              <div>
                <p className="text-xs font-extrabold">
                  {rate.payType === "hourly"
                    ? "Lương theo giờ"
                    : "Lương cố định"}
                </p>
                <p className="mt-1 text-[10px] text-muted">
                  {rate.note || "Không có ghi chú"}
                </p>
              </div>
              <p className="font-mono text-sm font-black">
                {money(rate.baseRate)}
              </p>
              <p className="text-xs text-muted">
                {date(rate.effectiveFrom)} →{" "}
                {rate.effectiveTo ? date(rate.effectiveTo) : "Hiện tại"}
              </p>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

const periodStatuses: Array<[string, string]> = [
  ["all", "Tất cả trạng thái"],
  ["draft", "Nháp"],
  ["needs_review", "Cần kiểm tra"],
  ["pending_approval", "Chờ duyệt"],
  ["approved", "Đã duyệt"],
  ["locked", "Đã khóa"],
  ["partially_paid", "Trả một phần"],
  ["paid", "Đã trả"],
];
const employeeStatuses: Array<[string, string]> = [
  ["all", "Tất cả trạng thái"],
  ["calculated", "Đã tính"],
  ["needs_review", "Cần kiểm tra"],
  ["approved", "Đã duyệt"],
  ["locked", "Đã khóa"],
  ["partially_paid", "Trả một phần"],
  ["paid", "Đã trả"],
];
function Filters({
  search,
  status,
  updateQuery,
  statusOptions,
  placeholder,
}: {
  search: string;
  status: string;
  updateQuery: (values: Record<string, string | null>) => void;
  statusOptions?: Array<[string, string]>;
  placeholder: string;
}) {
  return (
    <section className="grid gap-px border border-line bg-line md:grid-cols-[1fr_260px]">
      <label className="relative bg-surface p-3">
        <span className="mb-1.5 block text-[9px] font-extrabold uppercase text-muted">
          Tìm kiếm
        </span>
        <Search className="absolute bottom-5 left-6 size-4 text-muted" />
        <input
          className="input border-0 pl-9"
          value={search}
          onChange={(event) =>
            updateQuery({ search: event.target.value || null })
          }
          placeholder={placeholder}
        />
      </label>
      {statusOptions && (
        <label className="bg-surface p-3">
          <span className="mb-1.5 block text-[9px] font-extrabold uppercase text-muted">
            Trạng thái
          </span>
          <select
            className="input border-0"
            value={status}
            onChange={(event) => updateQuery({ status: event.target.value })}
          >
            {statusOptions.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      )}
    </section>
  );
}
function Summary({
  cards,
}: {
  cards: Array<[string, string | number, string, typeof CalendarDays]>;
}) {
  return (
    <section className="grid gap-px border border-line bg-line sm:grid-cols-2 xl:grid-cols-4">
      {cards.map(([label, value, note, Icon]) => (
        <div key={label} className="bg-surface p-4 sm:p-5">
          <Icon className="size-5 text-brand" />
          <p className="mt-4 text-[10px] font-extrabold uppercase tracking-[0.12em] text-muted">
            {label}
          </p>
          <p className="mt-1 font-mono text-2xl font-black">{value}</p>
          <p className="mt-1 text-[11px] text-muted">{note}</p>
        </div>
      ))}
    </section>
  );
}
function Status({ status }: { status: string }) {
  const tone = ["paid", "locked", "approved", "calculated"].includes(status)
    ? "success"
    : ["needs_review", "returned", "partially_paid"].includes(status)
      ? "warning"
      : status === "cancelled"
        ? "danger"
        : "info";
  return <Badge variant={tone}>{statusLabel(status)}</Badge>;
}
function statusLabel(status: string) {
  return (
    (
      {
        draft: "Nháp",
        calculating: "Đang tính",
        needs_review: "Cần kiểm tra",
        pending_approval: "Chờ duyệt",
        approved: "Đã duyệt",
        returned: "Trả lại",
        locked: "Đã khóa",
        partially_paid: "Trả một phần",
        paid: "Đã trả",
        cancelled: "Đã hủy",
        calculated: "Đã tính",
        void: "Vô hiệu",
      } as Record<string, string>
    )[status] ?? status
  );
}
function Cell({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <span className="mb-1 block text-[9px] font-extrabold uppercase text-muted lg:hidden">
        {label}
      </span>
      {children}
    </div>
  );
}
function MoneyCell({
  label,
  value,
  danger,
  strong,
}: {
  label: string;
  value: string | number;
  danger?: boolean;
  strong?: boolean;
}) {
  return (
    <Cell label={label}>
      <p
        className={cn(
          "font-mono text-xs font-bold",
          danger && Number(value) > 0 && "text-danger",
          strong && "text-sm font-black text-brand",
        )}
      >
        {money(value)}
      </p>
    </Cell>
  );
}
function Metric({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: boolean;
}) {
  return (
    <div className="bg-surface p-3">
      <p className="text-[9px] font-extrabold uppercase text-muted">{label}</p>
      <p
        className={cn(
          "mt-1 font-mono text-sm font-black",
          accent && "text-brand",
        )}
      >
        {value}
      </p>
    </div>
  );
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
          wide ? "sm:max-w-6xl" : "sm:max-w-2xl",
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
function NestedModal({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-ink/50 p-4">
      <button className="absolute inset-0" onClick={close} />
      <section className="relative z-10 max-h-[90vh] w-full max-w-2xl overflow-auto border border-line bg-surface shadow-2xl">
        <header className="flex items-center justify-between border-b border-line p-4">
          <h3 className="font-black">{title}</h3>
          <button onClick={close}>
            <X className="size-4" />
          </button>
        </header>
        <div className="p-5">{children}</div>
      </section>
    </div>
  );
}
function FormGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2">{children}</div>;
}
function Input({
  label,
  value,
  onChange,
  type = "text",
  wide,
  readOnly,
}: {
  label: string;
  value: string;
  onChange?: (value: string) => void;
  type?: string;
  wide?: boolean;
  readOnly?: boolean;
}) {
  return (
    <label className={cn("block", wide && "sm:col-span-2")}>
      <span className="mb-2 block text-[10px] font-extrabold uppercase text-muted">
        {label}
      </span>
      <input
        type={type}
        value={value}
        readOnly={readOnly}
        onChange={(event) => onChange?.(event.target.value)}
        className={cn(
          "input",
          readOnly && "bg-canvas font-mono font-bold text-brand",
        )}
      />
    </label>
  );
}
function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
}) {
  return (
    <label>
      <span className="mb-2 block text-[10px] font-extrabold uppercase text-muted">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="input"
      >
        {options.map(([key, name]) => (
          <option key={key} value={key}>
            {name}
          </option>
        ))}
      </select>
    </label>
  );
}
function FormActions({
  mutation,
  close,
  valid,
  label,
}: {
  mutation: {
    isPending: boolean;
    isError: boolean;
    error: Error | null;
    mutate: () => void;
  };
  close: () => void;
  valid: boolean;
  label: string;
}) {
  return (
    <>
      {mutation.isError && (
        <p className="mt-4 border border-danger/20 bg-danger-soft p-3 text-xs font-bold text-danger">
          {mutation.error?.message}
        </p>
      )}
      <div className="mt-5 flex justify-end gap-2 border-t border-line pt-4">
        <Button variant="outline" disabled={mutation.isPending} onClick={close}>
          Hủy
        </Button>
        <Button
          variant="brand"
          disabled={!valid}
          loading={mutation.isPending}
          loadingText="Đang xử lý"
          onClick={() => mutation.mutate()}
        >
          {label}
        </Button>
      </div>
    </>
  );
}
function Loading({ label }: { label: string }) {
  return (
    <div className="grid min-h-64 place-items-center border border-line bg-surface">
      <span className="flex items-center gap-2 text-sm font-bold text-muted">
        <LoaderCircle className="size-5 animate-spin text-brand" />
        {label}
      </span>
    </div>
  );
}
function ErrorBox({ error, retry }: { error: string; retry: () => void }) {
  return (
    <div className="border border-danger/20 bg-danger-soft p-8 text-center">
      <AlertTriangle className="mx-auto size-5 text-danger" />
      <p className="mt-3 text-sm font-bold text-danger">{error}</p>
      <Button className="mt-4" size="sm" variant="outline" onClick={retry}>
        Thử lại
      </Button>
    </div>
  );
}
function Empty({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof ReceiptText;
  title: string;
  description: string;
}) {
  return (
    <div className="border border-line bg-surface p-14 text-center">
      <Icon className="mx-auto size-7 text-muted" />
      <p className="mt-3 text-sm font-extrabold">{title}</p>
      <p className="mt-1 text-xs text-muted">{description}</p>
    </div>
  );
}
function money(value: string | number | undefined) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(Number(value ?? 0));
}
function date(value: string) {
  return format(new Date(`${value}T00:00:00`), "dd/MM/yyyy");
}
