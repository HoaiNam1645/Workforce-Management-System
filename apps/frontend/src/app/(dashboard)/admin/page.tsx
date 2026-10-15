import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CalendarCheck2,
  Check,
  Clock3,
  MoreHorizontal,
  ShieldAlert,
  TrendingUp,
  UserRoundCheck,
  UsersRound,
} from 'lucide-react';
import { ApprovalsTable } from '@/components/dashboard/approvals-table';
import { WorkforceChart } from '@/components/dashboard/workforce-chart';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const metrics = [
  {
    title: 'Nhân sự hôm nay',
    value: '128',
    detail: '124 đã xếp ca',
    trend: '+4.2%',
    positive: true,
    icon: UsersRound,
    accent: 'bg-success-soft text-success',
  },
  {
    title: 'Đang làm việc',
    value: '94',
    detail: '73% lực lượng',
    trend: '+8 người',
    positive: true,
    icon: UserRoundCheck,
    accent: 'bg-info-soft text-info',
  },
  {
    title: 'Chờ xử lý',
    value: '12',
    detail: '7 nghỉ phép · 5 công',
    trend: 'Cần duyệt',
    positive: false,
    icon: CalendarCheck2,
    accent: 'bg-warning-soft text-warning-strong',
  },
  {
    title: 'Chi phí tuần',
    value: '186,4tr',
    detail: 'Ngân sách 204tr',
    trend: '-3.1%',
    positive: true,
    icon: TrendingUp,
    accent: 'bg-[#edf5ff] text-brand',
  },
];

const shifts = [
  { name: 'Minh Anh', role: 'Thu ngân', time: '08:00 – 16:00', color: '#dff3ed', initials: 'MA', status: 'Đang làm' },
  { name: 'Quang Huy', role: 'Kho vận', time: '09:00 – 17:00', color: '#dceaff', initials: 'QH', status: 'Đang nghỉ' },
  { name: 'Hoàng Lan', role: 'Trưởng ca', time: '12:00 – 20:00', color: '#fff0cc', initials: 'HL', status: 'Sắp vào ca' },
  { name: 'Tuấn Kiệt', role: 'Bán hàng', time: '14:00 – 22:00', color: '#e8e5ff', initials: 'TK', status: 'Sắp vào ca' },
];

const exceptions = [
  { employee: 'Ngọc Hà', issue: 'Đi muộn 18 phút', time: '08:18', tone: 'danger' as const },
  { employee: 'Văn Long', issue: 'Check-in ngoài khu vực', time: '09:02', tone: 'warning' as const },
  { employee: 'Hải Yến', issue: 'Thiếu check-out hôm qua', time: 'Hôm qua', tone: 'info' as const },
];

