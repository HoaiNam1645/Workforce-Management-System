'use client';

import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import {
  AlertTriangle,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Clock3,
  Coffee,
  LoaderCircle,
  LogIn,
  LogOut,
  RefreshCw,
  ShieldAlert,
  UserRoundCheck,
  UserRoundX,
  UsersRound,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { formatDurationMinutes } from '@/lib/time-format';
import {
  getLiveShifts,
  type LiveShiftBadge,
  type LiveShiftEmployee,
  type LiveShiftItem,
  type LiveShiftState,
} from '@/lib/attendance-api';
import { cn } from '@/lib/utils';

type StateFilter = 'all' | LiveShiftState;

const stateMeta: Record<LiveShiftState, { label: string; shortLabel: string; className: string; icon: typeof UsersRound }> = {
  upcoming: { label: 'Sắp đến ca', shortLabel: 'Sắp đến', className: 'bg-info-soft text-info', icon: Clock3 },
  not_checked_in: { label: 'Chưa check-in', shortLabel: 'Chưa vào', className: 'bg-warning-soft text-warning-strong', icon: LogIn },
  working: { label: 'Đang làm việc', shortLabel: 'Đang làm', className: 'bg-success-soft text-success', icon: UserRoundCheck },
  on_break: { label: 'Đang nghỉ break', shortLabel: 'Đang nghỉ', className: 'bg-info-soft text-info', icon: Coffee },
  checked_out: { label: 'Đã check-out', shortLabel: 'Đã ra', className: 'bg-canvas text-muted', icon: LogOut },
  absent: { label: 'Vắng mặt', shortLabel: 'Vắng mặt', className: 'bg-danger-soft text-danger', icon: UserRoundX },
  missing_checkout: { label: 'Thiếu check-out', shortLabel: 'Thiếu ra', className: 'bg-danger-soft text-danger', icon: ShieldAlert },
};

const badgeMeta: Record<LiveShiftBadge, { label: string; className: string }> = {
  late: { label: 'Đi muộn', className: 'bg-warning-soft text-warning-strong' },
  early_leave: { label: 'Về sớm', className: 'bg-warning-soft text-warning-strong' },
  outside_geofence: { label: 'Ngoài khu vực', className: 'bg-danger-soft text-danger' },
  excessive_break: { label: 'Nghỉ quá giờ', className: 'bg-danger-soft text-danger' },
};

const stateOrder: LiveShiftState[] = ['missing_checkout', 'absent', 'not_checked_in', 'on_break', 'working', 'checked_out', 'upcoming'];

export function LiveShiftMonitor() {
  const [date, setDate] = useState('');
  const [branchId, setBranchId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [selectedShiftId, setSelectedShiftId] = useState('');
  const [stateFilter, setStateFilter] = useState<StateFilter>('all');

  useEffect(() => setDate(format(new Date(), 'yyyy-MM-dd')), []);

  const live = useQuery({
    queryKey: ['live-shifts', date, branchId, departmentId],
    queryFn: () => getLiveShifts({ date, branchId, departmentId }),
    enabled: Boolean(date),
    refetchInterval: 20_000,
    refetchIntervalInBackground: false,
  });

  useEffect(() => {
    const items = live.data?.items ?? [];
    if (!items.length) {
      setSelectedShiftId('');
      return;
    }
    if (!items.some((shift) => shift.id === selectedShiftId)) {
      const active = items.find((shift) => shift.operationalStatus === 'in_progress');
      setSelectedShiftId((active ?? items[0]).id);
      setStateFilter('all');
    }
  }, [live.data?.items, selectedShiftId]);

  const selectedShift = live.data?.items.find((shift) => shift.id === selectedShiftId) ?? null;
  const employees = useMemo(() => {
    if (!selectedShift) return [];
    const filtered = stateFilter === 'all'
      ? selectedShift.employees
      : selectedShift.employees.filter((item) => item.state === stateFilter);
    return [...filtered].sort((a, b) => {
      const stateDifference = stateOrder.indexOf(a.state) - stateOrder.indexOf(b.state);
      return stateDifference || a.employee.fullName.localeCompare(b.employee.fullName, 'vi');
    });
  }, [selectedShift, stateFilter]);

  const displayDate = date
    ? format(new Date(`${date}T00:00:00`), "EEEE, 'ngày' dd/MM/yyyy", { locale: vi })
    : 'Đang xác định ngày';

  return (
    <div className="w-full min-w-0 space-y-5">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.14em] text-brand">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping bg-success/45" />
              <span className="relative inline-flex size-2 bg-success" />
            </span>
            Điều hành theo thời gian thực
          </div>
          <h1 className="mt-2 text-2xl font-black tracking-[-0.04em] sm:text-[30px]">Theo dõi ca đang vận hành</h1>
          <p className="mt-2 text-sm text-muted">Biết chính xác ai đang làm, đang nghỉ, chưa vào ca hoặc chưa check-out.</p>
        </div>
        <div className="flex items-center gap-3 border border-line bg-surface px-3 py-2 text-xs text-muted shadow-panel">
          <CircleDot className="size-3.5 text-success" />
          <span>{live.data ? `Cập nhật ${format(new Date(live.data.generatedAt), 'HH:mm:ss')}` : 'Chờ dữ liệu'}</span>
          {live.isFetching && <LoaderCircle className="size-3.5 animate-spin text-brand" />}
        </div>
      </header>

      <section className="border border-line bg-surface shadow-panel">
        <div className="grid gap-px bg-line sm:grid-cols-2 xl:grid-cols-[1.15fr_1fr_1fr_auto]">
          <FilterField label="Ngày theo dõi" icon={CalendarDays}>
            <input className="input border-0" type="date" value={date} onChange={(event) => { setDate(event.target.value); setSelectedShiftId(''); }} />
          </FilterField>
          <FilterField label="Chi nhánh" icon={Building2}>
            <select className="input border-0" value={branchId} onChange={(event) => { setBranchId(event.target.value); setDepartmentId(''); setSelectedShiftId(''); }}>
              <option value="">Tất cả chi nhánh</option>
              {live.data?.filters.branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </select>
          </FilterField>
          <FilterField label="Phòng ban" icon={BriefcaseBusiness}>
            <select className="input border-0" value={departmentId} onChange={(event) => { setDepartmentId(event.target.value); setSelectedShiftId(''); }}>
              <option value="">Tất cả phòng ban</option>
              {live.data?.filters.departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
            </select>
          </FilterField>
          <div className="flex items-center bg-surface p-3">
            <Button variant="outline" className="w-full xl:w-auto" loading={live.isFetching} loadingText="Đang cập nhật" onClick={() => live.refetch()}>
              <RefreshCw className="size-4" /> Làm mới
            </Button>
          </div>
        </div>
      </section>

      {live.isLoading || !date ? (
        <LoadingState />
      ) : live.isError ? (
        <ErrorState message={live.error.message} retry={() => live.refetch()} />
      ) : live.data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard icon={UsersRound} label="Được phân công" value={live.data.summary.assignments} detail={`${live.data.summary.shifts} ca trong ${displayDate}`} tone="brand" />
            <SummaryCard icon={UserRoundCheck} label="Đang làm" value={live.data.summary.counts.working} detail={`${live.data.summary.counts.on_break} người đang break`} tone="success" />
            <SummaryCard icon={LogIn} label="Chưa check-in" value={live.data.summary.counts.not_checked_in} detail={`${live.data.summary.counts.absent} vắng mặt`} tone="warning" />
            <SummaryCard icon={ShieldAlert} label="Cần xử lý" value={live.data.summary.counts.missing_checkout + live.data.summary.understaffedShifts} detail={`${live.data.summary.counts.missing_checkout} thiếu check-out · ${live.data.summary.understaffedShifts} ca thiếu người`} tone="danger" />
          </div>

          {live.data.items.length ? (
            <div className="grid min-w-0 gap-5 xl:grid-cols-[330px_minmax(0,1fr)]">
              <ShiftRail shifts={live.data.items} selectedId={selectedShiftId} onSelect={(id) => { setSelectedShiftId(id); setStateFilter('all'); }} />
              {selectedShift && (
                <ShiftDetail
                  shift={selectedShift}
                  employees={employees}
                  stateFilter={stateFilter}
                  setStateFilter={setStateFilter}
                  lateGraceMinutes={live.data.policy.lateGraceMinutes}
                />
              )}
            </div>
          ) : (
            <div className="border border-dashed border-line bg-surface p-12 text-center shadow-panel">
              <CalendarDays className="mx-auto size-8 text-brand/45" />
              <h2 className="mt-4 font-extrabold">Không có ca đã công bố</h2>
              <p className="mt-2 text-sm text-muted">Không tìm thấy ca phù hợp với ngày và phạm vi đang chọn.</p>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}

function ShiftRail({ shifts, selectedId, onSelect }: { shifts: LiveShiftItem[]; selectedId: string; onSelect: (id: string) => void }) {
  return (
    <aside className="border border-line bg-surface shadow-panel">
      <header className="border-b border-line p-4">
        <p className="font-extrabold">Danh sách ca</p>
        <p className="mt-1 text-xs text-muted">{shifts.length} ca đã công bố trong phạm vi theo dõi.</p>
      </header>
      <div className="max-h-[680px] divide-y divide-line overflow-y-auto">
        {shifts.map((shift) => {
          const active = shift.id === selectedId;
          return (
            <button key={shift.id} onClick={() => onSelect(shift.id)} className={cn('block w-full border-l-4 p-4 text-left transition', active ? 'border-l-brand bg-info-soft/65' : 'border-l-transparent hover:bg-canvas/70')}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-extrabold">{shift.name}</p>
                  <p className="mt-1 font-mono text-xs font-bold text-muted">{timeRange(shift.startsAt, shift.endsAt)}</p>
                </div>
                <ChevronRight className={cn('mt-1 size-4 shrink-0', active ? 'text-brand' : 'text-muted/50')} />
              </div>
              <p className="mt-3 truncate text-xs text-muted">{shift.branch.name}{shift.department ? ` · ${shift.department.name}` : ''}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <TinyMetric className="bg-success-soft text-success" value={shift.counts.working} label="làm" />
                <TinyMetric className="bg-info-soft text-info" value={shift.counts.on_break} label="nghỉ" />
                <TinyMetric className="bg-warning-soft text-warning-strong" value={shift.counts.not_checked_in} label="chưa vào" />
                {(shift.counts.absent + shift.counts.missing_checkout > 0) && <TinyMetric className="bg-danger-soft text-danger" value={shift.counts.absent + shift.counts.missing_checkout} label="lỗi" />}
              </div>
              <div className="mt-3 h-1 bg-line/70"><div className="h-full bg-brand" style={{ width: `${shift.assignedHeadcount ? Math.min(((shift.counts.working + shift.counts.on_break + shift.counts.checked_out) / shift.assignedHeadcount) * 100, 100) : 0}%` }} /></div>
              <p className={cn('mt-2 text-[10px] font-bold uppercase', shift.missingHeadcount > 0 ? 'text-danger' : 'text-muted')}>{shift.assignedHeadcount}/{shift.requiredHeadcount} nhân sự{shift.missingHeadcount > 0 ? ` · thiếu ${shift.missingHeadcount}` : ''}</p>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

function ShiftDetail({ shift, employees, stateFilter, setStateFilter, lateGraceMinutes }: { shift: LiveShiftItem; employees: LiveShiftEmployee[]; stateFilter: StateFilter; setStateFilter: (state: StateFilter) => void; lateGraceMinutes: number }) {
  const filters: Array<{ state: StateFilter; label: string; count: number }> = [
    { state: 'all', label: 'Tất cả', count: shift.assignedHeadcount },
    ...stateOrder.map((state) => ({ state, label: stateMeta[state].shortLabel, count: shift.counts[state] })),
  ];

  return (
    <section className="min-w-0 border border-line bg-surface shadow-panel">
      <header className="border-b border-line p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-black tracking-[-0.025em]">{shift.name}</h2>
              <OperationalBadge status={shift.operationalStatus} />
            </div>
            <p className="mt-2 text-sm text-muted">{shift.branch.name}{shift.department ? ` · ${shift.department.name}` : ''}{shift.position ? ` · ${shift.position.name}` : ''}</p>
          </div>
          <div className="grid grid-cols-2 gap-px bg-line text-center sm:grid-cols-4">
            <ShiftFact label="Bắt đầu" value={format(new Date(shift.startsAt), 'HH:mm')} />
            <ShiftFact label="Kết thúc" value={format(new Date(shift.endsAt), 'HH:mm')} />
            <ShiftFact label="Break" value={formatDurationMinutes(shift.allowedBreakMinutes)} />
            <ShiftFact label="Nhân sự" value={`${shift.assignedHeadcount}/${shift.requiredHeadcount}`} danger={shift.missingHeadcount > 0} />
          </div>
        </div>
        <div className="mt-5 flex gap-2 overflow-x-auto pb-1">
          {filters.map((filter) => (
            <button key={filter.state} onClick={() => setStateFilter(filter.state)} className={cn('shrink-0 border px-3 py-2 text-xs font-extrabold transition', stateFilter === filter.state ? 'border-brand bg-brand text-white' : 'border-line bg-surface text-muted hover:border-brand/40 hover:text-ink')}>
              {filter.label} <span className={cn('ml-1 font-mono', stateFilter === filter.state ? 'text-white/75' : 'text-ink')}>{filter.count}</span>
            </button>
          ))}
        </div>
      </header>

      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[820px] border-collapse text-left">
          <thead><tr className="border-b border-line bg-canvas/65 text-[10px] font-extrabold uppercase tracking-wide text-muted"><th className="px-5 py-3">Nhân viên</th><th className="px-4 py-3">Kế hoạch</th><th className="px-4 py-3">Thực tế</th><th className="px-4 py-3">Trạng thái</th><th className="px-5 py-3">Cảnh báo</th></tr></thead>
          <tbody className="divide-y divide-line">
            {employees.map((item) => <EmployeeRow key={item.assignmentId} item={item} shift={shift} lateGraceMinutes={lateGraceMinutes} />)}
          </tbody>
        </table>
      </div>
      <div className="divide-y divide-line md:hidden">
        {employees.map((item) => <EmployeeMobileCard key={item.assignmentId} item={item} shift={shift} />)}
      </div>
      {!employees.length && <div className="p-10 text-center"><UsersRound className="mx-auto size-6 text-muted/45" /><p className="mt-3 text-sm font-bold">Không có nhân viên ở trạng thái này</p></div>}
    </section>
  );
}

function EmployeeRow({ item, shift, lateGraceMinutes }: { item: LiveShiftEmployee; shift: LiveShiftItem; lateGraceMinutes: number }) {
  const meta = stateMeta[item.state];
  return (
    <tr className="align-middle hover:bg-canvas/45">
      <td className="px-5 py-4"><EmployeeIdentity item={item} /></td>
      <td className="px-4 py-4"><p className="font-mono text-xs font-bold">{timeRange(shift.startsAt, shift.endsAt)}</p><p className="mt-1 font-mono text-[11px] text-muted">Break {formatDurationMinutes(shift.allowedBreakMinutes)}</p></td>
      <td className="px-4 py-4"><p className="font-mono text-xs font-bold">{clockValue(item.attendance.checkInAt)} → {clockValue(item.attendance.checkOutAt)}</p><p className={cn('mt-1 font-mono text-[11px]', item.attendance.breakMinutes > item.attendance.allowedBreakMinutes ? 'font-bold text-danger' : 'text-muted')}>Đã nghỉ {formatDurationMinutes(item.attendance.breakMinutes)}</p></td>
      <td className="px-4 py-4"><span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-extrabold uppercase', meta.className)}><meta.icon className="size-3.5" />{meta.label}</span>{item.attendance.lateMinutes > lateGraceMinutes && <p className="mt-1.5 font-mono text-[10px] font-bold text-warning-strong">Trễ {formatDurationMinutes(item.attendance.lateMinutes)}</p>}</td>
      <td className="px-5 py-4"><BadgeList badges={item.badges} /></td>
    </tr>
  );
}

function EmployeeMobileCard({ item, shift }: { item: LiveShiftEmployee; shift: LiveShiftItem }) {
  const meta = stateMeta[item.state];
  return <div className="p-4"><div className="flex items-start justify-between gap-3"><EmployeeIdentity item={item} /><span className={cn('shrink-0 px-2 py-1 text-[9px] font-extrabold uppercase', meta.className)}>{meta.shortLabel}</span></div><div className="mt-4 grid grid-cols-2 gap-px bg-line"><ShiftFact label="Kế hoạch" value={timeRange(shift.startsAt, shift.endsAt)} /><ShiftFact label="Thực tế" value={`${clockValue(item.attendance.checkInAt)} → ${clockValue(item.attendance.checkOutAt)}`} /></div><div className="mt-3 flex items-center justify-between gap-3 text-xs"><span className="font-mono text-muted">Break {formatDurationMinutes(item.attendance.breakMinutes)}/{formatDurationMinutes(item.attendance.allowedBreakMinutes)}</span><BadgeList badges={item.badges} /></div></div>;
}

function EmployeeIdentity({ item }: { item: LiveShiftEmployee }) {
  const initials = item.employee.fullName.split(/\s+/).filter(Boolean).slice(-2).map((part) => part[0]?.toUpperCase()).join('');
  return <div className="flex min-w-0 items-center gap-3"><span className="grid size-9 shrink-0 place-items-center bg-info-soft text-xs font-black text-brand">{initials}</span><div className="min-w-0"><p className="truncate text-sm font-extrabold">{item.employee.fullName}</p><p className="mt-1 truncate text-[11px] text-muted">{item.employee.employeeCode}{item.employee.position ? ` · ${item.employee.position.name}` : ''}</p></div></div>;
}

function BadgeList({ badges }: { badges: LiveShiftBadge[] }) {
  if (!badges.length) return <span className="text-xs text-muted/70">Không có</span>;
  return <div className="flex flex-wrap justify-end gap-1.5 md:justify-start">{badges.map((badge) => <span key={badge} className={cn('px-2 py-1 text-[9px] font-extrabold uppercase', badgeMeta[badge].className)}>{badgeMeta[badge].label}</span>)}</div>;
}

function FilterField({ label, icon: Icon, children }: { label: string; icon: typeof CalendarDays; children: React.ReactNode }) {
  return <label className="block bg-surface p-3"><span className="flex items-center gap-2 px-1 text-[10px] font-extrabold uppercase tracking-wide text-muted"><Icon className="size-3.5 text-brand" />{label}</span><span className="mt-1 block">{children}</span></label>;
}

function SummaryCard({ icon: Icon, label, value, detail, tone }: { icon: typeof UsersRound; label: string; value: number; detail: string; tone: 'brand' | 'success' | 'warning' | 'danger' }) {
  const tones = { brand: 'bg-info-soft text-brand', success: 'bg-success-soft text-success', warning: 'bg-warning-soft text-warning-strong', danger: 'bg-danger-soft text-danger' };
  return <article className="border border-line bg-surface p-4 shadow-panel sm:p-5"><div className="flex items-start justify-between"><div><p className="text-[10px] font-extrabold uppercase tracking-wide text-muted">{label}</p><p className="mt-2 font-mono text-3xl font-black tracking-[-0.06em]">{value}</p></div><span className={cn('grid size-10 place-items-center', tones[tone])}><Icon className="size-5" /></span></div><p className="mt-3 text-xs text-muted">{detail}</p></article>;
}

function ShiftFact({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return <div className="min-w-[88px] bg-canvas/70 px-3 py-2.5"><p className="text-[9px] font-extrabold uppercase text-muted">{label}</p><p className={cn('mt-1 whitespace-nowrap font-mono text-xs font-black', danger && 'text-danger')}>{value}</p></div>;
}

function TinyMetric({ value, label, className }: { value: number; label: string; className: string }) {
  return <span className={cn('px-2 py-1 text-[9px] font-extrabold uppercase', className)}>{value} {label}</span>;
}

function OperationalBadge({ status }: { status: LiveShiftItem['operationalStatus'] }) {
  const values = { upcoming: ['Sắp diễn ra', 'bg-info-soft text-info'], in_progress: ['Đang diễn ra', 'bg-success-soft text-success'], finished: ['Đã kết thúc', 'bg-canvas text-muted'] } as const;
  return <span className={cn('px-2.5 py-1 text-[9px] font-extrabold uppercase', values[status][1])}>{values[status][0]}</span>;
}

function LoadingState() {
  return <div className="grid min-h-[420px] place-items-center border border-line bg-surface shadow-panel"><div className="text-center"><LoaderCircle className="mx-auto size-7 animate-spin text-brand" /><p className="mt-3 text-sm font-bold">Đang tổng hợp trạng thái các ca...</p><p className="mt-1 text-xs text-muted">Đối chiếu lịch phân ca và sự kiện chấm công.</p></div></div>;
}

function ErrorState({ message, retry }: { message: string; retry: () => void }) {
  return <div className="border border-danger/25 bg-danger-soft p-6 text-center"><AlertTriangle className="mx-auto size-6 text-danger" /><p className="mt-3 font-extrabold text-danger">Không thể tải dữ liệu vận hành</p><p className="mt-1 text-sm text-danger/80">{message}</p><Button className="mt-4" variant="outline" onClick={retry}><RefreshCw className="size-4" />Thử lại</Button></div>;
}

function timeRange(startsAt: string, endsAt: string) {
  return `${format(new Date(startsAt), 'HH:mm')}–${format(new Date(endsAt), 'HH:mm')}`;
}

function clockValue(value: string | null) {
  return value ? format(new Date(value), 'HH:mm') : '--:--';
}
