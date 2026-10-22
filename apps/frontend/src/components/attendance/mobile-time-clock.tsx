'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { differenceInSeconds, format } from 'date-fns';
import { vi } from 'date-fns/locale';
import {
  ArrowRight,
  AlertTriangle,
  BriefcaseBusiness,
  Camera,
  Check,
  Clock3,
  Coffee,
  Fingerprint,
  LoaderCircle,
  LocateFixed,
  LogOut,
  MapPin,
  Navigation,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  checkIn,
  checkOut,
  endBreak,
  getMyAttendance,
  startBreak,
  type AttendanceEventType,
  type ClockActionPayload,
  type MyAttendance,
} from '@/lib/attendance-api';
import { cn } from '@/lib/utils';
import { formatDurationMinutes, formatDurationSeconds } from '@/lib/time-format';
import { AttendanceSelfie } from './attendance-selfie';
import { AttendanceHistory } from './attendance-history';
import { SelfieCaptureDialog } from './selfie-capture-dialog';

const EmployeeLocationMap = dynamic(() => import('./employee-location-map'), {
  ssr: false,
  loading: () => <div className="flex min-h-64 items-center justify-center bg-canvas text-xs font-bold text-muted"><LoaderCircle className="mr-2 size-4 animate-spin" />Đang tải bản đồ vị trí...</div>,
});

type EmployeeLocation = { latitude: number; longitude: number; accuracyM: number; updatedAt: Date };

const LOCATION_FRESHNESS_MS = 2 * 60 * 1000;
const LOCATION_CACHE_MS = 5 * 60 * 1000;

const actionLabels: Record<AttendanceEventType, string> = {
  check_in: 'Check-in',
  check_out: 'Check-out',
  break_start: 'Bắt đầu nghỉ',
  break_end: 'Kết thúc nghỉ',
};

function getDeviceId() {
  if (typeof window === 'undefined') return undefined;
  const key = 'workforce_mobile_device_id';
  const current = window.localStorage.getItem(key);
  if (current) return current;
  const id = window.crypto.randomUUID();
  window.localStorage.setItem(key, id);
  return id;
}

function requestPosition(options: PositionOptions) {
  return new Promise<GeolocationPosition>((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Trình duyệt không hỗ trợ định vị GPS'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, options);
  });
}

function isGeolocationError(error: unknown): error is GeolocationPositionError {
  return typeof error === 'object' && error !== null && 'code' in error;
}

function locationErrorMessage(error: unknown) {
  if (!window.isSecureContext) {
    return 'Định vị chỉ hoạt động trên HTTPS hoặc localhost.';
  }
  if (!isGeolocationError(error)) {
    return error instanceof Error ? error.message : 'Không thể lấy vị trí hiện tại.';
  }
  if (error.code === 1) {
    return 'Quyền vị trí đang bị chặn. Hãy bấm biểu tượng bên trái thanh địa chỉ, cho phép Vị trí rồi thử lại.';
  }
  if (error.code === 2) {
    return 'Thiết bị chưa xác định được vị trí. Hãy bật Dịch vụ định vị và Wi-Fi rồi thử lại.';
  }
  return 'Lấy vị trí quá lâu. Hãy kiểm tra Dịch vụ định vị rồi thử lại.';
}

async function getCurrentPosition() {
  try {
    // A cached/network fix is substantially more reliable on laptops. The
    // high-accuracy watcher below will replace it as soon as a better fix arrives.
    return await requestPosition({ enableHighAccuracy: false, timeout: 12_000, maximumAge: LOCATION_CACHE_MS });
  } catch (error) {
    if (isGeolocationError(error) && error.code === 1) throw error;
    return requestPosition({ enableHighAccuracy: true, timeout: 30_000, maximumAge: 30_000 });
  }
}

function toEmployeeLocation(position: GeolocationPosition): EmployeeLocation {
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracyM: position.coords.accuracy,
    updatedAt: new Date(position.timestamp),
  };
}

