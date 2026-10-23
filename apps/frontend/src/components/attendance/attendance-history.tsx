'use client';

import { formatApp, toUtcIsoInAppTimezone } from "@/lib/app-timezone";

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { AlertCircle, CalendarClock, CheckCircle2, Clock3, FilePenLine, LoaderCircle, MapPin, Navigation, Smartphone, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { getMyAttendanceHistory, requestAttendanceAdjustment, type AttendanceHistoryItem } from '@/lib/attendance-api';
import { cn } from '@/lib/utils';
import { formatDurationMinutes } from '@/lib/time-format';
import { AttendanceSelfie } from './attendance-selfie';

const statusLabels: Record<string, string> = {
  scheduled: 'Sắp diễn ra',
  open: 'Đang làm việc',
  completed: 'Hoàn thành',
  adjusted: 'Đã điều chỉnh',
  missing_check_in: 'Thiếu check-in',
  missing_check_out: 'Thiếu check-out',
};

const statusTones: Record<string, string> = {
  scheduled: 'bg-canvas text-muted',
  open: 'bg-success-soft text-success',
  completed: 'bg-info-soft text-brand',
  adjusted: 'bg-info-soft text-brand',
  missing_check_in: 'bg-danger-soft text-danger',
  missing_check_out: 'bg-warning-soft text-warning',
};

function minutesLabel(minutes: number) {
  return formatDurationMinutes(minutes);
}

export function AttendanceHistory() {
  const [selected, setSelected] = useState<AttendanceHistoryItem | null>(null);
  const history = useQuery({ queryKey: ['my-attendance-history'], queryFn: () => getMyAttendanceHistory() });

  return <section className="border border-line bg-surface shadow-panel">
    <header className="flex flex-col justify-between gap-3 border-b border-line p-4 sm:flex-row sm:items-center sm:px-5">
      <div><p className="font-extrabold">Lịch sử chấm công</p><p className="mt-1 text-xs text-muted">Ca làm và dữ liệu thực tế trong 30 ngày gần nhất.</p></div>
      <div className="flex items-center gap-2 text-xs font-bold text-muted"><CalendarClock className="size-4 text-brand" />{history.data?.length ?? 0} bản ghi</div>
    </header>

    {history.isLoading ? <div className="flex min-h-44 items-center justify-center gap-2 text-sm font-bold text-muted"><LoaderCircle className="size-4 animate-spin" />Đang tải lịch sử...</div> : history.isError ? <div className="m-4 border border-danger/20 bg-danger-soft p-4 text-sm font-bold text-danger">{history.error.message}</div> : history.data?.length ? <div className="divide-y divide-line">{history.data.map((item) => {
      const visibleViolations = item.violations
        .filter((violation) => ['active', 'provisional'].includes(violation.status))
        .filter((violation) => violation.type !== item.status)
        .slice(0, 2);
      return <article key={item.id} className="grid gap-4 p-4 sm:grid-cols-[minmax(190px,0.75fr)_minmax(240px,1fr)_minmax(190px,0.8fr)_auto] sm:items-center sm:px-5">
      <div><p className="text-xs font-extrabold capitalize">{item.shift ? formatApp(new Date(item.shift.startsAt), 'EEEE, dd/MM/yyyy', { locale: vi }) : item.workDate}</p><p className="mt-1 truncate text-xs text-muted">{item.shift?.name ?? 'Làm việc ngoài lịch'}</p></div>
      <div><p className="flex items-center gap-2 font-mono text-sm font-bold"><Clock3 className="size-3.5 text-brand" />{item.checkInAt ? formatApp(new Date(item.checkInAt), 'HH:mm') : '--:--'} <span className="text-muted">→</span> {item.checkOutAt ? formatApp(new Date(item.checkOutAt), 'HH:mm') : '--:--'}</p><p className="mt-1 flex items-center gap-1.5 truncate text-[11px] text-muted"><MapPin className="size-3" />{item.branch?.name ?? 'Chưa xác định'}</p></div>
      <div className="flex flex-wrap items-center gap-2"><span className={cn('px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide', statusTones[item.status] ?? 'bg-canvas text-muted')}>{statusLabels[item.status] ?? item.status}</span>{visibleViolations.map((violation) => <span key={violation.id} className={cn('px-2.5 py-1 text-[10px] font-extrabold uppercase', violation.severity === 'critical' ? 'bg-danger-soft text-danger' : 'bg-warning-soft text-warning')}>{violationLabel(violation.type)}{violation.minutesAffected ? ` ${formatDurationMinutes(violation.minutesAffected)}` : ''}</span>)}<span className="text-xs font-bold text-muted">{minutesLabel(item.workedMinutes)}</span></div>
      <div className="flex justify-end"><Button size="sm" variant="outline" onClick={() => setSelected(item)}><FilePenLine className="size-3.5" />Xem / điều chỉnh</Button></div>
    </article>})}</div> : <div className="p-10 text-center"><CalendarClock className="mx-auto size-6 text-muted" /><p className="mt-3 font-bold">Chưa có dữ liệu chấm công</p><p className="mt-1 text-sm text-muted">Lịch sử sẽ xuất hiện sau khi có ca hoặc phiên làm việc.</p></div>}
    {selected && <HistoryDetail item={selected} close={() => setSelected(null)} />}
  </section>;
}

function HistoryDetail({ item, close }: { item: AttendanceHistoryItem; close: () => void }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [checkInAt, setCheckInAt] = useState(item.checkInAt ? formatApp(new Date(item.checkInAt), "yyyy-MM-dd'T'HH:mm") : '');
  const [checkOutAt, setCheckOutAt] = useState(item.checkOutAt ? formatApp(new Date(item.checkOutAt), "yyyy-MM-dd'T'HH:mm") : '');
  const [reason, setReason] = useState('');
  const pendingRequest = item.adjustments.find((request) => request.status === 'pending');
  const request = useMutation({
    mutationFn: () => requestAttendanceAdjustment({
      attendanceRecordId: item.recordId ?? undefined,
      shiftAssignmentId: item.shiftAssignmentId ?? undefined,
      requestedCheckInAt: checkInAt ? toUtcIsoInAppTimezone(checkInAt) : undefined,
      requestedCheckOutAt: checkOutAt ? toUtcIsoInAppTimezone(checkOutAt) : undefined,
      reason,
    }),
    meta: { successMessage: 'Đã gửi yêu cầu điều chỉnh' },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-attendance-history'] });
      close();
    },
  });

  return <div className="fixed inset-0 z-[100] flex items-end justify-center bg-ink/45 backdrop-blur-sm sm:items-center sm:p-5"><button aria-label="Đóng" className="absolute inset-0" onClick={close} /><div className="relative z-10 max-h-[92vh] w-full overflow-y-auto border border-line bg-surface shadow-2xl sm:max-w-2xl">
    <header className="flex items-start justify-between border-b border-line p-5"><div><p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-brand">Chi tiết chấm công</p><h2 className="mt-2 text-xl font-black">{item.shift?.name ?? 'Làm việc ngoài lịch'}</h2><p className="mt-1 text-xs text-muted">{item.workDate} · {item.branch?.name}</p></div><button onClick={close} className="grid size-9 place-items-center text-muted hover:bg-canvas"><X className="size-4" /></button></header>
    <div className="space-y-5 p-5">
      <div className="grid border border-line sm:grid-cols-3"><Stat label="Giờ thực tế" value={`${item.checkInAt ? formatApp(new Date(item.checkInAt), 'HH:mm') : '--:--'} – ${item.checkOutAt ? formatApp(new Date(item.checkOutAt), 'HH:mm') : '--:--'}`} /><Stat label="Thời gian làm" value={minutesLabel(item.workedMinutes)} bordered /><Stat label="Tổng break" value={minutesLabel(item.breakMinutes)} bordered /></div>
      {item.violations.filter((violation) => ['active', 'provisional', 'excluded'].includes(violation.status)).length > 0 && <section><p className="text-xs font-extrabold uppercase tracking-wide text-muted">Bất thường</p><div className="mt-3 space-y-2">{item.violations.filter((violation) => ['active', 'provisional', 'excluded'].includes(violation.status)).map((violation) => <div key={violation.id} className={cn('border p-3', violation.severity === 'critical' ? 'border-danger/25 bg-danger-soft' : 'border-warning/25 bg-warning-soft')}><div className="flex items-center justify-between gap-3"><p className="text-xs font-extrabold">{violationLabel(violation.type)}</p><span className="font-mono text-[10px] font-bold">{violation.minutesAffected ? formatDurationMinutes(violation.minutesAffected) : violation.status === 'provisional' ? 'Đang theo dõi' : 'Theo sự kiện'}</span></div></div>)}</div></section>}
      <section><p className="text-xs font-extrabold uppercase tracking-wide text-muted">Sự kiện, selfie và phiên truy cập</p>{item.events.length ? <div className="mt-3 divide-y divide-line border border-line">{item.events.map((event) => <div key={event.id} className="grid gap-3 p-3 sm:grid-cols-[auto_1fr_auto] sm:items-center">{event.photoUrl ? <AttendanceSelfie path={event.photoUrl} alt={`Selfie ${event.type.replace('_', ' ')}`} className="size-14" /> : <span className="grid size-10 place-items-center bg-info-soft text-brand"><Smartphone className="size-4" /></span>}<div><p className="text-xs font-extrabold">{event.type.replace('_', ' ')}</p><p className="mt-1 text-[10px] text-muted">{event.method} · {event.deviceId ?? 'Không có mã phiên'}{event.photoUrl ? ' · Đã lưu selfie' : ''}</p></div><div className="text-left sm:text-right"><p className="font-mono text-xs font-bold">{formatApp(new Date(event.occurredAt), 'HH:mm:ss')}</p>{event.distanceFromBranchM !== null && <p className="mt-1 flex items-center gap-1 text-[10px] text-muted sm:justify-end"><Navigation className="size-3" />Cách chi nhánh {Math.round(event.distanceFromBranchM)}m</p>}</div></div>)}</div> : <p className="mt-3 border border-dashed border-line p-4 text-sm text-muted">Chưa có sự kiện thực tế.</p>}</section>
      {pendingRequest ? <div className="border border-warning/25 bg-warning-soft p-4"><p className="flex items-center gap-2 text-sm font-extrabold text-warning"><AlertCircle className="size-4" />Yêu cầu đang chờ duyệt</p><p className="mt-2 text-xs leading-5 text-muted">{pendingRequest.reason}</p></div> : editing ? <section className="border border-line bg-canvas/40 p-4"><p className="font-extrabold">Yêu cầu chỉnh sửa giờ công</p><div className="mt-4 grid gap-4 sm:grid-cols-2"><Field label="Check-in đề nghị"><input type="datetime-local" value={checkInAt} onChange={(event) => setCheckInAt(event.target.value)} className="h-10 w-full border border-line bg-white px-3 text-sm outline-none focus:border-brand" /></Field><Field label="Check-out đề nghị"><input type="datetime-local" value={checkOutAt} onChange={(event) => setCheckOutAt(event.target.value)} className="h-10 w-full border border-line bg-white px-3 text-sm outline-none focus:border-brand" /></Field></div><Field label="Lý do"><textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} maxLength={1000} className="w-full resize-none border border-line bg-white px-3 py-2 text-sm outline-none focus:border-brand" placeholder="Mô tả lý do cần điều chỉnh..." /></Field><div className="mt-4 flex justify-end gap-2"><Button variant="outline" onClick={() => setEditing(false)}>Hủy</Button><Button variant="brand" loading={request.isPending} loadingText="Đang gửi..." disabled={reason.trim().length < 5 || (!checkInAt && !checkOutAt)} onClick={() => request.mutate()}>Gửi yêu cầu</Button></div></section> : <Button variant="outline" className="w-full" onClick={() => setEditing(true)}><FilePenLine className="size-4" />Yêu cầu chỉnh sửa giờ công</Button>}
      {item.adjustments.filter((requestItem) => requestItem.status !== 'pending').map((requestItem) => <div key={requestItem.id} className="flex gap-3 border border-line p-3"><CheckCircle2 className="mt-0.5 size-4 text-brand" /><div><p className="text-xs font-extrabold">Yêu cầu {requestItem.status === 'approved' ? 'đã được duyệt' : 'đã bị từ chối'}</p><p className="mt-1 text-xs text-muted">{requestItem.reviewNote ?? requestItem.reason}</p></div></div>)}
    </div>
  </div></div>;
}

function Stat({ label, value, bordered }: { label: string; value: string; bordered?: boolean }) {
  return <div className={cn('p-4', bordered && 'border-t border-line sm:border-l sm:border-t-0')}><p className="text-[10px] font-bold uppercase text-muted">{label}</p><p className="mt-1 font-mono text-sm font-extrabold">{value}</p></div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="mt-4 block"><span className="mb-2 block text-[10px] font-extrabold uppercase tracking-wide text-muted">{label}</span>{children}</label>;
}

function violationLabel(type: string) { return ({ late: 'Đi muộn', early_leave: 'Về sớm', missing_check_in: 'Thiếu check-in', missing_check_out: 'Thiếu check-out', absence: 'Vắng mặt', outside_geofence: 'Ngoài khu vực', excessive_break: 'Nghỉ quá giờ', insufficient_hours: 'Không đủ giờ làm', outside_schedule: 'Ngoài lịch' } as Record<string, string>)[type] ?? type; }
