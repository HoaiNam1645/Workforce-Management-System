'use client';

import { useQuery } from '@tanstack/react-query';
import { addDays, format, startOfDay, subDays } from 'date-fns';
import { vi } from 'date-fns/locale';
import { AlertTriangle, ArrowRight, CalendarDays, Clock3, Fingerprint, LoaderCircle, MapPin, Palmtree, TimerReset } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/components/auth/auth-provider';
import { getMyAttendance, getMyAttendanceHistory } from '@/lib/attendance-api';
import { getMyLeave } from '@/lib/leave-api';
import { getMySchedule } from '@/lib/schedules-api';
import { formatDurationMinutes } from '@/lib/time-format';
import { cn } from '@/lib/utils';

const statusLabel = {
  not_started: 'Chưa bắt đầu',
  working: 'Đang làm việc',
  on_break: 'Đang nghỉ',
  completed: 'Đã hoàn thành',
};

export function EmployeeOverview() {
  const { user, hasPermission } = useAuth();
  const today = startOfDay(new Date());
  const historyFrom = subDays(today, 6);
  const scheduleTo = addDays(today, 7);
  const canClock = hasPermission('attendance.clock');
  const canViewSchedule = hasPermission('schedules.self.view');
  const canRequestLeave = hasPermission('leave.request');

  const attendance = useQuery({ queryKey: ['my-attendance'], queryFn: getMyAttendance, enabled: canClock, refetchInterval: 30_000 });
  const history = useQuery({ queryKey: ['my-attendance-history', format(historyFrom, 'yyyy-MM-dd'), format(today, 'yyyy-MM-dd')], queryFn: () => getMyAttendanceHistory(format(historyFrom, 'yyyy-MM-dd'), format(today, 'yyyy-MM-dd')), enabled: canClock });
  const schedule = useQuery({ queryKey: ['my-schedule-overview', today.toISOString()], queryFn: () => getMySchedule(today.toISOString(), scheduleTo.toISOString()), enabled: canViewSchedule });
  const leave = useQuery({ queryKey: ['my-leave'], queryFn: getMyLeave, enabled: canRequestLeave });

  const loading = [attendance, history, schedule, leave].some((query) => query.isLoading && query.fetchStatus !== 'idle');
  const now = attendance.data?.serverTime ? new Date(attendance.data.serverTime) : new Date();
  const upcoming = (schedule.data ?? []).filter((shift) => new Date(shift.endsAt) > now).sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt));
  const records = history.data ?? [];
  const workedMinutes = records.reduce((total, record) => total + record.workedMinutes, 0);
  const lateCount = records.filter((record) => record.isLate).length;
  const needsAttention = records.filter((record) => ['missing_check_in', 'missing_check_out', 'absent'].includes(record.status)).length;
  const leaveDays = (leave.data?.leaveTypes ?? []).filter((type) => type.tracksBalance && type.balance && type.unit !== 'hour').reduce((total, type) => total + (type.balance?.available ?? 0), 0);
  const chart = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(historyFrom, index);
    const key = format(date, 'yyyy-MM-dd');
    const rows = records.filter((record) => record.workDate === key);
    return {
      key,
      label: format(date, 'EEE', { locale: vi }),
      planned: rows.reduce((total, row) => total + row.scheduledMinutes, 0),
      worked: rows.reduce((total, row) => total + row.workedMinutes, 0),
    };
  });
  const chartMax = Math.max(...chart.flatMap((day) => [day.planned, day.worked]), 1);

  if (loading && !attendance.data && !history.data && !schedule.data && !leave.data) {
    return <div className="grid min-h-[60vh] place-items-center"><p className="flex items-center gap-2 text-sm font-bold text-muted"><LoaderCircle className="size-5 animate-spin text-brand" />Đang tải tổng quan cá nhân...</p></div>;
  }

  return <div className="mx-auto min-w-0 max-w-[1500px] space-y-5">
    <header><p className="text-xs font-extrabold uppercase tracking-[0.14em] text-brand">Không gian cá nhân</p><h1 className="mt-2 text-2xl font-black tracking-[-0.04em] sm:text-[30px]">Xin chào, {user?.displayName}</h1><p className="mt-2 text-sm text-muted">Lịch làm, giờ công và quyền lợi của bạn trong một màn hình.</p></header>

    <section className="grid overflow-hidden border border-line bg-surface shadow-panel lg:grid-cols-[1.25fr_.75fr]">
      <div className="p-5 sm:p-6"><div className="flex items-center gap-2"><span className={cn('size-2 rounded-full', attendance.data?.state === 'working' ? 'bg-success' : attendance.data?.state === 'on_break' ? 'bg-warning' : 'bg-muted')} /><p className="text-xs font-extrabold uppercase tracking-wide text-muted">Hôm nay · {attendance.data ? statusLabel[attendance.data.state] : 'Chưa có dữ liệu'}</p></div>{attendance.data?.shift ? <><h2 className="mt-4 text-xl font-black">{attendance.data.shift.name}</h2><p className="mt-2 flex items-center gap-2 text-sm text-muted"><Clock3 className="size-4 text-brand" />{format(new Date(attendance.data.shift.startsAt), 'HH:mm')}–{format(new Date(attendance.data.shift.endsAt), 'HH:mm')}</p><p className="mt-2 flex items-start gap-2 text-sm text-muted"><MapPin className="mt-0.5 size-4 shrink-0 text-brand" />{attendance.data.shift.branch.name} · {attendance.data.shift.branch.address}</p></> : <><h2 className="mt-4 text-xl font-black">Chưa có ca phù hợp để chấm công</h2><p className="mt-2 text-sm text-muted">Kiểm tra lịch cá nhân để xem các ca đã được công bố.</p></>}</div>
      <div className="flex flex-col justify-center gap-3 border-t border-line bg-canvas/45 p-5 lg:border-l lg:border-t-0">{attendance.data?.allowedActions.checkIn ? <ActionLink href="/attendance" icon={Fingerprint} label={attendance.data.shift ? 'Check-in ca này' : 'Mở chấm công'} primary /> : attendance.data?.state === 'working' || attendance.data?.state === 'on_break' ? <ActionLink href="/attendance" icon={Fingerprint} label="Mở chấm công" primary /> : <ActionLink href="/my-schedule" icon={CalendarDays} label="Xem lịch của tôi" primary />}<p className="text-xs leading-5 text-muted">Thao tác chấm công vẫn yêu cầu GPS và selfie theo quy định.</p></div>
    </section>

    <section className="grid gap-px border border-line bg-line grid-cols-2 xl:grid-cols-4">
      <Metric icon={CalendarDays} label="Ca sắp tới" value={String(upcoming.length)} note="Trong 7 ngày tới" />
      <Metric icon={Clock3} label="Giờ đã làm" value={formatDurationMinutes(workedMinutes)} note="7 ngày gần nhất" />
      <Metric icon={TimerReset} label="Đi muộn" value={String(lateCount)} note="7 ngày gần nhất" warning={lateCount > 0} />
      <Metric icon={Palmtree} label="Phép còn lại" value={`${leaveDays.toLocaleString('vi-VN')} ngày`} note={`${leave.data?.requests.filter((request) => request.status === 'pending').length ?? 0} yêu cầu chờ duyệt`} />
    </section>

    <section className="grid gap-5 lg:grid-cols-[1.1fr_.9fr]">
      <article className="border border-line bg-surface"><header className="flex items-start justify-between border-b border-line p-5"><div><h2 className="font-extrabold">Giờ làm 7 ngày gần nhất</h2><p className="mt-1 text-xs text-muted">So sánh thời gian được phân và thời gian thực tế.</p></div>{needsAttention > 0 && <span className="flex items-center gap-1.5 bg-warning-soft px-2.5 py-1 text-[10px] font-extrabold text-warning-strong"><AlertTriangle className="size-3.5" />{needsAttention} cần kiểm tra</span>}</header><div className="grid h-64 grid-cols-7 items-end gap-2 p-5">{chart.map((day) => <div key={day.key} className="flex h-full min-w-0 flex-col justify-end"><div className="flex flex-1 items-end justify-center gap-1"><span title={`Dự kiến ${formatDurationMinutes(day.planned)}`} className="w-2.5 bg-[#a9bfd8]" style={{ height: `${Math.max((day.planned / chartMax) * 100, day.planned ? 3 : 0)}%` }} /><span title={`Thực tế ${formatDurationMinutes(day.worked)}`} className="w-2.5 bg-brand" style={{ height: `${Math.max((day.worked / chartMax) * 100, day.worked ? 3 : 0)}%` }} /></div><p className="mt-2 truncate text-center text-[9px] font-bold uppercase text-muted">{day.label}</p></div>)}</div><footer className="flex gap-4 border-t border-line px-5 py-3 text-[10px] font-bold text-muted"><span className="flex items-center gap-1.5"><i className="size-2.5 bg-[#a9bfd8]" />Dự kiến</span><span className="flex items-center gap-1.5"><i className="size-2.5 bg-brand" />Thực tế</span></footer></article>
      <article className="border border-line bg-surface"><header className="flex items-center justify-between border-b border-line p-5"><div><h2 className="font-extrabold">Ca sắp tới</h2><p className="mt-1 text-xs text-muted">Tối đa 3 ca gần nhất đã được công bố.</p></div><Link href="/my-schedule" className="text-xs font-extrabold text-brand hover:underline">Xem lịch</Link></header>{upcoming.length ? <div className="divide-y divide-line">{upcoming.slice(0, 3).map((shift) => <Link href="/my-schedule" key={shift.id} className="flex items-center gap-4 p-4 transition hover:bg-canvas/60"><span className="grid min-w-12 place-items-center border border-line bg-canvas px-2 py-2"><b className="font-mono text-base">{format(new Date(shift.startsAt), 'dd')}</b><small className="text-[9px] font-bold uppercase text-muted">Thg {format(new Date(shift.startsAt), 'MM')}</small></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-extrabold">{shift.name}</p><p className="mt-1 text-xs text-muted">{format(new Date(shift.startsAt), 'HH:mm')}–{format(new Date(shift.endsAt), 'HH:mm')} · {shift.branch.name}</p></div><ArrowRight className="size-4 shrink-0 text-muted" /></Link>)}</div> : <div className="grid min-h-52 place-items-center p-8 text-center"><div><CalendarDays className="mx-auto size-6 text-muted" /><p className="mt-3 text-sm font-extrabold">Chưa có ca sắp tới</p><p className="mt-1 text-xs text-muted">Ca mới sẽ xuất hiện sau khi được công bố.</p></div></div>}</article>
    </section>
  </div>;
}

function ActionLink({ href, icon: Icon, label, primary }: { href: string; icon: typeof Clock3; label: string; primary?: boolean }) {
  return <Link href={href} className={cn('flex h-11 items-center justify-center gap-2 border px-4 text-sm font-extrabold transition', primary ? 'border-brand bg-brand text-white hover:bg-brand/90' : 'border-line bg-surface hover:bg-canvas')}><Icon className="size-4" />{label}<ArrowRight className="ml-auto size-4" /></Link>;
}

function Metric({ icon: Icon, label, value, note, warning }: { icon: typeof Clock3; label: string; value: string; note: string; warning?: boolean }) {
  return <article className="min-w-0 bg-surface p-4 sm:p-5"><div className="flex items-start gap-3"><span className={cn('grid size-9 shrink-0 place-items-center', warning ? 'bg-warning-soft text-warning-strong' : 'bg-info-soft text-brand')}><Icon className="size-4" /></span><div className="min-w-0"><p className="truncate font-mono text-lg font-black sm:text-xl">{value}</p><p className="mt-0.5 text-xs font-extrabold">{label}</p><p className="mt-1 truncate text-[10px] text-muted">{note}</p></div></div></article>;
}