function durationText(totalSeconds: number) {
  return formatDurationSeconds(totalSeconds);
}

function completedBreakSeconds(events: MyAttendance['events'], now: Date) {
  let startedAt: Date | null = null;
  let seconds = 0;
  for (const event of events) {
    if (event.type === 'break_start') startedAt = new Date(event.occurredAt);
    if (event.type === 'break_end' && startedAt) {
      seconds += Math.max(differenceInSeconds(new Date(event.occurredAt), startedAt), 0);
      startedAt = null;
    }
  }
  if (startedAt) seconds += Math.max(differenceInSeconds(now, startedAt), 0);
  return seconds;
}

function distanceInMeters(latitudeA: number, longitudeA: number, latitudeB: number, longitudeB: number) {
  const radians = (value: number) => value * Math.PI / 180;
  const earthRadius = 6_371_000;
  const deltaLatitude = radians(latitudeB - latitudeA);
  const deltaLongitude = radians(longitudeB - longitudeA);
  const value = Math.sin(deltaLatitude / 2) ** 2 + Math.cos(radians(latitudeA)) * Math.cos(radians(latitudeB)) * Math.sin(deltaLongitude / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

export function MobileTimeClock() {
  const queryClient = useQueryClient();
  const [now, setNow] = useState(new Date());
  const [outsideScheduleReason, setOutsideScheduleReason] = useState('');
  const [selfieAction, setSelfieAction] = useState<'check_in' | 'check_out' | null>(null);
  const [employeeLocation, setEmployeeLocation] = useState<EmployeeLocation | null>(null);
  const [locationError, setLocationError] = useState('');
  const [locating, setLocating] = useState(true);
  const query = useQuery({ queryKey: ['my-attendance'], queryFn: getMyAttendance, refetchInterval: 30_000 });
  const data = query.data;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) {
      setLocationError('Trình duyệt không hỗ trợ GPS. Bạn không thể thực hiện chấm công trên thiết bị này.');
      setLocating(false);
      return;
    }
    let active = true;

    void getCurrentPosition()
      .then((position) => {
        if (!active) return;
        setEmployeeLocation(toEmployeeLocation(position));
        setLocationError('');
      })
      .catch((error) => {
        if (active) setLocationError(locationErrorMessage(error));
      })
      .finally(() => {
        if (active) setLocating(false);
      });

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setEmployeeLocation(toEmployeeLocation(position));
        setLocationError('');
        setLocating(false);
      },
      (error) => {
        // Keep a usable location when a later high-accuracy refresh fails.
        setEmployeeLocation((current) => {
          if (!current) {
            setLocationError(locationErrorMessage(error));
            setLocating(false);
          }
          return current;
        });
      },
      { enableHighAccuracy: true, timeout: 30_000, maximumAge: 30_000 },
    );
    return () => {
      active = false;
      navigator.geolocation.clearWatch(watchId);
    };
  }, []);

  const refreshLocation = async () => {
    setLocating(true);
    setLocationError('');
    try {
      const position = await getCurrentPosition();
      setEmployeeLocation(toEmployeeLocation(position));
    } catch (error) {
      setLocationError(locationErrorMessage(error));
    } finally {
      setLocating(false);
    }
  };

  const actionPayload = async (): Promise<ClockActionPayload> => {
    const payload: ClockActionPayload = {
      deviceId: getDeviceId(),
      outsideScheduleReason: outsideScheduleReason.trim() || undefined,
    };
    const cachedLocationIsFresh =
      employeeLocation &&
      Date.now() - employeeLocation.updatedAt.getTime() <= LOCATION_FRESHNESS_MS;

    // The location watcher already keeps this value current. Reusing it avoids a
    // second browser GPS request timing out while the camera is open.
    if (cachedLocationIsFresh) {
      payload.latitude = employeeLocation.latitude;
      payload.longitude = employeeLocation.longitude;
      payload.locationAccuracyM = employeeLocation.accuracyM;
      return payload;
    }

    const position = await getCurrentPosition();
    const nextLocation = toEmployeeLocation(position);
    payload.latitude = nextLocation.latitude;
    payload.longitude = nextLocation.longitude;
    payload.locationAccuracyM = nextLocation.accuracyM;
    setEmployeeLocation(nextLocation);
    setLocationError('');
    return payload;
  };
  const mutationOptions = {
    onSuccess: (result: MyAttendance) => queryClient.setQueryData(['my-attendance'], result),
  };
  const checkInMutation = useMutation({ mutationFn: async (selfie: Blob) => checkIn(await actionPayload(), selfie), meta: { successMessage: 'Check-in thành công' }, ...mutationOptions, onSuccess: (result) => { mutationOptions.onSuccess(result); setOutsideScheduleReason(''); setSelfieAction(null); queryClient.invalidateQueries({ queryKey: ['my-attendance-history'] }); } });
  const checkOutMutation = useMutation({ mutationFn: async (selfie: Blob) => checkOut(await actionPayload(), selfie), meta: { successMessage: 'Check-out thành công' }, ...mutationOptions, onSuccess: (result) => { mutationOptions.onSuccess(result); setSelfieAction(null); queryClient.invalidateQueries({ queryKey: ['my-attendance-history'] }); } });
  const startBreakMutation = useMutation({ mutationFn: async () => startBreak(await actionPayload()), meta: { successMessage: 'Đã bắt đầu thời gian nghỉ' }, ...mutationOptions });
  const endBreakMutation = useMutation({ mutationFn: async () => endBreak(await actionPayload()), meta: { successMessage: 'Đã quay lại làm việc' }, ...mutationOptions });
  const isMutating = checkInMutation.isPending || checkOutMutation.isPending || startBreakMutation.isPending || endBreakMutation.isPending;

  const breakSeconds = useMemo(() => data ? completedBreakSeconds(data.events, now) : 0, [data, now]);
  const distanceFromBranch = useMemo(() => {
    if (!data || !employeeLocation || data.clockLocation.latitude === null || data.clockLocation.longitude === null) return null;
    return distanceInMeters(employeeLocation.latitude, employeeLocation.longitude, data.clockLocation.latitude, data.clockLocation.longitude);
  }, [data, employeeLocation]);

  const elapsedSeconds = useMemo(() => {
    if (!data?.record?.checkInAt) return 0;
    const end = data.record.checkOutAt ? new Date(data.record.checkOutAt) : now;
    return Math.max(differenceInSeconds(end, new Date(data.record.checkInAt)) - breakSeconds, 0);
  }, [breakSeconds, data, now]);

  if (query.isLoading) {
    return <div className="grid min-h-[70vh] place-items-center"><div className="flex items-center gap-2 text-sm font-bold text-muted"><LoaderCircle className="size-5 animate-spin text-brand" />Đang tải trạng thái chấm công...</div></div>;
  }

  if (query.isError || !data) {
    return <div className="mx-auto max-w-xl border border-danger/20 bg-danger-soft p-5"><p className="font-extrabold text-danger">Không thể tải dữ liệu chấm công</p><p className="mt-2 text-sm text-muted">{query.error?.message ?? 'Vui lòng thử lại.'}</p><Button className="mt-4" variant="outline" onClick={() => query.refetch()}><RefreshCw className="size-4" />Tải lại</Button></div>;
  }

  const stateContent = {
    not_started: { label: 'Chưa bắt đầu', detail: data.shift ? 'Bạn có thể check-in cho ca sắp tới.' : 'Hiện chưa có ca phù hợp để chấm công.', tone: 'bg-canvas text-muted', dot: 'bg-muted' },
    working: { label: 'Đang làm việc', detail: 'Bạn đã check-in.', tone: 'bg-success-soft text-success', dot: 'bg-success' },
    on_break: { label: 'Đang nghỉ', detail: 'Bạn đang trong thời gian nghỉ.', tone: 'bg-warning-soft text-warning', dot: 'bg-warning' },
    completed: { label: 'Đã check-out', detail: 'Phiên làm việc gần nhất đã hoàn thành.', tone: 'bg-info-soft text-brand', dot: 'bg-brand' },
  }[data.state];
  const allowedBreakSeconds = (data.shift?.unpaidBreakMinutes ?? 0) * 60;
  const hasUsedBreak = data.events.some((event) => event.type === 'break_start');
  const liveBreakOverSeconds = data.shift && breakSeconds > allowedBreakSeconds ? breakSeconds - allowedBreakSeconds : 0;
  const breakOverMinutes = Math.max(data.record?.breakOverMinutes ?? 0, liveBreakOverSeconds > 0 ? Math.max(Math.ceil(liveBreakOverSeconds / 60), 1) : 0);
  const withinGeofence = distanceFromBranch === null ? null : distanceFromBranch <= data.clockLocation.geofenceRadiusM;
  const gpsReady = employeeLocation !== null;

  return <div className="w-full min-w-0 space-y-5">
    <header className="flex flex-col justify-between gap-3 lg:flex-row lg:items-end">
      <div><p className="text-xs font-bold uppercase tracking-[0.14em] text-brand">Chấm công cá nhân</p><h1 className="mt-2 text-2xl font-black tracking-[-0.04em] sm:text-[30px]">Bắt đầu ngày làm việc</h1><p className="mt-2 text-sm text-muted">Check-in và check-out yêu cầu chụp selfie trực tiếp bằng camera.</p></div>
      <div className="flex flex-wrap items-center gap-3 text-xs font-bold text-muted"><span className="flex items-center gap-2"><Camera className="size-4 text-brand" />Selfie bắt buộc</span><span className="flex items-center gap-2"><Navigation className="size-4 text-brand" />GPS bắt buộc{data.clockLocation.geofenceRequired ? ` · ${data.clockLocation.geofenceRadiusM}m` : ''}</span></div>
    </header>

    <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
      <main className="min-w-0 overflow-hidden border border-line bg-surface shadow-panel">
        <div className="relative overflow-hidden border-b border-line bg-[linear-gradient(135deg,#eff7ff_0%,#ffffff_52%,#e8f4ff_100%)] p-5 sm:p-7">
          <div className="absolute -right-16 -top-20 size-56 rounded-full border-[30px] border-white/70" />
          <div className="relative flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className={cn('inline-flex items-center gap-2 px-3 py-1.5 text-xs font-extrabold', stateContent.tone)}><span className={cn('size-2 rounded-full', stateContent.dot, data.state !== 'completed' && 'animate-pulse')} />{stateContent.label}</div>
              <p className="mt-5 font-mono text-[42px] font-semibold leading-none tracking-[-0.06em] text-ink sm:text-[58px]">{format(now, 'HH:mm:ss')}</p>
              <p className="mt-3 text-sm font-bold capitalize text-muted">{format(now, "EEEE, 'ngày' dd 'tháng' MM yyyy", { locale: vi })}</p>
            </div>
            <div className="border-l-2 border-brand pl-4 sm:max-w-[260px]"><p className="text-xs font-extrabold text-ink">{stateContent.detail}</p><p className="mt-2 text-xs leading-5 text-muted">Thời gian thao tác được xác nhận theo đồng hồ máy chủ.</p></div>
          </div>
        </div>

        <section className="p-5 sm:p-7">
          {data.shift ? <div className="grid gap-4 border-b border-line pb-6 sm:grid-cols-[1fr_auto] sm:items-center">
            <div className="min-w-0"><div className="flex items-center gap-2"><BriefcaseBusiness className="size-4 text-brand" /><p className="truncate font-extrabold">{data.shift.name}</p></div><p className="mt-2 flex items-start gap-2 text-sm text-muted"><MapPin className="mt-0.5 size-4 shrink-0" /><span>{data.shift.branch.name} · {data.shift.branch.address}</span></p></div>
            <div className="border-l-2 border-line pl-4"><p className="font-mono text-lg font-bold">{format(new Date(data.shift.startsAt), 'HH:mm')} – {format(new Date(data.shift.endsAt), 'HH:mm')}</p><p className="mt-1 text-[11px] font-bold text-muted">CA ĐÃ CÔNG BỐ</p></div>
          </div> : <div className="border-b border-line pb-6"><p className="font-extrabold">Chấm công ngoài lịch</p><p className="mt-2 text-sm text-muted">Hiện không có ca làm phù hợp.</p>{data.requiresOutsideScheduleReason && <label className="mt-4 block"><span className="text-[10px] font-extrabold uppercase tracking-wide text-muted">Lý do làm việc ngoài lịch</span><textarea value={outsideScheduleReason} onChange={(event) => setOutsideScheduleReason(event.target.value)} rows={3} maxLength={500} placeholder="Ví dụ: Hỗ trợ ca sáng..." className="mt-2 w-full resize-none border border-line bg-white px-3 py-2.5 text-sm outline-none transition focus:border-brand" /></label>}</div>}

          {data.record && data.record.lateMinutes > 0 && <div className={cn('mt-5 flex items-start gap-3 border p-4', data.record.isLate ? 'border-warning/30 bg-warning-soft' : 'border-line bg-canvas')}><AlertTriangle className={cn('mt-0.5 size-5 shrink-0', data.record.isLate ? 'text-warning' : 'text-muted')} /><div><p className="text-sm font-extrabold">Đi muộn {formatDurationMinutes(data.record.lateMinutes)}</p><p className="mt-1 text-xs leading-5 text-muted">Mốc cho phép: {formatDurationMinutes(data.record.lateGraceMinutes)}</p></div></div>}

          {breakOverMinutes > 0 && <div className="mt-5 flex items-start gap-3 border border-warning/30 bg-warning-soft p-4"><AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" /><div><p className="text-sm font-extrabold">Nghỉ quá thời gian {formatDurationMinutes(breakOverMinutes)}</p><p className="mt-1 text-xs leading-5 text-muted">Thời gian nghỉ của ca: {formatDurationMinutes(data.shift?.unpaidBreakMinutes ?? 0)}{data.state === 'on_break' ? ' · Hãy kết thúc nghỉ để quay lại làm việc.' : ''}</p></div></div>}

          <div className="grid grid-cols-2 divide-x divide-line border-b border-line py-6">
            <Metric label="Thời gian làm" value={durationText(elapsedSeconds)} icon={Clock3} />
            <Metric label="Thời gian nghỉ" value={durationText(breakSeconds)} icon={Coffee} />
          </div>

          <div className="pt-6">
            {data.allowedActions.checkIn && <Button size="lg" variant="brand" className="h-14 w-full text-base" disabled={isMutating || !gpsReady || (data.requiresOutsideScheduleReason && outsideScheduleReason.trim().length < 5)} onClick={() => setSelfieAction('check_in')}><Camera className="size-5" />{data.requiresOutsideScheduleReason ? 'Chụp selfie và check-in ngoài lịch' : 'Chụp selfie và check-in'}<ArrowRight className="ml-auto size-5" /></Button>}
            {data.state === 'working' && <div className={cn('grid gap-3', data.allowedActions.startBreak && 'sm:grid-cols-2')}>{data.allowedActions.startBreak && <Button size="lg" variant="outline" className="h-14" loading={startBreakMutation.isPending} loadingText="Đang lấy GPS và bắt đầu nghỉ..." disabled={isMutating || !gpsReady} onClick={() => startBreakMutation.mutate()}><Coffee className="size-5" />Bắt đầu nghỉ · GPS</Button>}<Button size="lg" variant="brand" className="h-14" disabled={isMutating || !gpsReady} onClick={() => setSelfieAction('check_out')}><Camera className="size-5" />Chụp selfie và check-out</Button></div>}
            {data.state === 'working' && hasUsedBreak && <div className="mt-3 flex items-start gap-2 border border-line bg-canvas p-3 text-xs text-muted"><Check className="mt-0.5 size-4 shrink-0 text-success" /><span>Đã sử dụng thời gian nghỉ của ca này.</span></div>}
            {data.allowedActions.endBreak && <Button size="lg" variant="brand" className="h-14 w-full text-base" loading={endBreakMutation.isPending} loadingText="Đang lấy GPS và kết thúc nghỉ..." disabled={!gpsReady} onClick={() => endBreakMutation.mutate()}><Navigation className="size-5" />Kết thúc nghỉ tại khu vực làm việc</Button>}
            {!data.allowedActions.checkIn && !data.allowedActions.checkOut && !data.allowedActions.startBreak && !data.allowedActions.endBreak && <div className="flex items-center gap-3 border border-line bg-canvas p-4"><span className="grid size-9 place-items-center bg-success-soft text-success"><Check className="size-4" /></span><div><p className="text-sm font-extrabold">Không có thao tác cần thực hiện</p><p className="mt-1 text-xs text-muted">Trạng thái sẽ tự cập nhật khi ca tiếp theo đến gần.</p></div></div>}
          </div>
        </section>
      </main>

      <aside className="min-w-0 space-y-5">
        <section className="overflow-hidden border border-line bg-surface shadow-panel"><header className="flex items-center justify-between border-b border-line px-4 py-3"><div><p className="text-sm font-extrabold">Vị trí chấm công</p><p className="mt-0.5 text-[11px] text-muted">GPS được lấy tự động từ thiết bị này</p></div><Navigation className={cn('size-4', employeeLocation ? (withinGeofence === false ? 'text-danger' : 'text-success') : 'text-muted')} /></header>{employeeLocation ? <><div className="h-72"><EmployeeLocationMap branchLatitude={data.clockLocation.geofenceRequired ? data.clockLocation.latitude : null} branchLongitude={data.clockLocation.geofenceRequired ? data.clockLocation.longitude : null} radiusM={data.clockLocation.geofenceRadiusM} employeeLatitude={employeeLocation.latitude} employeeLongitude={employeeLocation.longitude} accuracyM={employeeLocation.accuracyM} withinGeofence={data.clockLocation.geofenceRequired ? withinGeofence : null} /></div>{data.clockLocation.geofenceRequired && data.clockLocation.latitude !== null && data.clockLocation.longitude !== null ? <div className={cn('border-t p-4', withinGeofence ? 'border-success/20 bg-success-soft' : 'border-danger/20 bg-danger-soft')}><p className={cn('text-sm font-extrabold', withinGeofence ? 'text-success' : 'text-danger')}>{withinGeofence ? 'Bạn đang trong khu vực chấm công' : 'Bạn đang ngoài khu vực chấm công'}</p><p className="mt-1 text-xs text-muted">Cách tâm chi nhánh khoảng {Math.round(distanceFromBranch ?? 0)}m · độ chính xác GPS ±{Math.round(employeeLocation.accuracyM)}m</p></div> : <div className="border-t border-success/20 bg-success-soft p-4"><p className="flex items-center gap-2 text-sm font-extrabold text-success"><Check className="size-4" />Đã lấy được vị trí</p><p className="mt-1 text-xs leading-5 text-muted">Độ chính xác GPS ±{Math.round(employeeLocation.accuracyM)}m. Chi nhánh chưa bật giới hạn khu vực chấm công.</p><Button size="sm" variant="outline" className="mt-3 bg-white" loading={locating} loadingText="Đang cập nhật..." onClick={refreshLocation}><LocateFixed className="size-4" />Cập nhật vị trí</Button></div>}</> : <div className="p-5">{locating ? <p className="flex items-center gap-2 text-sm font-bold text-muted"><LoaderCircle className="size-4 animate-spin text-brand" />Đang lấy vị trí...</p> : <><p className="text-sm font-extrabold text-danger">Chưa lấy được vị trí</p><p className="mt-2 text-xs leading-5 text-muted">{locationError || 'Hãy bật Dịch vụ định vị và cấp quyền vị trí cho trình duyệt.'}</p><Button size="sm" variant="outline" className="mt-3" onClick={refreshLocation}><LocateFixed className="size-4" />Thử lại</Button></>}</div>}</section>
        <section className="border border-line bg-surface shadow-panel"><header className="flex items-center justify-between border-b border-line px-4 py-3"><div><p className="text-sm font-extrabold">Hoạt động phiên này</p><p className="mt-0.5 text-[11px] text-muted">Check-in, nghỉ và check-out</p></div><ShieldCheck className="size-4 text-success" /></header>
          {data.events.length ? <div className="divide-y divide-line">{[...data.events].reverse().map((event, index) => <div key={event.id} className="flex items-center gap-3 px-4 py-3">{event.photoUrl ? <AttendanceSelfie path={event.photoUrl} alt={`Selfie ${actionLabels[event.type]}`} className="size-9" /> : <span className={cn('grid size-8 place-items-center border', index === 0 ? 'border-brand/20 bg-info-soft text-brand' : 'border-line bg-canvas text-muted')}><EventIcon type={event.type} /></span>}<div className="min-w-0 flex-1"><p className="text-xs font-extrabold">{actionLabels[event.type]}</p><p className="mt-0.5 text-[10px] uppercase tracking-wide text-muted">{event.method === 'mobile' ? 'Điện thoại' : 'Trình duyệt'}{event.photoUrl ? ' · Có selfie' : ''}</p></div><time className="font-mono text-xs font-bold">{format(new Date(event.occurredAt), 'HH:mm:ss')}</time></div>)}</div> : <div className="p-7 text-center"><Clock3 className="mx-auto size-5 text-muted" /><p className="mt-3 text-sm font-bold">Chưa có hoạt động</p><p className="mt-1 text-xs text-muted">Sự kiện sẽ xuất hiện sau khi bạn check-in.</p></div>}
        </section>

        <section className="border border-line bg-[#102b4e] p-5 text-white"><p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-blue-200">Lưu ý</p><p className="mt-3 text-sm font-bold leading-6">Mỗi ca chỉ được nghỉ một lần.</p><p className="mt-2 text-xs leading-5 text-white/55">Bắt đầu và kết thúc nghỉ đều phải bật GPS, thực hiện trong khu vực chấm công. Hãy kết thúc break trước khi check-out.</p></section>
      </aside>
    </div>
    <AttendanceHistory />
    {selfieAction && <SelfieCaptureDialog
      action={selfieAction}
      errorMessage={(selfieAction === 'check_in' ? checkInMutation.error : checkOutMutation.error)?.message}
      isSubmitting={selfieAction === 'check_in' ? checkInMutation.isPending : checkOutMutation.isPending}
      onClose={() => {
        if (!checkInMutation.isPending && !checkOutMutation.isPending) setSelfieAction(null);
      }}
      onConfirm={(selfie) => {
        if (selfieAction === 'check_in') checkInMutation.mutate(selfie);
        else checkOutMutation.mutate(selfie);
      }}
    />}
  </div>;
}

function Metric({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Clock3 }) {
  return <div className="flex min-w-0 items-center gap-3 px-3 first:pl-0 last:pr-0"><span className="grid size-9 shrink-0 place-items-center bg-info-soft text-brand"><Icon className="size-4" /></span><div className="min-w-0"><p className="truncate font-mono text-base font-bold sm:text-lg">{value}</p><p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-muted">{label}</p></div></div>;
}

function EventIcon({ type }: { type: AttendanceEventType }) {
  if (type === 'break_start' || type === 'break_end') return <Coffee className="size-3.5" />;
  if (type === 'check_out') return <LogOut className="size-3.5" />;
  return <Fingerprint className="size-3.5" />;
}
