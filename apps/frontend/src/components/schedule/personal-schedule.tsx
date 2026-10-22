'use client';

import { BriefcaseBusiness, CalendarDays, ChevronLeft, ChevronRight, Clock3, Coffee, LoaderCircle, LogIn, MapPin, UsersRound, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { addDays, addWeeks, differenceInMinutes, format, isSameDay, startOfWeek } from 'date-fns';
import { vi } from 'date-fns/locale';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { getMyAttendance } from '@/lib/attendance-api';
import { getMySchedule, getMyShiftDetail, type ShiftItem } from '@/lib/schedules-api';
import { cn } from '@/lib/utils';
import { formatDurationMinutes } from '@/lib/time-format';

function netMinutes(shift: ShiftItem) {
  return Math.max(differenceInMinutes(new Date(shift.endsAt), new Date(shift.startsAt)) - shift.unpaidBreakMinutes, 0);
}

function durationLabel(minutes: number) {
  return formatDurationMinutes(minutes);
}

export function PersonalSchedule() {
  const [week, setWeek] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [selected, setSelected] = useState<ShiftItem | null>(null);
  const to = addDays(week, 7);
  const query = useQuery({ queryKey: ['my-schedule', week.toISOString()], queryFn: () => getMySchedule(week.toISOString(), to.toISOString()) });
  const detail = useQuery({ queryKey: ['my-shift-detail', selected?.id], queryFn: () => getMyShiftDetail(selected!.id), enabled: Boolean(selected) });
  const attendance = useQuery({ queryKey: ['my-attendance'], queryFn: getMyAttendance, refetchInterval: 30_000 });
  const items = query.data ?? [];
  const totalMinutes = items.reduce((sum, shift) => sum + netMinutes(shift), 0);
  const referenceTime = attendance.data?.serverTime ? new Date(attendance.data.serverTime) : new Date();
  const nextShift = items.find((shift) => new Date(shift.startsAt) > referenceTime);
  const days = Array.from({ length: 7 }, (_, index) => addDays(week, index));

  return <div className="w-full min-w-0 space-y-5">
    <header className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-brand">Lịch cá nhân</p><h1 className="mt-2 text-2xl font-black tracking-[-0.04em] sm:text-[30px]">Ca làm của tôi</h1><p className="mt-2 text-sm text-muted">Theo dõi ca đã công bố, địa điểm và đồng nghiệp làm cùng.</p></div><div className="flex items-center gap-2"><Button variant="outline" size="icon" onClick={() => setWeek((date) => addWeeks(date, -1))}><ChevronLeft className="size-4" /></Button><div className="h-10 min-w-[210px] border border-line bg-surface px-4 py-2.5 text-center text-xs font-extrabold">{format(week, 'dd/MM')} – {format(addDays(week, 6), 'dd/MM/yyyy')}</div><Button variant="outline" size="icon" onClick={() => setWeek((date) => addWeeks(date, 1))}><ChevronRight className="size-4" /></Button><Button variant="subtle" onClick={() => setWeek(startOfWeek(new Date(), { weekStartsOn: 1 }))}>Tuần này</Button></div></header>

    <section className="grid overflow-hidden border border-line bg-surface shadow-panel sm:grid-cols-3"><Summary icon={CalendarDays} label="Ca trong tuần" value={String(items.length)} detail={items.length ? `${items.filter((shift) => isSameDay(new Date(shift.startsAt), new Date())).length} ca hôm nay` : 'Chưa có lịch'} /><Summary icon={Clock3} label="Tổng giờ dự kiến" value={durationLabel(totalMinutes)} detail="Đã trừ thời gian nghỉ" bordered /><Summary icon={MapPin} label="Ca tiếp theo" value={nextShift ? format(new Date(nextShift.startsAt), 'EEE, dd/MM', { locale: vi }) : 'Chưa có'} detail={nextShift ? `${format(new Date(nextShift.startsAt), 'HH:mm')} · ${nextShift.branch.name}` : items.length ? 'Không còn ca sắp tới trong tuần' : 'Chờ quản lý công bố'} bordered /></section>

    {query.isLoading ? <div className="grid min-h-80 place-items-center border border-line bg-surface"><p className="flex items-center gap-2 text-sm font-bold text-muted"><LoaderCircle className="size-4 animate-spin" />Đang tải lịch cá nhân...</p></div> : query.isError ? <div className="border border-danger/20 bg-danger-soft p-4 text-sm font-bold text-danger">{query.error.message}</div> : <>
      <section className="hidden w-full overflow-hidden border border-line bg-surface shadow-panel md:block"><div className="grid grid-cols-7 divide-x divide-line">{days.map((day) => { const shifts = items.filter((shift) => isSameDay(new Date(shift.startsAt), day)); return <div key={day.toISOString()} className="min-w-0"><div className={cn('flex h-[68px] items-center justify-between border-b border-line px-3', isSameDay(day, new Date()) && 'bg-info-soft')}><div><p className="text-[10px] font-extrabold uppercase tracking-wider text-muted">{format(day, 'EEEE', { locale: vi })}</p><p className="mt-1 font-mono text-lg font-semibold">{format(day, 'dd')}</p></div>{shifts.length > 0 && <span className="grid size-6 place-items-center rounded-full bg-brand text-[10px] font-bold text-white">{shifts.length}</span>}</div><div className="min-h-[300px] space-y-2 p-2">{shifts.map((shift) => <ShiftCard key={shift.id} shift={shift} onClick={() => setSelected(shift)} />)}{!shifts.length && <div className="grid h-28 place-items-center text-[10px] font-semibold text-muted/70">Không có ca</div>}</div></div>; })}</div></section>
      <section className="space-y-3 md:hidden">{items.length ? items.map((shift) => <ShiftCard key={shift.id} shift={shift} onClick={() => setSelected(shift)} mobile />) : <EmptySchedule />}</section>
      {!items.length && <div className="hidden md:block"><EmptySchedule /></div>}
    </>}

    <div className="flex items-center gap-2 border border-line bg-surface px-4 py-3 text-xs text-muted"><CalendarDays className="size-4 text-brand" /> Lịch chỉ hiển thị sau khi quản lý công bố. Bấm vào một ca để xem đầy đủ thông tin.</div>
    {selected && <ShiftDetailModal fallback={selected} loading={detail.isLoading} error={detail.error?.message} data={detail.data} canCheckIn={Boolean(attendance.data?.allowedActions.checkIn && attendance.data.shift?.id === selected.id)} close={() => setSelected(null)} />}
  </div>;
}

function ShiftCard({ shift, onClick, mobile }: { shift: ShiftItem; onClick: () => void; mobile?: boolean }) {
  return <button onClick={onClick} className={cn('group w-full border-l-[3px] border-brand bg-info-soft/70 p-3 text-left transition hover:bg-info-soft hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-brand/25', mobile && 'flex items-center gap-4 border border-l-[3px] border-line border-l-brand bg-surface p-4')}><div className={cn('min-w-0', mobile && 'flex-1')}><p className="truncate text-xs font-extrabold text-ink">{shift.name}</p><p className="mt-2 flex items-center gap-1.5 font-mono text-[11px] font-bold text-brand"><Clock3 className="size-3" />{format(new Date(shift.startsAt), 'HH:mm')}–{format(new Date(shift.endsAt), 'HH:mm')}</p><p className="mt-1.5 flex items-center gap-1.5 truncate text-[10px] text-muted"><MapPin className="size-3 shrink-0" />{shift.branch.name}</p>{mobile && <p className="mt-1.5 text-[11px] text-muted">{shift.department?.name ?? 'Mọi phòng ban'} · {shift.position?.name ?? 'Mọi vị trí'}</p>}</div><span className={cn('mt-2 block text-[9px] font-bold uppercase tracking-wide text-brand opacity-0 transition group-hover:opacity-100', mobile && 'mt-0 opacity-100')}>Chi tiết →</span></button>;
}

function ShiftDetailModal({ fallback, data, loading, error, canCheckIn, close }: { fallback: ShiftItem; data?: Awaited<ReturnType<typeof getMyShiftDetail>>; loading: boolean; error?: string; canCheckIn: boolean; close: () => void }) {
  const router = useRouter();
  const shift = data ?? fallback;
  return <div className="fixed inset-0 z-[100] flex items-end justify-center bg-ink/40 backdrop-blur-sm sm:items-center sm:p-5"><button aria-label="Đóng" className="absolute inset-0" onClick={close} /><div className="relative z-10 max-h-[92vh] w-full overflow-y-auto border border-line bg-surface shadow-2xl sm:max-w-[680px] sm:rounded-sm"><header className="flex items-start justify-between border-b border-line bg-canvas/40 p-5"><div><p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-brand">Chi tiết ca làm</p><h2 className="mt-2 text-xl font-black">{shift.name}</h2><p className="mt-1 text-xs capitalize text-muted">{format(new Date(shift.startsAt), 'EEEE, dd/MM/yyyy', { locale: vi })}</p></div><button onClick={close} className="grid size-9 place-items-center text-muted hover:bg-surface"><X className="size-4" /></button></header>
      <div className="grid border-b border-line sm:grid-cols-3"><DetailStat icon={Clock3} label="Thời gian" value={`${format(new Date(shift.startsAt), 'HH:mm')}–${format(new Date(shift.endsAt), 'HH:mm')}`} detail={durationLabel(netMinutes(shift))} /><DetailStat icon={Coffee} label="Nghỉ không lương" value={formatDurationMinutes(shift.unpaidBreakMinutes)} detail="Đã trừ khỏi giờ làm" bordered /><DetailStat icon={MapPin} label="Địa điểm" value={shift.branch.name} detail={shift.branch.code} bordered /></div>
      <div className="space-y-5 p-5"><section><h3 className="text-xs font-extrabold uppercase tracking-wider text-muted">Phân công công việc</h3><div className="mt-3 grid border border-line sm:grid-cols-2"><div className="border-b border-line p-4 sm:border-b-0 sm:border-r"><p className="text-[10px] font-bold text-muted">PHÒNG BAN</p><p className="mt-1 text-sm font-extrabold">{shift.department?.name ?? 'Không chỉ định'}</p></div><div className="p-4"><p className="text-[10px] font-bold text-muted">VỊ TRÍ</p><p className="mt-1 text-sm font-extrabold">{shift.position?.name ?? 'Không chỉ định'}</p></div></div>{shift.notes && <div className="mt-3 border border-line bg-canvas/45 p-4"><p className="text-[10px] font-bold uppercase text-muted">Ghi chú</p><p className="mt-2 text-sm leading-6">{shift.notes}</p></div>}</section>
        <section><div className="flex items-center justify-between"><div><h3 className="text-xs font-extrabold uppercase tracking-wider text-muted">Làm cùng ca</h3><p className="mt-1 text-xs text-muted">Đồng nghiệp được phân vào cùng khung giờ.</p></div>{data && <span className="rounded-full bg-info-soft px-2.5 py-1 text-xs font-bold text-brand">{data.coworkers.length} người</span>}</div>{loading ? <div className="mt-3 flex items-center gap-2 border border-line p-4 text-sm text-muted"><LoaderCircle className="size-4 animate-spin" />Đang tải danh sách...</div> : error ? <div className="mt-3 border border-danger/20 bg-danger-soft p-3 text-xs font-bold text-danger">{error}</div> : data?.coworkers.length ? <div className="mt-3 divide-y divide-line border border-line">{data.coworkers.map((employee) => <div key={employee.id} className="flex items-center gap-3 p-3"><span className="grid size-9 shrink-0 place-items-center rounded-full bg-info-soft text-xs font-black text-brand">{employee.initials}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-extrabold">{employee.fullName}</p><p className="mt-0.5 truncate text-[11px] text-muted">{employee.employeeCode} · {employee.position}</p></div><BriefcaseBusiness className="size-4 text-muted" /></div>)}</div> : <div className="mt-3 border border-dashed border-line bg-canvas/35 p-5 text-center"><UsersRound className="mx-auto size-5 text-muted" /><p className="mt-2 text-sm font-bold">Bạn đang làm ca này một mình</p><p className="mt-1 text-xs text-muted">Chưa có đồng nghiệp khác được phân công.</p></div>}</section></div>
      <footer className="sticky bottom-0 flex justify-end gap-2 border-t border-line bg-surface p-4"><Button variant="outline" onClick={close}>Đóng</Button>{canCheckIn && <Button variant="brand" onClick={() => router.push('/attendance')}><LogIn className="size-4" />Check-in ca này</Button>}</footer>
    </div></div>;
}

function DetailStat({ icon: Icon, label, value, detail, bordered }: { icon: typeof Clock3; label: string; value: string; detail: string; bordered?: boolean }) { return <div className={cn('flex gap-3 p-4', bordered && 'border-t border-line sm:border-l sm:border-t-0')}><Icon className="mt-0.5 size-4 shrink-0 text-brand" /><div><p className="text-[10px] font-bold uppercase text-muted">{label}</p><p className="mt-1 text-sm font-extrabold">{value}</p><p className="mt-1 text-[10px] text-muted">{detail}</p></div></div>; }
function Summary({ icon: Icon, label, value, detail, bordered }: { icon: typeof CalendarDays; label: string; value: string; detail: string; bordered?: boolean }) { return <div className={cn('flex items-center gap-4 p-4', bordered && 'border-t border-line sm:border-l sm:border-t-0')}><span className="grid size-9 place-items-center rounded-sm bg-info-soft text-brand"><Icon className="size-4" /></span><div className="min-w-0"><p className="truncate text-lg font-black">{value}</p><p className="mt-0.5 text-xs font-extrabold">{label}</p><p className="mt-0.5 truncate text-[10px] text-muted">{detail}</p></div></div>; }
function EmptySchedule() { return <div className="grid min-h-64 place-items-center border border-dashed border-line bg-surface text-center"><div><span className="mx-auto grid size-11 place-items-center rounded-full bg-info-soft text-brand"><CalendarDays className="size-5" /></span><p className="mt-3 font-extrabold">Tuần này chưa có ca</p><p className="mt-1 text-sm text-muted">Ca sẽ xuất hiện sau khi được quản lý công bố.</p></div></div>; }
