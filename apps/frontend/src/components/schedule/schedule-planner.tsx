"use client";

import { formatApp, toUtcIsoInAppTimezone } from "@/lib/app-timezone";

import {
  closestCenter,
  DndContext,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import {
  AlertCircle,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  LoaderCircle,
  LockKeyhole,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Settings2,
  Trash2,
  UserPlus,
  UsersRound,
  X,
} from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addDays,
  addMonths,
  addWeeks,
  differenceInCalendarDays,
  endOfMonth,
  format,
  isSameDay,
  isSameMonth,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { vi } from "date-fns/locale";
import { useAuth } from "@/components/auth/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  applyScheduleTemplate,
  assignEmployees,
  copySchedule,
  createShift,
  createShiftTemplate,
  deleteShift,
  deleteShiftTemplate,
  getEmployeeScheduleGrid,
  getScheduleOptions,
  getScheduleTemplates,
  getShiftAssignments,
  getShiftCandidates,
  getShifts,
  getShiftTemplates,
  moveShift,
  publishSchedule,
  removeShiftAssignment,
  repeatShift,
  saveScheduleTemplateFromRange,
  updateShift,
  updateShiftTemplate,
  validateSchedule,
  type EmployeeScheduleGrid as EmployeeScheduleGridData,
  type ScheduleOptions,
  type ScheduleTemplate as CalendarTemplate,
  type ScheduleValidation,
  type ShiftItem,
  type ShiftPage,
  type ShiftPayload,
  type ShiftStatus,
  type ShiftTemplate,
  type ShiftTemplatePayload,
} from "@/lib/schedules-api";
import { cn } from "@/lib/utils";
import { generateBusinessCode } from "@/lib/business-code";
import { formatDurationMinutes } from "@/lib/time-format";

type ViewMode = "day" | "week" | "month" | "list";
type Operation =
  | { type: "repeat"; shift: ShiftItem }
  | { type: "delete"; shift: ShiftItem }
  | {
      type:
        | "copy"
        | "save-template"
        | "apply-template"
        | "validate"
        | "publish";
    };
const input =
  "h-10 w-full rounded-sm border border-line bg-surface px-3 text-sm outline-none focus:border-brand";
const labels: Record<ShiftStatus, string> = {
  draft: "Bản nháp",
  published: "Đã công bố",
  completed: "Hoàn thành",
  cancelled: "Đã hủy",
};
const isShiftLocked = (shift: ShiftItem, now = Date.now()) =>
  !shift.canModify ||
  (shift.status === "published" &&
    new Date(shift.startsAt).getTime() <= now);