export default function AdminDashboardPage() {
  return (
    <div className="mx-auto min-w-0 max-w-[1560px] space-y-6">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span className="size-2 rounded-full bg-success shadow-[0_0_0_5px_rgba(11,143,112,0.11)]" />
            <p className="text-xs font-bold text-success">Hoạt động bình thường</p>
          </div>
          <h1 className="text-2xl font-black tracking-[-0.045em] sm:text-[30px]">Chào buổi sáng, Anh.</h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted">
            Có 12 yêu cầu cần xử lý và 3 ngoại lệ chấm công trong ngày hôm nay.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline">Xuất báo cáo</Button>
          <Button variant="brand">+ Phân ca nhanh</Button>
        </div>
      </section>

      <section className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric, index) => {
          const Icon = metric.icon;
          const TrendIcon = metric.positive ? ArrowUpRight : ArrowDownRight;
          return (
            <article
              key={metric.title}
              className="animate-rise min-w-0 rounded-lg border border-line bg-surface p-5 shadow-panel"
              style={{ animationDelay: `${index * 70}ms` }}
            >
              <div className="flex items-center justify-between">
                <div className={`grid size-10 place-items-center rounded-md ${metric.accent}`}>
                  <Icon className="size-[18px]" />
                </div>
                <span className={`inline-flex items-center gap-1 text-[11px] font-extrabold ${metric.positive ? 'text-success' : 'text-brand'}`}>
                  <TrendIcon className="size-3.5" /> {metric.trend}
                </span>
              </div>
              <p className="mt-5 font-mono text-[28px] font-semibold leading-none tracking-[-0.055em]">{metric.value}</p>
              <div className="mt-3 flex min-w-0 items-center justify-between gap-3">
                <p className="shrink-0 text-sm font-extrabold">{metric.title}</p>
                <p className="truncate text-[11px] text-muted">{metric.detail}</p>
              </div>
            </article>
          );
        })}
      </section>

      <section className="grid min-w-0 gap-6 xl:grid-cols-[1.45fr_0.75fr]">
        <article className="overflow-hidden rounded-lg border border-line bg-surface shadow-panel">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
            <div>
              <h2 className="text-base font-extrabold tracking-[-0.02em]">Lịch làm việc hôm nay</h2>
              <p className="mt-1 text-xs text-muted">Thứ Sáu, 10/10 · Chi nhánh trung tâm</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="success">94 đang làm</Badge>
              <button className="grid size-8 place-items-center rounded-md text-muted hover:bg-canvas">
                <MoreHorizontal className="size-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 border-b border-line bg-canvas/55 px-4 sm:px-6">
            {['T2 06', 'T3 07', 'T4 08', 'T5 09', 'T6 10', 'T7 11', 'CN 12'].map((day) => (
              <button
                key={day}
                className={`relative py-3 text-center text-[11px] font-extrabold ${day === 'T6 10' ? 'text-ink' : 'text-muted'}`}
              >
                {day}
                {day === 'T6 10' && <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-brand" />}
              </button>
            ))}
          </div>

          <div className="divide-y divide-line/75 px-5 sm:px-6">
            {shifts.map((shift) => (
              <div key={shift.name} className="grid items-center gap-3 py-4 sm:grid-cols-[1.15fr_0.8fr_1fr_auto]">
                <div className="flex items-center gap-3">
                  <div
                    className="grid size-9 shrink-0 place-items-center rounded-full text-[11px] font-extrabold"
                    style={{ backgroundColor: shift.color }}
                  >
                    {shift.initials}
                  </div>
                  <div>
                    <p className="text-sm font-extrabold">{shift.name}</p>
                    <p className="mt-0.5 text-[11px] text-muted">{shift.role}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 font-mono text-xs font-semibold text-muted">
                  <Clock3 className="size-3.5" /> {shift.time}
                </div>
                <div className="hidden h-2 overflow-hidden rounded-full bg-canvas sm:block">
                  <div className="h-full w-[68%] rounded-full bg-success/75" />
                </div>
                <Badge variant={shift.status === 'Đang làm' ? 'success' : shift.status === 'Đang nghỉ' ? 'warning' : 'neutral'}>
                  {shift.status}
                </Badge>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between border-t border-line bg-canvas/45 px-5 py-3 sm:px-6">
            <p className="text-xs text-muted">Hiển thị 4 trong 128 nhân viên</p>
            <button className="inline-flex items-center gap-1.5 text-xs font-extrabold text-success">
              Mở lịch đầy đủ <ArrowRight className="size-3.5" />
            </button>
          </div>
        </article>

        <article className="rounded-lg border border-line bg-sidebar p-5 text-white shadow-panel sm:p-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-white/40">Ca làm hiện tại</p>
              <h2 className="mt-2 text-lg font-extrabold tracking-[-0.025em]">Tình hình trực tiếp</h2>
            </div>
            <span className="relative flex size-3">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#61d59f] opacity-50" />
              <span className="relative inline-flex size-3 rounded-full bg-[#61d59f]" />
            </span>
          </div>

          <div className="mt-7 grid grid-cols-3 gap-2">
            {[
              ['94', 'Đang làm'],
              ['11', 'Đang nghỉ'],
              ['07', 'Chưa vào'],
            ].map(([value, label]) => (
              <div key={label} className="rounded-md bg-white/[0.065] px-3 py-4 text-center">
                <p className="font-mono text-xl font-semibold tracking-[-0.04em]">{value}</p>
                <p className="mt-1.5 text-[10px] font-bold text-white/45">{label}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 space-y-3">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-white/35">Ngoại lệ mới nhất</p>
            {exceptions.map((item) => (
              <div key={item.employee} className="flex items-center gap-3 rounded-md border border-white/8 bg-white/[0.045] p-3">
                <div className="grid size-8 shrink-0 place-items-center rounded-md bg-brand/15 text-brand-light">
                  <ShieldAlert className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-extrabold">{item.employee}</p>
                  <p className="mt-1 truncate text-[10px] text-white/45">{item.issue}</p>
                </div>
                <p className="font-mono text-[10px] text-white/35">{item.time}</p>
              </div>
            ))}
          </div>

          <button className="mt-5 flex w-full items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.065] py-3 text-xs font-extrabold transition hover:bg-white/10">
            Xem màn hình chấm công <ArrowUpRight className="size-3.5" />
          </button>
        </article>
      </section>

      <section className="grid min-w-0 gap-6 xl:grid-cols-[1fr_0.52fr]">
        <article className="rounded-lg border border-line bg-surface p-5 shadow-panel sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-extrabold tracking-[-0.02em]">Giờ làm dự kiến và thực tế</h2>
              <p className="mt-1 text-xs text-muted">Tổng hợp 7 ngày gần nhất</p>
            </div>
            <div className="flex items-center gap-4 text-[10px] font-bold text-muted">
              <span className="flex items-center gap-2"><i className="size-2 rounded-full bg-brand" /> Thực tế</span>
              <span className="flex items-center gap-2"><i className="size-2 rounded-full bg-[#9bb5d3]" /> Dự kiến</span>
            </div>
          </div>
          <div className="mt-3">
            <WorkforceChart />
          </div>
        </article>

        <article className="rounded-lg border border-line bg-surface p-5 shadow-panel sm:p-6">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-base font-extrabold tracking-[-0.02em]">Phủ ca tuần này</h2>
              <p className="mt-1 text-xs text-muted">Theo nhu cầu nhân sự</p>
            </div>
            <Badge variant="success">Tốt</Badge>
          </div>
          <div className="mt-7 flex items-end gap-5">
            <div className="relative grid size-28 place-items-center rounded-full bg-[conic-gradient(#17745b_0_91%,#e7ebe7_91%_100%)]">
              <div className="grid size-[86px] place-items-center rounded-full bg-surface text-center">
                <div>
                  <p className="font-mono text-2xl font-semibold tracking-[-0.05em]">91%</p>
                  <p className="mt-1 text-[9px] font-bold uppercase tracking-[0.12em] text-muted">Đã phủ</p>
                </div>
              </div>
            </div>
            <div className="min-w-0 flex-1 space-y-3">
              {[
                ['248', 'Ca đã đủ người'],
                ['18', 'Ca còn thiếu'],
                ['05', 'Ca chưa phân'],
              ].map(([value, label], index) => (
                <div key={label} className="flex items-center justify-between border-b border-line pb-2 last:border-0">
                  <span className="text-xs text-muted">{label}</span>
                  <span className={`font-mono text-sm font-semibold ${index === 0 ? 'text-success' : index === 1 ? 'text-warning-strong' : 'text-brand'}`}>{value}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-6 rounded-md bg-canvas p-3">
            <p className="flex items-center gap-2 text-xs font-bold"><Check className="size-4 text-success" /> Tốt hơn tuần trước 4,8%</p>
          </div>
        </article>
      </section>

      <ApprovalsTable />
    </div>
  );
}
