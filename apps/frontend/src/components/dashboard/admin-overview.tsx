"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Building2,
  CalendarDays,
  Check,
  CircleDollarSign,
  Clock3,
  LoaderCircle,
  RefreshCw,
  Settings2,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getDashboard } from "@/lib/dashboard-api";

const steps = [
  [
    "branches",
    "Tạo chi nhánh",
    "Địa chỉ và GPS chấm công",
    "/admin/organization",
  ],
  [
    "departments",
    "Tạo phòng ban",
    "Cơ cấu đơn vị vận hành",
    "/admin/organization?view=departments",
  ],
  [
    "positions",
    "Tạo vị trí",
    "Chức danh để phân ca",
    "/admin/organization?view=positions",
  ],
  [
    "employees",
    "Thêm nhân viên",
    "Hồ sơ và tài khoản đăng nhập",
    "/admin/employees",
  ],
  [
    "shiftTemplates",
    "Tạo mẫu ca",
    "Khung giờ dùng thường xuyên",
    "/admin/schedule",
  ],
] as const;

export function AdminOverview() {
  const query = useQuery({
    queryKey: ["admin-dashboard"],
    queryFn: getDashboard,
    refetchInterval: (currentQuery) => currentQuery.state.data ? 60_000 : false,
  });
  if (query.isLoading)
    return (
      <div data-tour-status="loading" className="grid min-h-80 place-items-center">
        <LoaderCircle className="size-6 animate-spin text-brand" />
      </div>
    );
  if (!query.data) {
    const message = query.error instanceof Error
      ? query.error.message
      : "Không thể tải dữ liệu tổng quan.";
    const requiresSetup = message.toLocaleLowerCase("vi").includes("chưa được cấu hình");

    return (
      <section
        data-tour-status="blocked"
        className="mx-auto max-w-3xl border border-line bg-surface p-6 sm:p-8"
      >
        <div className={`grid size-11 place-items-center ${requiresSetup ? "bg-info-soft text-brand" : "bg-danger-soft text-danger"}`}>
          {requiresSetup ? <Settings2 className="size-5" /> : <RefreshCw className="size-5" />}
        </div>
        <h1 className="mt-5 text-xl font-black tracking-[-0.03em] sm:text-2xl">
          {requiresSetup ? "Chưa cấu hình doanh nghiệp" : "Không thể tải dữ liệu tổng quan"}
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-muted">
          {requiresSetup
            ? "Hãy thiết lập thông tin doanh nghiệp và chi nhánh trước khi sử dụng các chức năng vận hành."
            : message}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          {requiresSetup && (
            <Button asChild variant="brand">
              <Link href="/admin/organization">Thiết lập doanh nghiệp</Link>
            </Button>
          )}
          <Button variant="outline" onClick={() => query.refetch()} loading={query.isFetching} loadingText="Đang kiểm tra">
            <RefreshCw className="size-4" />
            Thử lại
          </Button>
        </div>
      </section>
    );
  }
  const data = query.data;
  const completed = steps.filter(([key]) => data.setup[key] > 0).length;
  const needsOnboarding = completed < steps.length;
  const pending = data.pending.leaveRequests + data.pending.timesheets;
  const coverage = data.today.required
    ? Math.min(
        100,
        Math.round((data.today.assigned / data.today.required) * 100),
      )
    : 0;
  const max = Math.max(
    ...data.chart.flatMap((item) => [item.planned, item.actual]),
    1,
  );
  return (
    <div data-tour-status="ready" className="mx-auto min-w-0 max-w-[1560px] space-y-5">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-brand">
            Tổng quan vận hành
          </p>
          <h1 className="mt-2 text-2xl font-black tracking-[-0.04em] sm:text-[30px]">
            Dữ liệu hôm nay
          </h1>
          <p className="mt-2 text-sm text-muted">
            Số liệu trực tiếp từ lịch, chấm công, nghỉ phép và bảng công.
          </p>
        </div>
        {!needsOnboarding && (
          <Button asChild variant="brand">
            <Link href="/admin/schedule">Mở lịch phân ca</Link>
          </Button>
        )}
      </header>
      {needsOnboarding && (
        <section className="border border-brand/25 bg-info-soft">
          <div className="flex flex-col gap-3 border-b border-brand/15 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-extrabold uppercase text-brand">
                Thiết lập lần đầu
              </p>
              <h2 className="mt-1 text-lg font-black">
                Hoàn thành {completed}/{steps.length} bước để bắt đầu vận hành
              </h2>
            </div>
            <p className="text-xs text-muted">
              Đi theo thứ tự để các form sau có đủ dữ liệu lựa chọn.
            </p>
          </div>
          <div className="grid gap-px bg-brand/10 md:grid-cols-5">
            {steps.map(([key, title, note, href], index) => {
              const done = data.setup[key] > 0;
              return (
                <Link
                  key={key}
                  href={href}
                  className="bg-surface p-4 hover:bg-canvas"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-black text-muted">
                      0{index + 1}
                    </span>
                    <span
                      className={
                        done
                          ? "grid size-5 place-items-center bg-success text-white"
                          : "grid size-5 place-items-center border border-line text-[10px] font-bold text-muted"
                      }
                    >
                      {done ? <Check className="size-3.5" /> : index + 1}
                    </span>
                  </div>
                  <p className="mt-4 text-sm font-extrabold">{title}</p>
                  <p className="mt-1 text-[11px] leading-5 text-muted">
                    {note}
                  </p>
                </Link>
              );
            })}
          </div>
        </section>
      )}
      <section className="grid gap-px border border-line bg-line sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          icon={UsersRound}
          label="Nhân viên"
          value={data.setup.employees}
          note={`${data.today.assigned} được phân ca hôm nay`}
        />
        <Metric
          icon={Clock3}
          label="Đang làm"
          value={data.today.working}
          note={`${data.today.missing} chưa check-in / vắng`}
        />
        <Metric
          icon={CalendarDays}
          label="Ca hôm nay"
          value={data.today.shifts}
          note={`${data.today.assigned}/${data.today.required} vị trí đã phân`}
        />
        <Metric
          icon={CircleDollarSign}
          label="Chờ xử lý"
          value={pending}
          note={`${data.pending.leaveRequests} nghỉ phép · ${data.pending.timesheets} bảng công`}
        />
      </section>
      <section className="grid gap-5 lg:grid-cols-[1.25fr_.75fr]">
        <article className="border border-line bg-surface">
          <header className="border-b border-line p-5">
            <h2 className="font-extrabold">Giờ dự kiến và thực tế</h2>
            <p className="mt-1 text-xs text-muted">
              7 ngày gần nhất, tính theo phút công.
            </p>
          </header>
          <div className="grid min-h-64 grid-cols-7 items-end gap-3 p-5">
            {data.chart.map((row) => (
              <div key={row.day} className="flex h-52 flex-col justify-end">
                <div className="flex flex-1 items-end justify-center gap-1">
                  <i
                    className="w-3 bg-[#9bb5d3]"
                    style={{ height: `${(row.planned / max) * 100}%` }}
                  />
                  <i
                    className="w-3 bg-brand"
                    style={{ height: `${(row.actual / max) * 100}%` }}
                  />
                </div>
                <p className="mt-2 text-center text-[9px] font-bold text-muted">
                  {new Date(`${row.day}T00:00:00`).toLocaleDateString("vi-VN", {
                    weekday: "short",
                  })}
                </p>
              </div>
            ))}
          </div>
        </article>
        <article className="border border-line bg-surface p-5">
          <Building2 className="size-5 text-brand" />
          <p className="mt-4 text-xs font-extrabold uppercase text-muted">
            Độ phủ ca hôm nay
          </p>
          <p className="mt-2 font-mono text-4xl font-black">{coverage}%</p>
          <div className="mt-4 h-2 bg-line">
            <div
              className="h-full bg-brand"
              style={{ width: `${coverage}%` }}
            />
          </div>
          <div className="mt-6 space-y-3 text-xs">
            <Row label="Nhu cầu" value={data.today.required} />
            <Row label="Đã phân" value={data.today.assigned} />
            <Row label="Bất thường" value={data.today.anomalies} />
          </div>
          {!data.today.shifts && (
            <p className="mt-6 bg-canvas p-3 text-xs leading-5 text-muted">
              Chưa có ca được công bố hôm nay. Dữ liệu sẽ xuất hiện sau khi hoàn
              tất thiết lập và công bố lịch.
            </p>
          )}
        </article>
      </section>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  note,
}: {
  icon: typeof UsersRound;
  label: string;
  value: number;
  note: string;
}) {
  return (
    <article className="bg-surface p-5">
      <Icon className="size-5 text-brand" />
      <p className="mt-4 font-mono text-3xl font-black">{value}</p>
      <p className="mt-2 text-sm font-extrabold">{label}</p>
      <p className="mt-1 text-[11px] text-muted">{note}</p>
    </article>
  );
}
function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between border-b border-line pb-3">
      <span className="text-muted">{label}</span>
      <b className="font-mono">{value}</b>
    </div>
  );
}