const local = (date: Date | string) => {
  const value = new Date(date);
  return new Date(value.getTime() - value.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
};
const rangeFor = (date: Date, mode: ViewMode) => {
  if (mode === "day") return [startOfDay(date), addDays(startOfDay(date), 1)];
  if (mode === "month") {
    const from = startOfWeek(startOfMonth(date), { weekStartsOn: 1 });
    return [
      from,
      addDays(startOfWeek(endOfMonth(date), { weekStartsOn: 1 }), 7),
    ];
  }
  const from = startOfWeek(date, { weekStartsOn: 1 });
  return [from, addDays(from, 7)];
};
type ShiftMove = { shift: ShiftItem; startsAt: string; endsAt: string };
const moveToDay = (shift: ShiftItem, day: Date): ShiftMove => {
  const start = new Date(shift.startsAt);
  const duration = new Date(shift.endsAt).getTime() - start.getTime();
  start.setFullYear(day.getFullYear(), day.getMonth(), day.getDate());
  return {
    shift,
    startsAt: start.toISOString(),
    endsAt: new Date(start.getTime() + duration).toISOString(),
  };
};

export function SchedulePlanner() {
  const qc = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { hasPermission } = useAuth();
  const manage = hasPermission("schedules.manage"),
    assign = hasPermission("schedules.assign"),
    templatesManage = hasPermission("schedules.templates.manage"),
    canPublish = hasPermission("schedules.publish");
  const [anchor, setAnchor] = useState(() => {
      const value = searchParams.get("date");
      const parsed = value ? new Date(`${value}T12:00:00`) : new Date();
      return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
    }),
    [mode, setMode] = useState<ViewMode>(() => {
      const value = searchParams.get("view");
      return value === "day" || value === "month" || value === "list" ? value : "week";
    });
  const [now, setNow] = useState(() => Date.now());
  const [branchId, setBranch] = useState(() => searchParams.get("branchId") ?? ""),
    [departmentId, setDepartment] = useState(() => searchParams.get("departmentId") ?? ""),
    [status, setStatus] = useState(() => searchParams.get("status") ?? ""),
    [search, setSearch] = useState(() => searchParams.get("search") ?? "");
  const deferred = useDeferredValue(search);
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    const values: Record<string, string> = {
      date: formatApp(anchor, "yyyy-MM-dd"),
      view: mode === "week" ? "" : mode,
      branchId,
      departmentId,
      status,
      search: deferred.trim(),
    };
    Object.entries(values).forEach(([key, value]) => value ? params.set(key, value) : params.delete(key));
    const queryString = params.toString();
    if (queryString !== searchParams.toString()) router.replace(`${pathname}?${queryString}`, { scroll: false });
  }, [anchor, branchId, deferred, departmentId, mode, pathname, router, searchParams, status]);
  const [editor, setEditor] = useState<{
      shift: ShiftItem | null;
      date: Date;
    } | null>(null),
    [templateOpen, setTemplateOpen] = useState(false),
    [assigning, setAssigning] = useState<ShiftItem | null>(null),
    [operation, setOperation] = useState<Operation | null>(null),
    [pendingMove, setPendingMove] = useState<ShiftMove | null>(null);
  const options = useQuery({
    queryKey: ["schedule-options"],
    queryFn: getScheduleOptions,
  });
  const templates = useQuery({
    queryKey: ["shift-templates"],
    queryFn: getShiftTemplates,
  });
  const scheduleTemplates = useQuery({
    queryKey: ["schedule-templates"],
    queryFn: getScheduleTemplates,
  });
  const [from, to] = useMemo(() => rangeFor(anchor, mode), [anchor, mode]);
  const shiftQueryKey = [
    "shifts",
    from.toISOString(),
    to.toISOString(),
    branchId,
    departmentId,
    status,
    deferred,
  ] as const;
  const shifts = useQuery({
    queryKey: shiftQueryKey,
    queryFn: () =>
      getShifts({
        from: from.toISOString(),
        to: to.toISOString(),
        branchId: branchId || undefined,
        departmentId: departmentId || undefined,
        status: (status as ShiftStatus) || undefined,
        search: deferred || undefined,
        limit: 200,
      }),
  });
  const employeeGrid = useQuery({
    queryKey: [
      "shifts",
      "employee-grid",
      from.toISOString(),
      to.toISOString(),
      branchId,
      departmentId,
      status,
      deferred,
    ],
    queryFn: () =>
      getEmployeeScheduleGrid({
        from: from.toISOString(),
        to: to.toISOString(),
        branchId: branchId || undefined,
        departmentId: departmentId || undefined,
        status: (status as ShiftStatus) || undefined,
        search: deferred || undefined,
      }),
  });
  const items = shifts.data?.items ?? [],
    summary = shifts.data?.summary;
  const hasBranches = Boolean(options.data?.branches.length);
  const hasEmployees = Boolean(employeeGrid.data?.employees.length);
  const moving = useMutation({
    meta: { successMessage: "Đã di chuyển ca làm" },
    mutationFn: ({ shift, startsAt, endsAt }: ShiftMove) =>
      moveShift(shift.id, startsAt, endsAt),
    onMutate: async (variables) => {
      await qc.cancelQueries({ queryKey: shiftQueryKey });
      const previous = qc.getQueryData<ShiftPage>(shiftQueryKey);
      qc.setQueryData<ShiftPage>(shiftQueryKey, (current) =>
        current
          ? {
              ...current,
              items: current.items.map((item) =>
                item.id === variables.shift.id
                  ? {
                      ...item,
                      startsAt: variables.startsAt,
                      endsAt: variables.endsAt,
                    }
                  : item,
              ),
            }
          : current,
      );
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) qc.setQueryData(shiftQueryKey, context.previous);
    },
    onSuccess: (saved) => {
      qc.setQueryData<ShiftPage>(shiftQueryKey, (current) =>
        current
          ? {
              ...current,
              items: current.items.map((item) =>
                item.id === saved.id ? saved : item,
              ),
            }
          : current,
      );
    },
    onSettled: async () => {
      await qc.invalidateQueries({ queryKey: ["shifts"] });
    },
  });
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const move = (n: number) =>
    setAnchor((d) =>
      mode === "month"
        ? addMonths(d, n)
        : mode === "day"
          ? addDays(d, n)
          : addWeeks(d, n),
    );
  const title =
    mode === "day"
      ? formatApp(anchor, "EEEE, dd/MM/yyyy", { locale: vi })
      : mode === "month"
        ? formatApp(anchor, "'Tháng' MM/yyyy")
        : `${formatApp(from, "dd/MM")} – ${formatApp(addDays(to, -1), "dd/MM/yyyy")}`;
  const requestMove = (shift: ShiftItem, day: Date) => {
    const target = moveToDay(shift, day);
    if (target.startsAt === shift.startsAt) return;
    if (
      shift.status === "published" ||
      new Date(target.startsAt).getTime() <= Date.now()
    )
      setPendingMove(target);
    else moving.mutate(target);
  };
  const actions = {
    manage,
    assign,
    now,
    movingId: moving.isPending ? (moving.variables?.shift.id ?? null) : null,
    move: requestMove,
    edit: (shift: ShiftItem) =>
      setEditor({ shift, date: new Date(shift.startsAt) }),
    assignTo: setAssigning,
    repeat: (shift: ShiftItem) => setOperation({ type: "repeat", shift }),
    remove: (shift: ShiftItem) => setOperation({ type: "delete", shift }),
  };
  return (
    <div className="mx-auto w-full min-w-0 max-w-[1720px] space-y-4 overflow-hidden sm:space-y-5">
      <header className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-widest text-brand sm:text-xs">
            Trung tâm phân ca
          </p>
          <h1 className="mt-1.5 text-2xl font-black sm:mt-2 sm:text-3xl">
            Lịch & phân ca
          </h1>
          <p className="mt-1.5 text-xs leading-5 text-muted sm:mt-2 sm:text-sm">
            Lập kế hoạch ngày, tuần, tháng và kiểm soát độ phủ nhân sự.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          {manage && (
            <Button
              className="order-1"
              variant="brand"
              disabled={!hasBranches}
              onClick={() => setEditor({ shift: null, date: anchor })}
            >
              <Plus className="size-4" /> Tạo ca
            </Button>
          )}
          {canPublish && (
            <Button
              className="order-2"
              variant="outline"
              disabled={!items.length}
              onClick={() => setOperation({ type: "publish" })}
            >
              Công bố
            </Button>
          )}
          {(manage || templatesManage || canPublish) && <details className="group relative order-3">
            <summary className="flex h-10 cursor-pointer list-none items-center gap-2 border border-line bg-surface px-4 text-sm font-bold shadow-sm hover:bg-canvas [&::-webkit-details-marker]:hidden"><MoreHorizontal className="size-4" />Công cụ<ChevronDown className="size-3.5 transition group-open:rotate-180" /></summary>
            <div className="absolute right-0 top-12 z-40 w-60 border border-line bg-surface p-1.5 shadow-2xl">
              {canPublish && <button disabled={!items.length} onClick={() => setOperation({ type: "validate" })} className="flex h-10 w-full items-center px-3 text-left text-sm font-semibold hover:bg-canvas disabled:opacity-40">Kiểm tra lịch</button>}
              {manage && <button disabled={!hasBranches || !items.length} onClick={() => setOperation({ type: "copy" })} className="flex h-10 w-full items-center px-3 text-left text-sm font-semibold hover:bg-canvas disabled:opacity-40">Sao chép lịch</button>}
              {templatesManage && <><button disabled={!items.length} onClick={() => setOperation({ type: "save-template" })} className="flex h-10 w-full items-center px-3 text-left text-sm font-semibold hover:bg-canvas disabled:opacity-40">Lưu thành template</button><button disabled={!hasBranches} onClick={() => setOperation({ type: "apply-template" })} className="flex h-10 w-full items-center px-3 text-left text-sm font-semibold hover:bg-canvas disabled:opacity-40">Áp dụng template</button><button disabled={!hasBranches} onClick={() => setTemplateOpen(true)} className="flex h-10 w-full items-center gap-2 px-3 text-left text-sm font-semibold hover:bg-canvas disabled:opacity-40"><Settings2 className="size-4" />Quản lý mẫu ca</button></>}
            </div>
          </details>}
        </div>
      </header>
      {options.data && (!hasBranches || !hasEmployees) && (
        <section className="flex flex-col gap-3 border border-warning/30 bg-warning-soft p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-extrabold text-warning-strong">
              Chưa thể lập lịch
            </p>
            <p className="mt-1 text-xs text-muted">
              {!hasBranches
                ? "Tạo chi nhánh, phòng ban và vị trí trước."
                : "Thêm ít nhất một nhân viên trước khi tạo và phân ca."}
            </p>
          </div>
          <Button asChild size="sm" variant="outline">
            <a href={!hasBranches ? "/admin/organization" : "/admin/employees"}>
              Hoàn tất thiết lập
            </a>
          </Button>
        </section>
      )}
      <section className="grid grid-cols-3 border border-line bg-surface">
        <Metric label="Tổng ca" value={summary?.total ?? 0} />
        <Metric label="Nhu cầu" value={summary?.requiredHeadcount ?? 0} />
        <Metric label="Đã phân" value={summary?.assignedHeadcount ?? 0} />
      </section>
      <section className="min-w-0 overflow-hidden border border-line bg-surface">
        <div className="grid min-w-0 gap-3 border-b border-line bg-canvas/40 p-3 sm:p-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
          <div className="flex min-w-0 flex-wrap gap-2">
            <div className="flex h-10 min-w-[250px] flex-1 border border-line bg-surface sm:flex-none">
              <button
                aria-label="Khoảng trước"
                onClick={() => move(-1)}
                className="shrink-0 px-2.5"
              >
                <ChevronLeft className="size-4" />
              </button>
              <span className="min-w-0 flex-1 border-x border-line px-2 py-3 text-center text-[11px] font-extrabold capitalize sm:min-w-52 sm:px-3 sm:text-xs">
                {title}
              </span>
              <button
                aria-label="Khoảng sau"
                onClick={() => move(1)}
                className="shrink-0 px-2.5"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
            <Button
              className="shrink-0"
              variant="subtle"
              onClick={() => setAnchor(new Date())}
            >
              Hôm nay
            </Button>
            <select
              className={cn(input, "min-w-[150px] flex-1 sm:w-auto")}
              value={branchId}
              onChange={(e) => setBranch(e.target.value)}
            >
              <option value="">Tất cả chi nhánh</option>
              {options.data?.branches.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
            <select
              className={cn(input, "min-w-[150px] flex-1 sm:w-auto")}
              value={departmentId}
              onChange={(e) => setDepartment(e.target.value)}
            >
              <option value="">Tất cả phòng ban</option>
              {options.data?.departments.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(180px,1fr)_auto] xl:flex">
            <label className="flex h-10 min-w-0 items-center border border-line bg-surface px-3">
              <Search className="mr-2 size-4 shrink-0 text-muted" />
              <input
                className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                placeholder="Tìm ca..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <select
              className={cn(input, "sm:w-auto")}
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">Mọi trạng thái</option>
              {Object.entries(labels).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <div className="flex h-10 min-w-0 border border-line bg-canvas p-0.5 sm:col-span-2 xl:col-span-1">
              {(["day", "week", "month", "list"] as ViewMode[]).map((x) => (
                <button
                  key={x}
                  onClick={() => setMode(x)}
                  className={cn(
                    "min-w-0 flex-1 px-2 text-[11px] font-bold sm:px-3 sm:text-xs xl:flex-none",
                    mode === x && "bg-surface text-brand shadow-sm",
                  )}
                >
                  {
                    {
                      day: "Ngày",
                      week: "Tuần",
                      month: "Tháng",
                      list: "Danh sách",
                    }[x]
                  }
                </button>
              ))}
            </div>
          </div>
        </div>
        {manage && (mode === "week" || mode === "month") && (
          <div className="border-b border-info/20 bg-info-soft px-3 py-2 text-[11px] font-medium leading-5 text-muted sm:px-4 sm:text-xs">
            <GripVertical className="mr-1 inline size-3.5 text-brand" />
            Kéo ca sang ngày khác trong vùng lịch. Ca nháp luôn có thể chỉnh
            sửa; ca đã công bố sẽ khóa khi bắt đầu.
          </div>
        )}
        {shifts.isLoading ? (
          <Loading />
        ) : mode === "month" ? (
          <Month anchor={anchor} from={from} items={items} actions={actions} />
        ) : mode === "day" ? (
          <Day
            items={items}
            actions={actions}
            create={() => setEditor({ shift: null, date: anchor })}
          />
        ) : mode === "week" ? (
          <Week
            from={from}
            items={items}
            actions={actions}
            create={(date) => setEditor({ shift: null, date })}
          />
        ) : (
          <List items={items} actions={actions} />
        )}
      </section>
      <EmployeeScheduleGrid
        from={from}
        to={to}
        data={employeeGrid.data}
        loading={employeeGrid.isLoading}
        error={employeeGrid.error?.message}
        canOpenShift={assign}
        openShift={setAssigning}
      />
      {(options.error || templates.error || shifts.error) && (
        <ErrorBox
          text={
            (options.error || templates.error || shifts.error)?.message ??
            "Không tải được dữ liệu"
          }
        />
      )}
      {editor && options.data && (
        <ShiftEditor
          {...editor}
          options={options.data}
          templates={templates.data ?? []}
          close={() => setEditor(null)}
        />
      )}
      {templateOpen && options.data && (
        <TemplateEditor
          options={options.data}
          templates={templates.data ?? []}
          close={() => setTemplateOpen(false)}
        />
      )}
      {assigning && (
        <AssignmentEditor shift={assigning} close={() => setAssigning(null)} />
      )}
      {operation && options.data && (
        <ScheduleOperationModal
          operation={operation}
          from={from}
          to={to}
          branchId={branchId}
          options={options.data}
          templates={scheduleTemplates.data ?? []}
          close={() => setOperation(null)}
        />
      )}
      {pendingMove && (
        <MoveShiftModal
          move={pendingMove}
          pending={moving.isPending}
          close={() => setPendingMove(null)}
          confirm={() =>
            moving.mutate(pendingMove, {
              onSuccess: () => setPendingMove(null),
            })
          }
        />
      )}
    </div>
  );
}

type Actions = {
  manage: boolean;
  assign: boolean;
  now: number;
  movingId: string | null;
  move: (s: ShiftItem, day: Date) => void;
  edit: (s: ShiftItem) => void;
  assignTo: (s: ShiftItem) => void;
  repeat: (s: ShiftItem) => void;
  remove: (s: ShiftItem) => void;
};
function Week({
  from,
  items,
  actions,
  create,
}: {
  from: Date;
  items: ShiftItem[];
  actions: Actions;
  create: (d: Date) => void;
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i));
  return (
    <ScheduleDragContext items={items} actions={actions}>
      <div className="w-full overflow-x-auto overscroll-x-contain">
        <div className="grid min-w-[840px] grid-cols-7 divide-x divide-line lg:min-w-[1050px]">
          {days.map((day) => (
            <DropDay
              key={day.toISOString()}
              day={day}
              className="min-h-[420px] lg:min-h-[500px]"
            >
              <div
                className={cn(
                  "sticky top-0 z-10 border-b border-line bg-surface p-2.5 lg:p-3",
                  isSameDay(day, new Date()) && "bg-info-soft",
                )}
              >
                <b className="text-[11px] capitalize lg:text-xs">
                  {formatApp(day, "EEEE", { locale: vi })}
                </b>
                <p className="font-mono text-lg lg:text-xl">
                  {formatApp(day, "dd")}
                </p>
              </div>
              <div className="space-y-2 p-1.5 lg:p-2">
                {items
                  .filter((s) => isSameDay(new Date(s.startsAt), day))
                  .map((s) => (
                    <DraggableCard key={s.id} shift={s} actions={actions} />
                  ))}
                {actions.manage && (
                  <button
                    className="h-9 w-full border border-dashed border-line text-[10px] lg:text-xs"
                    onClick={() => create(day)}
                  >
                    + Thêm ca
                  </button>
                )}
              </div>
            </DropDay>
          ))}
        </div>
      </div>
    </ScheduleDragContext>
  );
}
function Day({
  items,
  actions,
  create,
}: {
  items: ShiftItem[];
  actions: Actions;
  create: () => void;
}) {
  return (
    <div className="mx-auto min-h-[360px] max-w-4xl space-y-3 p-3 sm:min-h-[450px] sm:p-5">
      {items.map((s) => (
        <Card key={s.id} shift={s} actions={actions} wide />
      ))}
      {actions.manage && (
        <button
          className="h-10 w-full border border-dashed border-line text-sm"
          onClick={create}
        >
          + Thêm ca trong ngày
        </button>
      )}
    </div>
  );
}
function Month({
  anchor,
  from,
  items,
  actions,
}: {
  anchor: Date;
  from: Date;
  items: ShiftItem[];
  actions: Actions;
}) {
  return (
    <ScheduleDragContext items={items} actions={actions}>
      <div className="w-full overflow-x-auto overscroll-x-contain">
        <div className="grid min-w-[770px] grid-cols-7 lg:min-w-[980px]">
          {Array.from({ length: 42 }, (_, i) => addDays(from, i)).map((day) => (
            <DropDay
              key={day.toISOString()}
              day={day}
              className={cn(
                "min-h-28 border-b border-r border-line p-1.5 lg:min-h-32 lg:p-2",
                !isSameMonth(day, anchor) && "bg-canvas/60",
              )}
            >
              <b
                className={cn(
                  "font-mono text-[11px] lg:text-xs",
                  isSameDay(day, new Date()) && "bg-brand px-2 py-1 text-white",
                )}
              >
                {formatApp(day, "d")}
              </b>
              {items
                .filter((s) => isSameDay(new Date(s.startsAt), day))
                .slice(0, 4)
                .map((s) => (
                  <DraggableMonthShift key={s.id} shift={s} actions={actions} />
                ))}
            </DropDay>
          ))}
        </div>
      </div>
    </ScheduleDragContext>
  );
}
function List({ items, actions }: { items: ShiftItem[]; actions: Actions }) {
  return (
    <div>
      {items.map((s) => (
        <div
          key={s.id}
          className="grid gap-3 border-b border-line p-3 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_150px_150px_auto] sm:items-center sm:p-4"
        >
          <div className="min-w-0">
            <b className="block truncate text-sm">{s.name}</b>
            <p className="mt-1 truncate text-xs text-muted">
              {s.department?.name ?? "Mọi phòng ban"} ·{" "}
              {s.position?.name ?? "Mọi vị trí"}
            </p>
          </div>
          <div>
            <p className="text-[9px] font-bold uppercase text-muted sm:hidden">
              Thời gian
            </p>
            <span className="text-xs sm:text-sm">
              {formatApp(new Date(s.startsAt), "dd/MM HH:mm")}–
              {formatApp(new Date(s.endsAt), "HH:mm")}
            </span>
          </div>
          <div>
            <p className="text-[9px] font-bold uppercase text-muted sm:hidden">
              Độ phủ
            </p>
            <span className="text-xs sm:text-sm">
              {s.assignmentCount}/{s.requiredHeadcount} nhân viên
            </span>
          </div>
          <Buttons shift={s} actions={actions} />
        </div>
      ))}
    </div>
  );
}
function EmployeeScheduleGrid({
  from,
  to,
  data,
  loading,
  error,
  canOpenShift,
  openShift,
}: {
  from: Date;
  to: Date;
  data?: EmployeeScheduleGridData;
  loading: boolean;
  error?: string;
  canOpenShift: boolean;
  openShift: (shift: ShiftItem) => void;
}) {
  const [employeeSearch, setEmployeeSearch] = useState("");
  const days = useMemo(
    () =>
      Array.from(
        { length: Math.max(differenceInCalendarDays(to, from), 1) },
        (_, index) => addDays(from, index),
      ),
    [from, to],
  );
  const shiftsByEmployee = useMemo(() => {
    const shiftMap = new Map(
      (data?.shifts ?? []).map((shift) => [shift.id, shift]),
    );
    const result = new Map<string, ShiftItem[]>();
    data?.assignments.forEach((assignment) => {
      const shift = shiftMap.get(assignment.shiftId);
      if (shift)
        result.set(assignment.employeeId, [
          ...(result.get(assignment.employeeId) ?? []),
          shift,
        ]);
    });
    result.forEach((shifts) =>
      shifts.sort(
        (a, b) =>
          new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
      ),
    );
    return result;
  }, [data]);
  const conflictIds = useMemo(() => {
    const result = new Set<string>();
    shiftsByEmployee.forEach((shifts) => {
      for (let first = 0; first < shifts.length; first += 1) {
        for (let second = first + 1; second < shifts.length; second += 1) {
          if (
            new Date(shifts[second].startsAt) >= new Date(shifts[first].endsAt)
          )
            break;
          result.add(shifts[first].id);
          result.add(shifts[second].id);
        }
      }
    });
    return result;
  }, [shiftsByEmployee]);
  const groups = useMemo(() => {
    const normalized = employeeSearch.trim().toLocaleLowerCase("vi");
    const filtered = (data?.employees ?? []).filter(
      (employee) =>
        !normalized ||
        [
          employee.fullName,
          employee.employeeCode,
          employee.department.name,
          employee.position.name,
        ].some((value) => value.toLocaleLowerCase("vi").includes(normalized)),
    );
    const result = new Map<string, typeof filtered>();
    filtered.forEach((employee) =>
      result.set(employee.department.name, [
        ...(result.get(employee.department.name) ?? []),
        employee,
      ]),
    );
    return [...result.entries()];
  }, [data, employeeSearch]);
  const assignedEmployees =
    data?.employees.filter(
      (employee) => (shiftsByEmployee.get(employee.id)?.length ?? 0) > 0,
    ).length ?? 0;

  return (
    <section className="border border-line bg-surface shadow-panel">
      <header className="flex flex-col gap-4 border-b border-line p-4 sm:flex-row sm:items-end sm:justify-between sm:p-5">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-brand">
            Kiểm tra theo nhân viên
          </p>
          <h2 className="mt-1 text-lg font-black">Bảng phân ca</h2>
          <p className="mt-1 text-xs text-muted">
            {formatApp(from, "dd/MM/yyyy")} –{" "}
            {formatApp(addDays(to, -1), "dd/MM/yyyy")} · {assignedEmployees}/
            {data?.employees.length ?? 0} nhân viên đã có ca
          </p>
        </div>
        <label className="flex h-10 w-full min-w-0 items-center border border-line bg-surface px-3 sm:w-auto sm:min-w-64">
          <Search className="mr-2 size-4 shrink-0 text-muted" />
          <input
            className="min-w-0 flex-1 text-sm outline-none"
            value={employeeSearch}
            onChange={(event) => setEmployeeSearch(event.target.value)}
            placeholder="Tìm nhân viên, vị trí..."
          />
        </label>
      </header>
      {loading ? (
        <Loading />
      ) : error ? (
        <div className="p-4">
          <ErrorBox text={error} />
        </div>
      ) : !data?.employees.length ? (
        <div className="grid min-h-40 place-items-center p-8 text-sm text-muted">
          Không có nhân viên trong phạm vi đang chọn.
        </div>
      ) : (
        <div className="max-h-[720px] overflow-auto">
          <table className="w-max min-w-full border-collapse text-left">
            <thead className="sticky top-0 z-30 bg-surface shadow-[0_1px_0_var(--color-line)]">
              <tr>
                <th className="sticky left-0 z-40 w-[220px] min-w-[220px] border-r border-line bg-surface px-3 py-3 sm:w-[280px] sm:min-w-[280px] sm:px-4">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted">
                    Nhân viên
                  </span>
                  <p className="mt-1 text-[10px] font-semibold text-ink sm:text-xs">
                    Tổng giờ trong kỳ
                  </p>
                </th>
                {days.map((day) => (
                  <th
                    key={day.toISOString()}
                    className={cn(
                      "w-[132px] min-w-[132px] border-r border-line px-2.5 py-3 align-top sm:w-[156px] sm:min-w-[156px] sm:px-3",
                      isSameDay(day, new Date()) && "bg-info-soft",
                    )}
                  >
                    <p className="text-[9px] font-extrabold uppercase text-muted sm:text-[10px]">
                      {formatApp(day, "EEEE", { locale: vi })}
                    </p>
                    <div className="mt-1 flex items-baseline justify-between">
                      <b className="font-mono text-base sm:text-lg">
                        {formatApp(day, "dd")}
                      </b>
                      <span className="text-[9px] text-muted sm:text-[10px]">
                        {formatApp(day, "MM")}
                      </span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            {groups.map(([department, employees]) => (
              <tbody key={department} className="divide-y divide-line">
                <tr>
                  <td
                    colSpan={days.length + 1}
                    className="sticky left-0 z-10 border-y border-line bg-canvas px-4 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-muted"
                  >
                    {department} · {employees.length} nhân viên
                  </td>
                </tr>
                {employees.map((employee) => {
                  const employeeShifts =
                    shiftsByEmployee.get(employee.id) ?? [];
                  const minutes = employeeShifts.reduce(
                    (total, shift) =>
                      total +
                      Math.max(
                        (new Date(shift.endsAt).getTime() -
                          new Date(shift.startsAt).getTime()) /
                          60_000 -
                          shift.unpaidBreakMinutes,
                        0,
                      ),
                    0,
                  );
                  return (
                    <tr key={employee.id} className="group hover:bg-canvas/30">
                      <th className="sticky left-0 z-20 border-r border-line bg-surface p-2.5 group-hover:bg-[#f8fbff] sm:p-3">
                        <div className="flex items-center gap-2 sm:gap-3">
                          <span className="grid size-8 shrink-0 place-items-center border border-brand/15 bg-info-soft text-[9px] font-black text-brand sm:size-9 sm:text-[10px]">
                            {employee.initials}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[11px] font-extrabold sm:text-xs">
                              {employee.fullName}
                            </p>
                            <p className="mt-0.5 truncate text-[9px] text-muted sm:text-[10px]">
                              {employee.employeeCode} · {employee.position.name}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-mono text-[11px] font-black sm:text-xs">
                              {formatGridHours(minutes)}
                            </p>
                            <p className="text-[8px] text-muted sm:text-[9px]">
                              {employeeShifts.length} ca
                            </p>
                          </div>
                        </div>
                      </th>
                      {days.map((day) => {
                        const cellShifts = employeeShifts.filter((shift) =>
                          isSameDay(new Date(shift.startsAt), day),
                        );
                        return (
                          <td
                            key={day.toISOString()}
                            className={cn(
                              "h-[86px] border-r border-line p-1.5 align-top",
                              isSameDay(day, new Date()) && "bg-info-soft/35",
                            )}
                          >
                            {cellShifts.length ? (
                              <div className="space-y-1.5">
                                {cellShifts.map((shift) => {
                                  const conflict = conflictIds.has(shift.id);
                                  return (
                                    <button
                                      key={shift.id}
                                      type="button"
                                      disabled={!canOpenShift}
                                      onClick={() => openShift(shift)}
                                      title={
                                        canOpenShift
                                          ? "Mở chi tiết phân công"
                                          : `${shift.name} · ${formatApp(new Date(shift.startsAt), "HH:mm")}–${formatApp(new Date(shift.endsAt), "HH:mm")}`
                                      }
                                      className={cn(
                                        "w-full border-l-2 px-1.5 py-2 text-left transition-colors sm:px-2",
                                        shiftTone(shift),
                                        canOpenShift &&
                                          "hover:brightness-[0.98]",
                                        conflict &&
                                          "border border-danger bg-danger-soft text-danger",
                                      )}
                                    >
                                      <span className="flex items-center justify-between gap-1">
                                        <b className="font-mono text-[9px] sm:text-[10px]">
                                          {formatApp(
                                            new Date(shift.startsAt),
                                            "HH:mm",
                                          )}
                                          –
                                          {formatApp(
                                            new Date(shift.endsAt),
                                            "HH:mm",
                                          )}
                                        </b>
                                        {conflict && (
                                          <AlertCircle className="size-3.5 shrink-0" />
                                        )}
                                      </span>
                                      <span className="mt-1 block truncate text-[9px] font-extrabold sm:text-[10px]">
                                        {shift.name}
                                      </span>
                                      <span className="mt-0.5 block truncate text-[8px] opacity-70 sm:text-[9px]">
                                        {shift.position?.name ??
                                          shift.department?.name ??
                                          shift.branch.name}
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            ) : (
                              <div className="grid h-full min-h-16 place-items-center text-[10px] text-line">
                                —
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            ))}
          </table>
        </div>
      )}
      <footer className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line bg-canvas/40 px-3 py-3 text-[9px] font-semibold text-muted sm:px-4 sm:text-[10px]">
        <span>
          <i className="mr-1.5 inline-block size-2 bg-blue-200" />
          Đã công bố
        </span>
        <span>
          <i className="mr-1.5 inline-block size-2 bg-amber-200" />
          Bản nháp
        </span>
        <span>
          <AlertCircle className="mr-1 inline size-3 text-danger" />
          Trùng giờ
        </span>
        <span className="w-full sm:ml-auto sm:w-auto">
          Tự cập nhật theo bộ lọc phía trên
        </span>
      </footer>
    </section>
  );
}
function formatGridHours(minutes: number) {
  return formatDurationMinutes(minutes);
}
function shiftTone(shift: ShiftItem) {
  if (shift.status === "draft")
    return "border-amber-400 bg-amber-50 text-amber-900";
  if (shift.status === "cancelled")
    return "border-slate-300 bg-slate-100 text-slate-500";
  const tones = [
    "border-blue-500 bg-blue-50 text-blue-900",
    "border-emerald-500 bg-emerald-50 text-emerald-900",
    "border-cyan-500 bg-cyan-50 text-cyan-900",
    "border-sky-500 bg-sky-50 text-sky-900",
  ];
  const hash = [...shift.name].reduce(
    (total, character) => total + character.charCodeAt(0),
    0,
  );
  return tones[hash % tones.length];
}
function Card({
  shift,
  actions,
  wide,
  dragHandle,
}: {
  shift: ShiftItem;
  actions: Actions;
  wide?: boolean;
  dragHandle?: React.ReactNode;
}) {
  return (
    <article
      className={cn(
        "min-w-0 border-l-4 border-line bg-surface p-2.5 shadow-sm lg:p-3",
        shift.status === "draft" ? "border-l-warning" : "border-l-success",
        wide && "sm:flex sm:items-center sm:gap-5",
        actions.movingId === shift.id && "animate-pulse opacity-60",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-start gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-1">
            {dragHandle}
            <b
              className="block min-w-0 flex-1 truncate pt-0.5 text-[11px] lg:text-xs"
              title={shift.name}
            >
              {shift.name}
            </b>
          </div>
          <Badge
            className="shrink-0 whitespace-nowrap px-2 py-0.5 text-[9px] leading-4 lg:text-[10px]"
            variant={shift.status === "draft" ? "warning" : "success"}
          >
            {labels[shift.status]}
          </Badge>
        </div>
        <p className="mt-2 font-mono text-[10px] text-brand lg:text-xs">
          {formatApp(new Date(shift.startsAt), "HH:mm")}–
          {formatApp(new Date(shift.endsAt), "HH:mm")}
        </p>
        <p className="mt-2 truncate text-[9px] text-muted lg:text-[10px]">
          {shift.department?.name ?? "Mọi phòng ban"} ·{" "}
          {shift.position?.name ?? "Mọi vị trí"}
        </p>
        <p className="mt-1 flex gap-1 text-[9px] text-muted lg:text-[10px]">
          <UsersRound className="size-3" /> {shift.assignmentCount}/
          {shift.requiredHeadcount} người
        </p>
      </div>
      <Buttons shift={shift} actions={actions} />
    </article>
  );
}
function ScheduleDragContext({
  items,
  actions,
  children,
}: {
  items: ShiftItem[];
  actions: Actions;
  children: React.ReactNode;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 180, tolerance: 8 },
    }),
  );
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over) return;
    const shift = items.find((item) => item.id === active.id);
    const dateValue = String(over.id).replace("schedule-day:", "");
    const day = new Date(`${dateValue}T12:00:00`);
    if (
      shift &&
      !Number.isNaN(day.getTime()) &&
      !isSameDay(new Date(shift.startsAt), day)
    )
      actions.move(shift, day);
  };
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
    >
      {children}
    </DndContext>
  );
}
function DropDay({
  day,
  className,
  children,
}: {
  day: Date;
  className?: string;
  children: React.ReactNode;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: `schedule-day:${formatApp(day, "yyyy-MM-dd")}`,
  });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        className,
        isOver && "bg-info-soft ring-2 ring-inset ring-brand/40",
      )}
    >
      {children}
    </div>
  );
}
function DraggableCard({
  shift,
  actions,
}: {
  shift: ShiftItem;
  actions: Actions;
}) {
  const locked =
    !actions.manage ||
    isShiftLocked(shift, actions.now) ||
    actions.movingId !== null;
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: shift.id, disabled: locked });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        zIndex: isDragging ? 30 : undefined,
      }}
      title={
        locked
          ? (shift.lockReason ?? "Ca đã khóa")
          : "Giữ và kéo toàn bộ thẻ sang ngày khác"
      }
      className={cn(
        !locked && "cursor-grab touch-none select-none active:cursor-grabbing",
        isDragging && "relative opacity-70 shadow-xl",
      )}
      {...(!locked ? listeners : {})}
      {...(!locked ? attributes : {})}
    >
      <Card
        shift={shift}
        actions={actions}
        dragHandle={
          !locked ? (
            <span className="-ml-1 p-1 text-brand">
              <GripVertical className="size-3.5" />
            </span>
          ) : undefined
        }
      />
    </div>
  );
}
function DraggableMonthShift({
  shift,
  actions,
}: {
  shift: ShiftItem;
  actions: Actions;
}) {
  const locked =
    !actions.manage ||
    isShiftLocked(shift, actions.now) ||
    actions.movingId !== null;
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: shift.id, disabled: locked });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        zIndex: isDragging ? 30 : undefined,
      }}
      title={
        locked
          ? (shift.lockReason ?? "Ca đã khóa")
          : "Giữ và kéo toàn bộ ca sang ngày khác"
      }
      className={cn(
        "relative mt-1 flex w-full items-center border-l-2 border-brand bg-info-soft text-[10px]",
        !locked && "cursor-grab touch-none select-none active:cursor-grabbing",
        locked && "border-line bg-canvas text-muted",
        isDragging && "opacity-70 shadow-xl",
      )}
      {...(!locked ? listeners : {})}
      {...(!locked ? attributes : {})}
    >
      <GripVertical className="mx-1 size-3 shrink-0" />
      <button
        type="button"
        className="min-w-0 flex-1 truncate py-1 pr-1 text-left"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={() =>
          actions.assign ? actions.assignTo(shift) : actions.edit(shift)
        }
      >
        <b>{formatApp(new Date(shift.startsAt), "HH:mm")}</b> {shift.name}
        {locked ? " · Đã khóa" : ""}
      </button>
    </div>
  );
}
function Buttons({ shift, actions }: { shift: ShiftItem; actions: Actions }) {
  const locked = isShiftLocked(shift, actions.now);
  if (locked)
    return (
      <div className="mt-1 flex justify-end sm:mt-0">
        <span
          title={shift.lockReason ?? "Ca đã bắt đầu, không thể thay đổi"}
          className="flex items-center gap-1.5 px-1.5 py-1 text-[9px] font-bold text-muted lg:px-2 lg:text-[10px]"
        >
          <LockKeyhole className="size-3.5" />
          Đã khóa
        </span>
      </div>
    );
  return (
    <div
      className="mt-1 flex flex-wrap justify-end gap-0.5 sm:mt-0 lg:gap-1"
      onPointerDown={(event) => event.stopPropagation()}
    >
      {actions.assign && (
        <button
          title="Phân nhân viên"
          onClick={() => actions.assignTo(shift)}
          className="p-1.5 text-brand lg:p-2"
        >
          <UserPlus className="size-4" />
        </button>
      )}
      {actions.manage && (
        <>
          <button
            title="Lặp lại ca"
            onClick={() => actions.repeat(shift)}
            className="p-1.5 text-brand lg:p-2"
          >
            ↻
          </button>
          <button
            title="Sửa ca"
            onClick={() => actions.edit(shift)}
            className="p-1.5 lg:p-2"
          >
            <Pencil className="size-4" />
          </button>
          <button
            title="Xóa ca"
            onClick={() => actions.remove(shift)}
            className="p-1.5 text-danger lg:p-2"
          >
            <Trash2 className="size-4" />
          </button>
        </>
      )}
    </div>
  );
}

