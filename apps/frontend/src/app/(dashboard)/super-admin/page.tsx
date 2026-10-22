import {
  Activity,
  BadgeCheck,
  Blocks,
  Building2,
  CheckCircle2,
  CircleDot,
  Clock3,
  Database,
  Fingerprint,
  KeyRound,
  LockKeyhole,
  ServerCog,
  ShieldCheck,
  UserCog,
  UsersRound,
  Webhook,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

const systemMetrics = [
  { label: 'Tài khoản hoạt động', value: '146', detail: '+6 tháng này', icon: UsersRound, tone: 'bg-success-soft text-success' },
  { label: 'Chi nhánh', value: '08', detail: '7 đang hoạt động', icon: Building2, tone: 'bg-info-soft text-info' },
  { label: 'Vai trò hệ thống', value: '09', detail: '47 permission', icon: ShieldCheck, tone: 'bg-warning-soft text-warning-strong' },
  { label: 'Sự kiện audit', value: '1.284', detail: '30 ngày gần nhất', icon: Fingerprint, tone: 'bg-[#edf5ff] text-brand' },
];

const services = [
  { name: 'PostgreSQL', detail: 'Kết nối ổn định · 18ms', icon: Database, status: 'Hoạt động' },
  { name: 'Backend API', detail: 'NestJS · v0.1.0', icon: ServerCog, status: 'Hoạt động' },
  { name: 'Notification Worker', detail: '0 tác vụ tồn đọng', icon: Webhook, status: 'Hoạt động' },
  { name: 'Storage', detail: '24.8 GB / 100 GB', icon: Blocks, status: 'Cảnh báo' },
];

const roles = [
  { name: 'Nhân viên', code: 'EMPLOYEE', members: 112, percent: 77, color: 'bg-success' },
  { name: 'Quản lý', code: 'MANAGERS', members: 18, percent: 42, color: 'bg-info' },
  { name: 'Nhân sự', code: 'HR', members: 7, percent: 26, color: 'bg-warning' },
  { name: 'Payroll', code: 'PAYROLL', members: 5, percent: 18, color: 'bg-brand' },
];

const auditEvents = [
  { actor: 'Anh Nguyễn', action: 'Cập nhật quyền', target: 'BRANCH_MANAGER', time: '10:42', icon: KeyRound },
  { actor: 'Hệ thống', action: 'Khóa kỳ bảng công', target: 'Tháng 09/2026', time: '09:15', icon: LockKeyhole },
  { actor: 'Thu Hà', action: 'Tạo tài khoản', target: 'trang.le@aurora.vn', time: '08:37', icon: UserCog },
  { actor: 'Hệ thống', action: 'Đồng bộ dữ liệu', target: 'Chi nhánh Quận 7', time: '07:00', icon: Activity },
];

export default function SuperAdminDashboardPage() {
  return (
    <div className="mx-auto min-w-0 max-w-[1560px] space-y-6">
      <section className="relative overflow-hidden rounded-lg bg-sidebar px-6 py-7 text-white shadow-panel sm:px-8 sm:py-8">
        <div className="absolute -right-16 -top-24 size-72 rounded-full bg-brand/20 blur-3xl" />
        <div className="absolute bottom-0 right-[24%] size-40 rounded-full bg-success/20 blur-3xl" />
        <div className="relative flex flex-col justify-between gap-7 lg:flex-row lg:items-end">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.14em] text-white/65">
              <CircleDot className="size-3 text-[#61d59f]" /> System command center
            </div>
            <h1 className="mt-5 max-w-2xl text-2xl font-black tracking-[-0.045em] sm:text-[32px]">
              Hệ thống đang vận hành ổn định.
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-white/50">
              Không có sự cố nghiêm trọng. Một cảnh báo dung lượng cần được theo dõi trong tuần này.
            </p>
          </div>
          <Button variant="brand" asChild><Link href="/super-admin/access">Quản lý quyền</Link></Button>
        </div>
      </section>

      <section className="grid min-w-0 grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {systemMetrics.map((metric, index) => {
          const Icon = metric.icon;
          return (
            <article
              key={metric.label}
              className="animate-rise min-w-0 rounded-lg border border-line bg-surface p-4 shadow-panel sm:p-5"
              style={{ animationDelay: `${index * 70}ms` }}
            >
              <div className="flex items-start">
                <div className={`grid size-10 place-items-center rounded-md ${metric.tone}`}>
                  <Icon className="size-[18px]" />
                </div>
              </div>
              <p className="mt-4 font-mono text-2xl font-semibold leading-none tracking-[-0.055em] sm:mt-5 sm:text-[28px]">{metric.value}</p>
              <p className="mt-2 text-xs font-extrabold sm:mt-3 sm:text-sm">{metric.label}</p>
              <p className="mt-1 truncate text-[10px] text-muted sm:text-[11px]">{metric.detail}</p>
            </article>
          );
        })}
      </section>

      <section className="grid min-w-0 gap-6 xl:grid-cols-[0.92fr_1.08fr]">
        <article className="rounded-lg border border-line bg-surface p-5 shadow-panel sm:p-6">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-base font-extrabold tracking-[-0.02em]">Sức khỏe dịch vụ</h2>
              <p className="mt-1 text-xs text-muted">Cập nhật cách đây 28 giây</p>
            </div>
            <Badge variant="success"><CheckCircle2 className="size-3" /> 3/4 ổn định</Badge>
          </div>

          <div className="mt-6 space-y-2.5">
            {services.map((service) => {
              const Icon = service.icon;
              const warning = service.status === 'Cảnh báo';
              return (
                <div key={service.name} className="flex items-center gap-4 rounded-md border border-line/80 p-3.5 transition hover:bg-canvas/60">
                  <div className={`grid size-10 shrink-0 place-items-center rounded-md ${warning ? 'bg-warning-soft text-warning-strong' : 'bg-success-soft text-success'}`}>
                    <Icon className="size-[18px]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-extrabold">{service.name}</p>
                    <p className="mt-1 truncate font-mono text-[10px] text-muted">{service.detail}</p>
                  </div>
                  <Badge variant={warning ? 'warning' : 'success'}>{service.status}</Badge>
                </div>
              );
            })}
          </div>
        </article>

        <article className="rounded-lg border border-line bg-surface p-5 shadow-panel sm:p-6">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-base font-extrabold tracking-[-0.02em]">Phân bổ vai trò</h2>
              <p className="mt-1 text-xs text-muted">Tài khoản đang hoạt động theo nhóm quyền</p>
            </div>
            <Link href="/super-admin/access" className="text-xs font-extrabold text-success">Quản lý RBAC</Link>
          </div>

          <div className="mt-7 space-y-5">
            {roles.map((role) => (
              <div key={role.code}>
                <div className="mb-2 flex items-end justify-between gap-3">
                  <div>
                    <p className="text-sm font-extrabold">{role.name}</p>
                    <p className="mt-0.5 font-mono text-[9px] font-semibold tracking-[0.08em] text-muted">{role.code}</p>
                  </div>
                  <p className="font-mono text-sm font-semibold">{role.members}</p>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-canvas">
                  <div className={`h-full rounded-full ${role.color}`} style={{ width: `${role.percent}%` }} />
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="grid min-w-0 gap-6 xl:grid-cols-[1fr_0.55fr]">
        <article className="overflow-hidden rounded-lg border border-line bg-surface shadow-panel">
          <div className="flex items-center justify-between border-b border-line px-5 py-4 sm:px-6">
            <div>
              <h2 className="text-base font-extrabold tracking-[-0.02em]">Hoạt động gần đây</h2>
              <p className="mt-1 text-xs text-muted">Sự kiện bảo mật và cấu hình quan trọng</p>
            </div>
          </div>

          <div className="divide-y divide-line/80">
            {auditEvents.map((event) => {
              const Icon = event.icon;
              return (
                <div key={`${event.actor}-${event.time}`} className="grid items-center gap-3 px-5 py-4 hover:bg-canvas/50 sm:grid-cols-[auto_0.8fr_1fr_auto] sm:px-6">
                  <div className="grid size-9 place-items-center rounded-md bg-canvas text-muted">
                    <Icon className="size-4" />
                  </div>
                  <div>
                    <p className="text-sm font-extrabold">{event.actor}</p>
                    <p className="mt-0.5 text-[10px] text-muted">{event.action}</p>
                  </div>
                  <p className="text-xs font-semibold text-muted">{event.target}</p>
                  <p className="font-mono text-[10px] text-muted">{event.time}</p>
                </div>
              );
            })}
          </div>
        </article>

        <article className="rounded-lg border border-line bg-surface p-5 shadow-panel sm:p-6">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-base font-extrabold tracking-[-0.02em]">Bảo mật truy cập</h2>
              <p className="mt-1 text-xs text-muted">Tổng quan xác thực</p>
            </div>
            <Badge variant="success"><BadgeCheck className="size-3" /> An toàn</Badge>
          </div>
          <div className="mt-7 grid grid-cols-2 gap-3">
            <div className="rounded-md bg-canvas p-4">
              <p className="font-mono text-2xl font-semibold tracking-[-0.05em]">92%</p>
              <p className="mt-2 text-[11px] font-bold text-muted">Đã bật 2FA</p>
            </div>
            <div className="rounded-md bg-canvas p-4">
              <p className="font-mono text-2xl font-semibold tracking-[-0.05em]">03</p>
              <p className="mt-2 text-[11px] font-bold text-muted">Phiên bất thường</p>
            </div>
          </div>
          <div className="mt-5 space-y-3 text-xs">
            <div className="flex items-center justify-between"><span className="text-muted">Mật khẩu hết hạn</span><strong>4 tài khoản</strong></div>
            <div className="flex items-center justify-between"><span className="text-muted">Tài khoản bị khóa</span><strong>2 tài khoản</strong></div>
            <div className="flex items-center justify-between"><span className="text-muted">Đăng nhập hôm nay</span><strong>87 lượt</strong></div>
          </div>
        </article>
      </section>
    </div>
  );
}