function ShiftEditor({
  shift,
  date,
  options,
  templates,
  close,
}: {
  shift: ShiftItem | null;
  date: Date;
  options: ScheduleOptions;
  templates: ShiftTemplate[];
  close: () => void;
}) {
  const qc = useQueryClient();
  const start = new Date(date);
  start.setHours(8, 0, 0, 0);
  const end = new Date(date);
  end.setHours(17, 0, 0, 0);
  const [form, setForm] = useState({
    name: shift?.name ?? "",
    branchId: shift?.branch.id ?? options.branches[0]?.id ?? "",
    departmentId: shift?.department?.id ?? "",
    positionId: shift?.position?.id ?? "",
    startsAt: local(shift?.startsAt ?? start),
    endsAt: local(shift?.endsAt ?? end),
    unpaidBreakMinutes: String(shift?.unpaidBreakMinutes ?? 60),
    requiredHeadcount: String(shift?.requiredHeadcount ?? 1),
    notes: shift?.notes ?? "",
  });
  const [confirmedPastTime, setConfirmedPastTime] = useState(false);
  const startsInPast = Boolean(form.startsAt) && new Date(form.startsAt).getTime() <= Date.now();
  const save = useMutation({
    meta: {
      successMessage: shift ? "Đã cập nhật ca làm" : "Đã tạo ca làm mới",
    },
    mutationFn: () => {
      const payload: ShiftPayload = {
        ...form,
        departmentId: form.departmentId || null,
        positionId: form.positionId || null,
        startsAt: toUtcIsoInAppTimezone(form.startsAt),
        endsAt: toUtcIsoInAppTimezone(form.endsAt),
        unpaidBreakMinutes: Number(form.unpaidBreakMinutes),
        requiredHeadcount: Number(form.requiredHeadcount),
      };
      return shift ? updateShift(shift.id, payload) : createShift(payload);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["shifts"] });
      close();
    },
  });
  const apply = (id: string) => {
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    const s = new Date(form.startsAt),
      e = new Date(form.startsAt);
    const [sh, sm] = t.startTime.split(":").map(Number),
      [eh, em] = t.endTime.split(":").map(Number);
    s.setHours(sh, sm);
    e.setHours(eh, em);
    if (t.crossesMidnight) e.setDate(e.getDate() + 1);
    setForm({
      ...form,
      name: t.name,
      branchId: t.branch?.id ?? form.branchId,
      startsAt: local(s),
      endsAt: local(e),
      unpaidBreakMinutes: String(t.unpaidBreakMinutes),
      requiredHeadcount: String(t.requiredHeadcount),
    });
  };
  if (shift && isShiftLocked(shift))
    return <LockedShiftModal shift={shift} close={close} />;
  return (
    <Modal title={shift ? "Sửa ca làm" : "Tạo ca làm"} close={close}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (startsInPast && !confirmedPastTime) return;
          save.mutate();
        }}
        className="grid gap-4 p-5 sm:grid-cols-2"
      >
        {!shift && (
          <Field label="Mẫu thời gian">
            <select className={input} onChange={(e) => apply(e.target.value)}>
              <option value="">Tự thiết lập</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} · {t.startTime}–{t.endTime}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Tên ca">
          <input
            required
            className={input}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </Field>
        <Field label="Chi nhánh">
          <select
            className={input}
            value={form.branchId}
            onChange={(e) => setForm({ ...form, branchId: e.target.value })}
          >
            {options.branches.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Phòng ban">
          <select
            className={input}
            value={form.departmentId}
            onChange={(e) => setForm({ ...form, departmentId: e.target.value })}
          >
            <option value="">Không chỉ định</option>
            {options.departments.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Vị trí">
          <select
            className={input}
            value={form.positionId}
            onChange={(e) => setForm({ ...form, positionId: e.target.value })}
          >
            <option value="">Không chỉ định</option>
            {options.positions.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Bắt đầu">
          <input
            type="datetime-local"
            className={input}
            value={form.startsAt}
            onChange={(e) => {
              setConfirmedPastTime(false);
              setForm({ ...form, startsAt: e.target.value });
            }}
          />
        </Field>
        <Field label="Kết thúc">
          <input
            type="datetime-local"
            className={input}
            value={form.endsAt}
            onChange={(e) => {
              setConfirmedPastTime(false);
              setForm({ ...form, endsAt: e.target.value });
            }}
          />
        </Field>
        <Field label="Nghỉ (phút)">
          <input
            type="number"
            className={input}
            value={form.unpaidBreakMinutes}
            onChange={(e) =>
              setForm({ ...form, unpaidBreakMinutes: e.target.value })
            }
          />
        </Field>
        <Field label="Số người">
          <input
            type="number"
            min="1"
            className={input}
            value={form.requiredHeadcount}
            onChange={(e) =>
              setForm({ ...form, requiredHeadcount: e.target.value })
            }
          />
        </Field>
        {startsInPast && (
          <label className="sm:col-span-2 flex items-start gap-3 border border-warning/30 bg-warning/10 p-4 text-sm">
            <input
              className="mt-1"
              type="checkbox"
              checked={confirmedPastTime}
              onChange={(e) => setConfirmedPastTime(e.target.checked)}
            />
            <span>
              <b>Thời gian bắt đầu đang ở trong quá khứ</b>
              <br />
              <span className="text-xs leading-5 text-muted">
                Ca vẫn được giữ ở trạng thái bản nháp để bạn sửa lại. Ca này
                không thể công bố cho đến khi có thời gian bắt đầu hợp lệ.
                Chọn ô này nếu bạn vẫn muốn lưu bản nháp hiện tại.
              </span>
            </span>
          </label>
        )}
        {save.isError && <ErrorBox text={save.error.message} />}
        <div className="sm:col-span-2 flex justify-end gap-2">
          <Button variant="outline" onClick={close}>
            Hủy
          </Button>
          <Button
            type="submit"
            variant="brand"
            disabled={
              save.isPending ||
              !form.name.trim() ||
              !form.branchId ||
              (startsInPast && !confirmedPastTime)
            }
          >
            {save.isPending && <LoaderCircle className="size-4 animate-spin" />}
            {save.isPending ? "Đang lưu..." : "Lưu ca"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function TemplateEditor({
  options,
  templates,
  close,
}: {
  options: ScheduleOptions;
  templates: ShiftTemplate[];
  close: () => void;
}) {
  const qc = useQueryClient();
  const makeBlank = () => ({
    code: generateBusinessCode("CA"),
    name: "",
    branchId: "",
    color: "#2563EB",
    startTime: "08:00",
    endTime: "17:00",
    crossesMidnight: false,
    unpaidBreakMinutes: "60",
    requiredHeadcount: "1",
  });
  const [editing, setEditing] = useState<ShiftTemplate | null>(null),
    [deleting, setDeleting] = useState<ShiftTemplate | null>(null),
    [form, setForm] = useState(makeBlank);
  const save = useMutation({
    meta: {
      successMessage: editing ? "Đã cập nhật mẫu ca" : "Đã tạo mẫu ca mới",
    },
    mutationFn: () => {
      const p: ShiftTemplatePayload = {
        ...form,
        branchId: form.branchId || null,
        unpaidBreakMinutes: Number(form.unpaidBreakMinutes),
        requiredHeadcount: Number(form.requiredHeadcount),
      };
      return editing
        ? updateShiftTemplate(editing.id, p)
        : createShiftTemplate(p);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["shift-templates"] });
      setEditing(null);
      setForm(makeBlank());
    },
  });
  const remove = useMutation({
    meta: { successMessage: "Đã vô hiệu hóa mẫu ca" },
    mutationFn: deleteShiftTemplate,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["shift-templates"] });
      setDeleting(null);
    },
  });
  const edit = (t: ShiftTemplate) => {
    setEditing(t);
    setForm({
      code: t.code,
      name: t.name,
      branchId: t.branch?.id ?? "",
      color: t.color,
      startTime: t.startTime,
      endTime: t.endTime,
      crossesMidnight: t.crossesMidnight,
      unpaidBreakMinutes: String(t.unpaidBreakMinutes),
      requiredHeadcount: String(t.requiredHeadcount),
    });
  };
  return (
    <Modal title="Cấu hình thời gian ca" close={close} wide>
      <div className="grid lg:grid-cols-[1fr_360px]">
        <div className="border-b border-line lg:border-b-0 lg:border-r">
          {templates.map((t) => (
            <div
              key={t.id}
              className="flex items-center gap-3 border-b border-line p-4"
            >
              <i className="h-10 w-1.5" style={{ background: t.color }} />
              <div className="min-w-0 flex-1">
                <b className="block truncate">{t.name}</b>
                <p className="text-xs text-muted">
                  {t.startTime}–{t.endTime}
                  {t.crossesMidnight ? " hôm sau" : ""} · {t.requiredHeadcount}{" "}
                  người · {t.branch?.name ?? "Toàn doanh nghiệp"}
                </p>
              </div>
              <button onClick={() => edit(t)}>
                <Pencil className="size-4" />
              </button>
              <button className="text-danger" onClick={() => setDeleting(t)}>
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
        </div>
        <form
          className="space-y-4 bg-canvas/40 p-4 sm:p-5"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <b>{editing ? "Sửa mẫu" : "Mẫu mới"}</b>
          <Field label="Mã tự động">
            <input
              readOnly
              className={`${input} bg-canvas font-mono text-brand`}
              value={form.code}
            />
          </Field>
          <Field label="Tên">
            <input
              required
              className={input}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <Field label="Chi nhánh">
            <select
              className={input}
              value={form.branchId}
              onChange={(e) => setForm({ ...form, branchId: e.target.value })}
            >
              <option value="">Toàn doanh nghiệp</option>
              {options.branches.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Bắt đầu">
              <input
                type="time"
                className={input}
                value={form.startTime}
                onChange={(e) =>
                  setForm({ ...form, startTime: e.target.value })
                }
              />
            </Field>
            <Field label="Kết thúc">
              <input
                type="time"
                className={input}
                value={form.endTime}
                onChange={(e) => setForm({ ...form, endTime: e.target.value })}
              />
            </Field>
          </div>
          <label className="text-xs font-bold">
            <input
              type="checkbox"
              checked={form.crossesMidnight}
              onChange={(e) =>
                setForm({ ...form, crossesMidnight: e.target.checked })
              }
            />{" "}
            Kết thúc hôm sau
          </label>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Nghỉ phút">
              <input
                type="number"
                className={input}
                value={form.unpaidBreakMinutes}
                onChange={(e) =>
                  setForm({ ...form, unpaidBreakMinutes: e.target.value })
                }
              />
            </Field>
            <Field label="Số người">
              <input
                type="number"
                className={input}
                value={form.requiredHeadcount}
                onChange={(e) =>
                  setForm({ ...form, requiredHeadcount: e.target.value })
                }
              />
            </Field>
          </div>
          <Field label="Màu">
            <input
              type="color"
              className="h-10 w-full"
              value={form.color}
              onChange={(e) => setForm({ ...form, color: e.target.value })}
            />
          </Field>
          {save.isError && <ErrorBox text={save.error.message} />}
          <Button
            className="w-full"
            variant="brand"
            type="submit"
            disabled={save.isPending || !form.code.trim() || !form.name.trim()}
          >
            {save.isPending && <LoaderCircle className="size-4 animate-spin" />}
            {save.isPending ? "Đang lưu..." : editing ? "Lưu mẫu" : "Tạo mẫu"}
          </Button>
        </form>
      </div>
      {deleting && (
        <ConfirmPanel
          title="Vô hiệu hóa mẫu ca"
          description={`Mẫu “${deleting.name}” sẽ không còn xuất hiện khi tạo ca mới. Các ca đã tạo không bị ảnh hưởng.`}
          pending={remove.isPending}
          error={remove.error?.message}
          confirmLabel="Vô hiệu hóa"
          close={() => setDeleting(null)}
          confirm={() => remove.mutate(deleting.id)}
        />
      )}
    </Modal>
  );
}

function AssignmentEditor({
  shift,
  close,
}: {
  shift: ShiftItem;
  close: () => void;
}) {
  const qc = useQueryClient();
  const [search, setSearch] = useState(""),
    [selected, setSelected] = useState<string[]>([]),
    [override, setOverride] = useState(false),
    [removing, setRemoving] = useState<{ id: string; name: string } | null>(
      null,
    );
  const deferred = useDeferredValue(search);
  const locked = isShiftLocked(shift);
  const assigned = useQuery({
    queryKey: ["shift-assignments", shift.id],
    queryFn: () => getShiftAssignments(shift.id),
  });
  const candidates = useQuery({
    queryKey: ["shift-candidates", shift.id, deferred],
    queryFn: () => getShiftCandidates(shift.id, deferred),
    enabled: !locked,
  });
  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["shift-assignments", shift.id] }),
      qc.invalidateQueries({ queryKey: ["shift-candidates", shift.id] }),
      qc.invalidateQueries({ queryKey: ["shifts"] }),
    ]);
  };
  const add = useMutation({
    meta: { successMessage: "Đã phân công nhân viên vào ca" },
    mutationFn: () => assignEmployees(shift.id, selected, override),
    onSuccess: async () => {
      setSelected([]);
      await refresh();
    },
  });
  const remove = useMutation({
    meta: { successMessage: "Đã gỡ nhân viên khỏi ca" },
    mutationFn: (id: string) => removeShiftAssignment(shift.id, id),
    onSuccess: async () => {
      await refresh();
      setRemoving(null);
    },
  });
  if (locked)
    return (
      <Modal title={`Phân ca · ${shift.name}`} close={close} wide>
        <div className="p-5">
          <LockedNotice shift={shift} />
          <div className="mt-5 border border-line">
            <h3 className="border-b bg-canvas/50 p-3 text-xs font-extrabold uppercase">
              Danh sách đã phân {assigned.data?.length ?? 0}/
              {shift.requiredHeadcount}
            </h3>
            {assigned.data?.map((a) => (
              <div
                key={a.id}
                className="border-b border-line p-4 last:border-0"
              >
                <b>{a.employee.fullName}</b>
                <p className="mt-1 text-xs text-muted">
                  {a.employee.department.name} · {a.employee.position.name}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-5 flex justify-end">
            <Button variant="outline" onClick={close}>
              Đóng
            </Button>
          </div>
        </div>
      </Modal>
    );
  return (
    <Modal title={`Phân ca · ${shift.name}`} close={close} wide>
      <div className="grid lg:grid-cols-[340px_1fr]">
        <div className="border-b border-line lg:border-b-0 lg:border-r">
          <h3 className="border-b p-4 text-xs font-extrabold uppercase">
            Đã phân {assigned.data?.length ?? 0}/{shift.requiredHeadcount}
          </h3>
          {assigned.data?.map((a) => (
            <div
              key={a.id}
              className="flex items-center border-b border-line p-4"
            >
              <div className="flex-1">
                <b>{a.employee.fullName}</b>
                <p className="text-xs text-muted">
                  {a.employee.department.name} · {a.employee.position.name}
                </p>
              </div>
              <button
                onClick={() =>
                  setRemoving({ id: a.id, name: a.employee.fullName })
                }
              >
                <X className="size-4" />
              </button>
            </div>
          ))}
        </div>
        <div>
          <div className="p-4">
            <label className="flex h-10 items-center border border-line px-3">
              <Search className="mr-2 size-4" />
              <input
                className="flex-1 outline-none"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm nhân viên..."
              />
            </label>
          </div>
          {candidates.data?.map((c) => (
            <label
              key={c.id}
              className={cn(
                "flex gap-3 border-t border-line p-4",
                !c.eligible && "cursor-not-allowed bg-canvas opacity-60",
              )}
            >
              <input
                type="checkbox"
                disabled={!c.eligible}
                checked={selected.includes(c.id)}
                onChange={(e) =>
                  setSelected((old) =>
                    e.target.checked
                      ? [...old, c.id]
                      : old.filter((x) => x !== c.id),
                  )
                }
              />
              <div>
                <b>{c.fullName}</b>
                {c.recommended && (
                  <span className="ml-2 text-xs font-bold text-brand">
                    Phù hợp
                  </span>
                )}
                <p className="text-xs text-muted">
                  {c.employeeCode} · {c.department.name} · {c.position.name}
                </p>
                {c.reasons.length > 0 && (
                  <p className="text-xs text-danger">{c.reasons.join(" · ")}</p>
                )}
              </div>
            </label>
          ))}
          <label className="m-4 block text-xs">
            <input
              type="checkbox"
              checked={override}
              onChange={(e) => setOverride(e.target.checked)}
            />{" "}
            Cho phép khác phòng ban/vị trí
          </label>
          {add.isError && (
            <div className="m-4">
              <ErrorBox text={add.error.message} />
            </div>
          )}
          <div className="flex justify-end gap-2 border-t p-4">
            <Button variant="outline" onClick={close}>
              Đóng
            </Button>
            <Button
              variant="brand"
              disabled={!selected.length || add.isPending}
              onClick={() => add.mutate()}
            >
              {add.isPending && (
                <LoaderCircle className="size-4 animate-spin" />
              )}{" "}
              Phân {selected.length} người
            </Button>
          </div>
        </div>
      </div>
      {removing && (
        <ConfirmPanel
          title="Gỡ nhân viên khỏi ca"
          description={`Gỡ ${removing.name} khỏi ca “${shift.name}”. Nhân viên sẽ không còn được tính trong độ phủ của ca.`}
          pending={remove.isPending}
          error={remove.error?.message}
          confirmLabel="Gỡ khỏi ca"
          close={() => setRemoving(null)}
          confirm={() => remove.mutate(removing.id)}
        />
      )}
    </Modal>
  );
}

function ScheduleOperationModal({
  operation,
  from,
  to,
  branchId,
  options,
  templates,
  close,
}: {
  operation: Operation;
  from: Date;
  to: Date;
  branchId: string;
  options: ScheduleOptions;
  templates: CalendarTemplate[];
  close: () => void;
}) {
  const qc = useQueryClient();
  const [frequency, setFrequency] = useState<"daily" | "weekly">("weekly");
  const [occurrences, setOccurrences] = useState("4");
  const [until, setUntil] = useState(
    formatApp(
      addMonths(
        operation.type === "repeat" ? new Date(operation.shift.startsAt) : from,
        3,
      ),
      "yyyy-MM-dd",
    ),
  );
  const [targetDate, setTargetDate] = useState(
    formatApp(addWeeks(from, 1), "yyyy-MM-dd"),
  );
  const [templateName, setTemplateName] = useState(
    `Lịch ${formatApp(from, "dd/MM")} - ${formatApp(addDays(to, -1), "dd/MM/yyyy")}`,
  );
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [applyBranchId, setApplyBranchId] = useState(
    branchId || options.branches[0]?.id || "",
  );
  const [applyDate, setApplyDate] = useState(formatApp(from, "yyyy-MM-dd"));
  const [allowUnderstaffed, setAllowUnderstaffed] = useState(false);
  const [confirmedDelete, setConfirmedDelete] = useState(false);
  const [success, setSuccess] = useState("");
  const needsValidation =
    operation.type === "validate" || operation.type === "publish";
  const validation = useQuery({
    queryKey: [
      "schedule-validation",
      from.toISOString(),
      to.toISOString(),
      branchId,
      operation.type,
    ],
    queryFn: () =>
      validateSchedule({
        from: from.toISOString(),
        to: to.toISOString(),
        branchId: branchId || undefined,
      }),
    enabled: needsValidation,
  });
  const mutation = useMutation({
    meta: { successMessage: false },
    mutationFn: async () => {
      if (operation.type === "repeat") {
        const result = await repeatShift(operation.shift.id, {
          frequency,
          occurrences: Number(occurrences),
          until: toUtcIsoInAppTimezone(`${until}T23:59:59`),
        });
        return `Đã tạo ${result.created} ca lặp từ “${operation.shift.name}”.`;
      }
      if (operation.type === "delete") {
        const result = await deleteShift(operation.shift.id);
        return result.action === "cancelled"
          ? "Ca đã được hủy và nhân viên liên quan đã nhận thông báo."
          : "Ca nháp đã được xóa.";
      }
      if (operation.type === "copy") {
        const result = await copySchedule({
          sourceFrom: from.toISOString(),
          sourceTo: to.toISOString(),
          targetStart: toUtcIsoInAppTimezone(`${targetDate}T00:00:00`),
        });
        return `Đã sao chép ${result.created} ca sang lịch mới.`;
      }
      if (operation.type === "save-template") {
        const result = await saveScheduleTemplateFromRange({
          name: templateName.trim(),
          from: from.toISOString(),
          to: to.toISOString(),
          branchId: branchId || undefined,
        });
        return `Đã lưu template với ${result.createdItems} ca.`;
      }
      if (operation.type === "apply-template") {
        const result = await applyScheduleTemplate(templateId, {
          branchId: applyBranchId,
          startDate: applyDate,
        });
        return `Đã tạo ${result.created} ca từ template lịch.`;
      }
      if (operation.type === "publish") {
        const result = await publishSchedule({
          from: from.toISOString(),
          to: to.toISOString(),
          branchId: branchId || undefined,
          allowUnderstaffed,
        });
        return `Đã công bố ${result.published} ca và gửi thông báo cho nhân viên.`;
      }
      return "";
    },
    onSuccess: async (message) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["shifts"] }),
        qc.invalidateQueries({ queryKey: ["schedule-templates"] }),
      ]);
      setSuccess(message);
    },
  });
  const titles: Record<Operation["type"], string> = {
    repeat: "Thiết lập ca lặp lại",
    delete:
      operation.type === "delete" && operation.shift.status === "published"
        ? "Hủy ca đã công bố"
        : "Xóa ca làm",
    copy: "Sao chép lịch",
    "save-template": "Lưu template lịch",
    "apply-template": "Áp dụng template lịch",
    validate: "Kiểm tra lịch trước công bố",
    publish: "Công bố lịch làm việc",
  };
  const validationData = validation.data;
  const submitDisabled =
    mutation.isPending ||
    Boolean(success) ||
    (operation.type === "repeat" &&
      (!until || Number(occurrences) < 1 || Number(occurrences) > 52)) ||
    (operation.type === "copy" && !targetDate) ||
    (operation.type === "save-template" && !templateName.trim()) ||
    (operation.type === "apply-template" &&
      (!templateId || !applyBranchId || !applyDate)) ||
    (operation.type === "delete" && !confirmedDelete) ||
    (operation.type === "publish" &&
      (!validationData ||
        validationData.conflicts.length > 0 ||
        validationData.pastDrafts.length > 0 ||
        (validationData.understaffed.length > 0 && !allowUnderstaffed)));
  if (success)
    return (
      <Modal title={titles[operation.type]} close={close}>
        <div className="p-6">
          <div className="border border-success/25 bg-success/10 p-4">
            <p className="font-extrabold text-success">Thao tác thành công</p>
            <p className="mt-2 text-sm text-muted">{success}</p>
          </div>
          <div className="mt-5 flex justify-end">
            <Button variant="brand" onClick={close}>
              Hoàn tất
            </Button>
          </div>
        </div>
      </Modal>
    );
  return (
    <Modal title={titles[operation.type]} close={close}>
      <div className="space-y-5 p-5">
        <RangeSummary
          from={from}
          to={to}
          branch={options.branches.find((item) => item.id === branchId)?.name}
        />
        {operation.type === "repeat" && (
          <>
            <div className="border border-line bg-canvas/40 p-4">
              <p className="text-sm font-extrabold">{operation.shift.name}</p>
              <p className="mt-1 text-xs text-muted">
                Ca gốc:{" "}
                {formatApp(new Date(operation.shift.startsAt), "dd/MM/yyyy HH:mm")}
                –{formatApp(new Date(operation.shift.endsAt), "HH:mm")}
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Chu kỳ lặp">
                <select
                  className={input}
                  value={frequency}
                  onChange={(e) =>
                    setFrequency(e.target.value as "daily" | "weekly")
                  }
                >
                  <option value="daily">Hằng ngày</option>
                  <option value="weekly">Hằng tuần</option>
                </select>
              </Field>
              <Field label="Số lần lặp">
                <input
                  className={input}
                  type="number"
                  min="1"
                  max="52"
                  value={occurrences}
                  onChange={(e) => setOccurrences(e.target.value)}
                />
              </Field>
              <Field label="Kết thúc lặp vào ngày">
                <input
                  className={input}
                  type="date"
                  min={formatApp(new Date(operation.shift.startsAt), "yyyy-MM-dd")}
                  value={until}
                  onChange={(e) => setUntil(e.target.value)}
                />
              </Field>
            </div>
          </>
        )}
        {operation.type === "copy" && (
          <>
            <p className="text-sm text-muted">
              Toàn bộ ca trong khoảng đang xem sẽ được sao chép dưới dạng bản
              nháp. Phân công nhân viên không được sao chép.
            </p>
            <Field label="Ngày bắt đầu lịch đích">
              <input
                className={input}
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
              />
            </Field>
            <div className="border border-info/20 bg-info-soft p-3 text-xs text-muted">
              Khoảng cách ngày và thời lượng của từng ca được giữ nguyên.
            </div>
          </>
        )}
        {operation.type === "save-template" && (
          <>
            <Field label="Tên template lịch">
              <input
                className={input}
                maxLength={150}
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="VD: Lịch chuẩn bộ phận vận hành"
              />
            </Field>
            <p className="text-xs leading-5 text-muted">
              Hệ thống lưu cấu trúc ca, ngày trong chu kỳ, phòng ban, vị trí và
              nhu cầu nhân sự. Nhân viên đã phân công không nằm trong template.
            </p>
          </>
        )}
        {operation.type === "apply-template" &&
          (templates.length ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field label="Template lịch">
                  <select
                    className={input}
                    value={templateId}
                    onChange={(e) => setTemplateId(e.target.value)}
                  >
                    {templates.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} · {item.items.length} ca
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label="Chi nhánh áp dụng">
                <select
                  className={input}
                  value={applyBranchId}
                  onChange={(e) => setApplyBranchId(e.target.value)}
                >
                  {options.branches.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Ngày bắt đầu">
                <input
                  className={input}
                  type="date"
                  value={applyDate}
                  onChange={(e) => setApplyDate(e.target.value)}
                />
              </Field>
              <div className="sm:col-span-2 border border-warning/25 bg-warning/10 p-3 text-xs text-muted">
                Các ca được tạo ở trạng thái bản nháp để bạn kiểm tra trước khi
                công bố.
              </div>
            </div>
          ) : (
            <div className="border border-line bg-canvas p-6 text-center">
              <p className="font-extrabold">Chưa có template lịch</p>
              <p className="mt-1 text-sm text-muted">
                Hãy lưu một lịch hiện tại thành template trước.
              </p>
            </div>
          ))}
        {(operation.type === "validate" || operation.type === "publish") && (
          <ValidationPanel
            data={validationData}
            loading={validation.isLoading}
            error={validation.error?.message}
          />
        )}
        {operation.type === "publish" && validationData?.understaffed.length ? (
          <label className="flex items-start gap-3 border border-warning/30 bg-warning/10 p-4 text-sm">
            <input
              className="mt-1"
              type="checkbox"
              checked={allowUnderstaffed}
              onChange={(e) => setAllowUnderstaffed(e.target.checked)}
            />
            <span>
              <b>Xác nhận công bố khi còn thiếu nhân sự</b>
              <br />
              <span className="text-xs text-muted">
                Tôi đã kiểm tra {validationData.understaffed.length} ca thiếu
                người và vẫn muốn công bố.
              </span>
            </span>
          </label>
        ) : null}
        {operation.type === "delete" && (
          <>
            <div className="border border-danger/20 bg-danger-soft p-4">
              <p className="font-extrabold text-danger">
                {operation.shift.name}
              </p>
              <p className="mt-2 text-sm text-muted">
                {operation.shift.status === "published"
                  ? "Ca đã công bố sẽ chuyển sang trạng thái đã hủy và nhân viên được thông báo."
                  : "Ca nháp sẽ bị xóa khỏi lịch làm việc."}
              </p>
            </div>
            <label className="flex items-center gap-3 text-sm font-bold">
              <input
                type="checkbox"
                checked={confirmedDelete}
                onChange={(e) => setConfirmedDelete(e.target.checked)}
              />{" "}
              Tôi xác nhận thực hiện thao tác này
            </label>
          </>
        )}
        {mutation.isError && <ErrorBox text={mutation.error.message} />}
        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <Button variant="outline" onClick={close}>
            Hủy
          </Button>
          {operation.type !== "validate" && (
            <Button
              variant={operation.type === "delete" ? "default" : "brand"}
              className={
                operation.type === "delete"
                  ? "bg-danger hover:bg-danger/90"
                  : undefined
              }
              disabled={submitDisabled}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending && (
                <LoaderCircle className="size-4 animate-spin" />
              )}
              {operation.type === "publish"
                ? "Công bố lịch"
                : operation.type === "delete"
                  ? operation.shift.status === "published"
                    ? "Hủy ca"
                    : "Xóa ca"
                  : operation.type === "repeat"
                    ? "Tạo ca lặp"
                    : operation.type === "copy"
                      ? "Sao chép"
                      : operation.type === "save-template"
                        ? "Lưu template"
                        : "Áp dụng template"}
            </Button>
          )}
          {operation.type === "validate" && (
            <Button variant="brand" onClick={close}>
              Đóng
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}

function RangeSummary({
  from,
  to,
  branch,
}: {
  from: Date;
  to: Date;
  branch?: string;
}) {
  return (
    <div className="grid grid-cols-2 border border-line bg-canvas/40">
      <div className="border-r border-line p-3">
        <p className="text-[10px] font-bold uppercase text-muted">
          Khoảng lịch
        </p>
        <p className="mt-1 text-sm font-extrabold">
          {formatApp(from, "dd/MM/yyyy")} – {formatApp(addDays(to, -1), "dd/MM/yyyy")}
        </p>
      </div>
      <div className="p-3">
        <p className="text-[10px] font-bold uppercase text-muted">Phạm vi</p>
        <p className="mt-1 text-sm font-extrabold">
          {branch ?? "Tất cả chi nhánh"}
        </p>
      </div>
    </div>
  );
}
function ValidationPanel({
  data,
  loading,
  error,
}: {
  data?: ScheduleValidation;
  loading: boolean;
  error?: string;
}) {
  if (loading)
    return (
      <div className="p-8 text-center text-sm text-muted">
        <LoaderCircle className="mr-2 inline size-4 animate-spin" />
        Đang kiểm tra lịch...
      </div>
    );
  if (error) return <ErrorBox text={error} />;
  if (!data) return null;
  return (
    <div className="space-y-3">
      <div
        className={cn(
          "border p-4",
          data.valid
            ? "border-success/25 bg-success/10"
            : "border-warning/30 bg-warning/10",
        )}
      >
        <p className="font-extrabold">
          {data.valid ? "Lịch đã sẵn sàng để công bố" : "Lịch cần được rà soát"}
        </p>
        <p className="mt-1 text-xs text-muted">
          Đã kiểm tra {data.shiftCount} ca · {data.conflicts.length} xung đột ·{" "}
          {data.understaffed.length} ca thiếu người · {data.pastDrafts.length} ca
          nháp đã qua giờ
        </p>
      </div>
      {data.conflicts.length > 0 && (
        <div className="border border-danger/20">
          <h3 className="border-b border-line bg-danger-soft p-3 text-xs font-extrabold text-danger">
            Nhân viên trùng ca
          </h3>
          {data.conflicts.map((item, index) => (
            <p
              key={`${item.employeeId}-${index}`}
              className="border-b border-line p-3 text-xs last:border-0"
            >
              <b>{item.employeeName}</b> đang được phân vào hai ca có thời gian
              giao nhau.
            </p>
          ))}
        </div>
      )}
      {data.pastDrafts.length > 0 && (
        <div className="border border-danger/20">
          <h3 className="border-b border-line bg-danger-soft p-3 text-xs font-extrabold text-danger">
            Ca nháp có thời gian không hợp lệ để công bố
          </h3>
          {data.pastDrafts.map((item) => (
            <div
              key={item.id}
              className="border-b border-line p-3 text-xs last:border-0"
            >
              <b>{item.name}</b> · bắt đầu {formatApp(new Date(item.startsAt), "dd/MM/yyyy HH:mm")}. Hãy sửa sang thời gian chưa bắt đầu trước khi công bố.
            </div>
          ))}
        </div>
      )}
      {data.understaffed.length > 0 && (
        <div className="border border-warning/25">
          <h3 className="border-b border-line bg-warning/10 p-3 text-xs font-extrabold">
            Ca còn thiếu nhân sự
          </h3>
          {data.understaffed.map((item) => (
            <div
              key={item.id}
              className="flex justify-between border-b border-line p-3 text-xs last:border-0"
            >
              <span>
                <b>{item.name}</b> ·{" "}
                {formatApp(new Date(item.startsAt), "dd/MM HH:mm")}
              </span>
              <span className="font-bold text-warning">
                {item.assigned}/{item.required} người
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
function ConfirmPanel({
  title,
  description,
  pending,
  error,
  confirmLabel,
  close,
  confirm,
}: {
  title: string;
  description: string;
  pending: boolean;
  error?: string;
  confirmLabel: string;
  close: () => void;
  confirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-ink/45 sm:items-center sm:p-4">
      <button className="absolute inset-0" onClick={close} />
      <div className="relative max-h-[94dvh] w-full overflow-y-auto border border-line bg-surface shadow-2xl sm:max-w-md">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-surface p-4">
          <h3 className="pr-3 font-extrabold">{title}</h3>
          <button
            className="grid size-8 shrink-0 place-items-center"
            onClick={close}
          >
            <X className="size-4" />
          </button>
        </header>
        <div className="p-4 sm:p-5">
          <div className="border border-danger/20 bg-danger-soft p-4 text-sm leading-6 text-muted">
            {description}
          </div>
          {error && (
            <div className="mt-4">
              <ErrorBox text={error} />
            </div>
          )}
        </div>
        <footer className="sticky bottom-0 flex justify-end gap-2 border-t border-line bg-surface p-4">
          <Button variant="outline" onClick={close}>
            Hủy
          </Button>
          <Button
            className="bg-danger hover:bg-danger/90"
            disabled={pending}
            onClick={confirm}
          >
            {pending && <LoaderCircle className="size-4 animate-spin" />}
            {confirmLabel}
          </Button>
        </footer>
      </div>
    </div>
  );
}
function MoveShiftModal({
  move,
  pending,
  close,
  confirm,
}: {
  move: ShiftMove;
  pending: boolean;
  close: () => void;
  confirm: () => void;
}) {
  const movesToPast = new Date(move.startsAt).getTime() <= Date.now();
  const publishedToPast = move.shift.status === "published" && movesToPast;
  return (
    <Modal
      title={
        publishedToPast
          ? "Không thể chuyển ca đã công bố về quá khứ"
          : movesToPast
          ? "Xác nhận thời gian ca trong quá khứ"
          : "Xác nhận đổi lịch đã công bố"
      }
      close={close}
    >
      <div className="space-y-4 p-5">
        <div className="border border-warning/25 bg-warning/10 p-4">
          <p className="font-extrabold">{move.shift.name}</p>
          <p className="mt-2 text-sm text-muted">
            Từ {formatApp(new Date(move.shift.startsAt), "dd/MM/yyyy HH:mm")} sang{" "}
            {formatApp(new Date(move.startsAt), "dd/MM/yyyy HH:mm")}.
          </p>
        </div>
        <p className="text-sm leading-6 text-muted">
          {publishedToPast
            ? "Ca đã công bố chỉ có thể đổi sang thời gian chưa bắt đầu. Hãy chọn một ngày hợp lệ hoặc hủy ca nếu lịch không còn được sử dụng."
            : movesToPast
            ? "Thời gian mới đã đến hoặc nằm trong quá khứ. Ca nháp vẫn có thể lưu để sửa tiếp nhưng sẽ không thể công bố cho đến khi thời gian hợp lệ."
            : "Nhân viên trong ca sẽ nhận được lịch mới."}
        </p>
        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <Button variant="outline" disabled={pending} onClick={close}>
            Hủy
          </Button>
          {publishedToPast ? (
            <Button variant="brand" onClick={close}>
              Đã hiểu
            </Button>
          ) : (
            <Button variant="brand" disabled={pending} onClick={confirm}>
              {pending && <LoaderCircle className="size-4 animate-spin" />}
              {pending
                ? "Đang cập nhật..."
                : movesToPast
                  ? "Vẫn lưu bản nháp"
                  : "Xác nhận di chuyển"}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}

function Modal({
  title,
  close,
  children,
  wide,
}: {
  title: string;
  close: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-ink/35 sm:items-center sm:p-4">
      <button className="absolute inset-0" onClick={close} />
      <div
        className={cn(
          "relative max-h-[96dvh] w-full overflow-y-auto border border-line bg-surface shadow-2xl sm:max-h-[94vh] sm:rounded-sm",
          wide ? "sm:max-w-5xl" : "sm:max-w-2xl",
        )}
      >
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-line bg-surface p-4">
          <h2 className="min-w-0 truncate pr-3 font-extrabold">{title}</h2>
          <button
            className="grid size-8 shrink-0 place-items-center"
            onClick={close}
          >
            <X className="size-4" />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-extrabold">{label}</span>
      {children}
    </label>
  );
}
function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex min-w-0 items-center justify-center gap-2 border-r border-line p-3 last:border-r-0 sm:justify-start sm:gap-3 sm:p-5">
      <CalendarDays className="hidden size-5 shrink-0 text-brand sm:block" />
      <div className="min-w-0 text-center sm:text-left">
        <b className="font-mono text-base sm:text-xl">{value}</b>
        <p className="truncate text-[9px] text-muted sm:text-xs">{label}</p>
      </div>
    </div>
  );
}
function Loading() {
  return (
    <div className="grid min-h-96 place-items-center text-sm text-muted">
      <LoaderCircle className="mr-2 inline size-4 animate-spin" /> Đang tải
      lịch...
    </div>
  );
}
function ErrorBox({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 border border-danger/20 bg-danger-soft p-3 text-xs font-bold text-danger">
      <AlertCircle className="size-4" />
      {text}
    </div>
  );
}
function LockedNotice({ shift }: { shift: ShiftItem }) {
  return (
    <div className="flex gap-3 border border-warning/25 bg-warning-soft p-4">
      <LockKeyhole className="mt-0.5 size-5 shrink-0 text-warning-strong" />
      <div>
        <p className="text-sm font-extrabold text-warning-strong">
          Ca đã được khóa thay đổi
        </p>
        <p className="mt-1 text-xs leading-5 text-muted">
          {shift.lockReason ?? "Ca đã bắt đầu hoặc kết thúc."} Bạn chỉ có thể
          xem thông tin, không thể sửa, xóa, gán thêm hoặc gỡ nhân viên.
        </p>
      </div>
    </div>
  );
}
function LockedShiftModal({
  shift,
  close,
}: {
  shift: ShiftItem;
  close: () => void;
}) {
  return (
    <Modal title={shift.name} close={close}>
      <div className="p-5">
        <LockedNotice shift={shift} />
        <div className="mt-5 flex justify-end">
          <Button variant="outline" onClick={close}>
            Đóng
          </Button>
        </div>
      </div>
    </Modal>
  );
}
