import { apiRequest } from './api-client';

export type AttendanceEventType = 'check_in' | 'check_out' | 'break_start' | 'break_end';
export type AttendanceState = 'not_started' | 'working' | 'on_break' | 'completed';

export type MyAttendance = {
  serverTime: string;
  state: AttendanceState;
  allowedActions: {
    checkIn: boolean;
    checkOut: boolean;
    startBreak: boolean;
    endBreak: boolean;
  };
  employee: {
    id: string;
    employeeCode: string;
    fullName: string;
  };
  clockLocation: {
    branchId: string;
    branchName: string;
    address: string;
    geofenceRequired: boolean;
    latitude: number | null;
    longitude: number | null;
    geofenceRadiusM: number;
  };
  requiresOutsideScheduleReason: boolean;
  shift: {
    id: string;
    assignmentId: string;
    name: string;
    startsAt: string;
    endsAt: string;
    unpaidBreakMinutes: number;
    branch: {
      id: string;
      code: string;
      name: string;
      address: string;
      timezone: string;
    };
  } | null;
  record: {
    id: string;
    workDate: string;
    status: string;
    checkInAt: string | null;
    checkOutAt: string | null;
    scheduledMinutes: number;
    workedMinutes: number;
    breakMinutes: number;
    allowedBreakMinutes: number;
    breakOverMinutes: number;
    hasExcessiveBreak: boolean;
    lateMinutes: number;
    isLate: boolean;
    lateGraceMinutes: number;
    earlyLeaveMinutes: number;
    overtimeMinutes: number;
  } | null;
  events: Array<{
    id: string;
    type: AttendanceEventType;
    occurredAt: string;
    method: 'mobile' | 'web' | 'manual' | 'import';
    photoUrl: string | null;
  }>;
};

export type ClockActionPayload = {
  deviceId?: string;
  latitude?: number;
  longitude?: number;
  locationAccuracyM?: number;
  outsideScheduleReason?: string;
};

export type AttendanceHistoryItem = {
  id: string;
  recordId: string | null;
  shiftAssignmentId: string | null;
  workDate: string;
  status: string;
  outsideSchedule: boolean;
  shift: { id: string; name: string; startsAt: string; endsAt: string } | null;
  branch: { id: string; name: string } | null;
  checkInAt: string | null;
  checkOutAt: string | null;
  scheduledMinutes: number;
  workedMinutes: number;
  breakMinutes: number;
  allowedBreakMinutes: number;
  breakOverMinutes: number;
  hasExcessiveBreak: boolean;
  lateMinutes: number;
  isLate: boolean;
  lateGraceMinutes: number;
  earlyLeaveMinutes: number;
  overtimeMinutes: number;
  events: Array<{
    id: string;
    type: AttendanceEventType;
    occurredAt: string;
    method: string;
    deviceId: string | null;
    locationAccuracyM: number | null;
    distanceFromBranchM: number | null;
    isWithinGeofence: boolean | null;
    photoUrl: string | null;
  }>;
  adjustments: Array<{
    id: string;
    requestedCheckInAt: string | null;
    requestedCheckOutAt: string | null;
    reason: string;
    status: string;
    requestedAt: string;
    reviewNote: string | null;
  }>;
  violations: Array<{
    id: string;
    type: string;
    minutesAffected: number;
    severity: 'info' | 'warning' | 'critical';
    status: AttendanceAnomalyStatus;
    details: string | null;
    detectedAt: string;
  }>;
};

export function getMyAttendance() {
  return apiRequest<MyAttendance>('/attendance/me');
}

function selfieFormData(payload: ClockActionPayload, selfie: Blob) {
  const formData = new FormData();
  formData.set('selfie', selfie, 'selfie.jpg');
  for (const [key, value] of Object.entries(payload)) {
    if (value !== undefined) formData.set(key, String(value));
  }
  return formData;
}

export function checkIn(payload: ClockActionPayload, selfie: Blob) {
  return apiRequest<MyAttendance>('/attendance/me/check-in', { method: 'POST', body: selfieFormData(payload, selfie) });
}

export function checkOut(payload: ClockActionPayload, selfie: Blob) {
  return apiRequest<MyAttendance>('/attendance/me/check-out', { method: 'POST', body: selfieFormData(payload, selfie) });
}

export function startBreak(payload: ClockActionPayload) {
  return apiRequest<MyAttendance>('/attendance/me/breaks/start', { method: 'POST', body: JSON.stringify(payload) });
}

export function endBreak(payload: ClockActionPayload) {
  return apiRequest<MyAttendance>('/attendance/me/breaks/end', { method: 'POST', body: JSON.stringify(payload) });
}

export function getMyAttendanceHistory(from?: string, to?: string) {
  const query = new URLSearchParams();
  if (from) query.set('from', from);
  if (to) query.set('to', to);
  return apiRequest<AttendanceHistoryItem[]>(`/attendance/me/history${query.size ? `?${query}` : ''}`);
}

export function requestAttendanceAdjustment(payload: {
  attendanceRecordId?: string;
  shiftAssignmentId?: string;
  requestedCheckInAt?: string;
  requestedCheckOutAt?: string;
  reason: string;
}) {
  return apiRequest('/attendance/me/adjustments', { method: 'POST', body: JSON.stringify(payload) });
}

export type AttendanceAdjustmentReviewItem = {
  id: string;
  employee: { id: string; employeeCode: string; fullName: string };
  recordId: string;
  workDate: string;
  shiftName: string;
  branchName: string;
  currentCheckInAt: string | null;
  currentCheckOutAt: string | null;
  requestedCheckInAt: string | null;
  requestedCheckOutAt: string | null;
  reason: string;
  status: string;
  requestedAt: string;
  reviewedAt: string | null;
  reviewNote: string | null;
  selfies: Array<{
    eventId: string;
    type: 'check_in' | 'check_out';
    occurredAt: string;
    photoUrl: string;
  }>;
};

export function getAttendanceAdjustments() {
  return apiRequest<AttendanceAdjustmentReviewItem[]>('/attendance/adjustments');
}

export type LateViolationItem = {
  id: string;
  employee: { id: string; employeeCode: string; fullName: string };
  workDate: string;
  shiftName: string;
  branchName: string;
  scheduledStartAt: string | null;
  checkInAt: string | null;
  minutesLate: number;
  severity: 'warning' | 'critical';
  detectedAt: string;
};

export function getLateViolations() {
  return apiRequest<LateViolationItem[]>('/attendance/violations/late');
}

export type BreakViolationItem = {
  id: string;
  employee: { id: string; employeeCode: string; fullName: string };
  workDate: string;
  shiftName: string;
  branchName: string;
  allowedMinutes: number;
  actualMinutes: number;
  minutesOver: number;
  severity: 'warning' | 'critical';
  detectedAt: string;
};

export function getBreakViolations() {
  return apiRequest<BreakViolationItem[]>('/attendance/violations/breaks');
}

export type LiveShiftState = 'upcoming' | 'not_checked_in' | 'working' | 'on_break' | 'checked_out' | 'absent' | 'missing_checkout';
export type LiveShiftBadge = 'late' | 'early_leave' | 'outside_geofence' | 'excessive_break';

export type LiveShiftEmployee = {
  assignmentId: string;
  state: LiveShiftState;
  badges: LiveShiftBadge[];
  employee: {
    id: string;
    employeeCode: string;
    fullName: string;
    avatarUrl: string | null;
    department: { id: string; name: string } | null;
    position: { id: string; name: string } | null;
  };
  attendance: {
    recordId: string | null;
    checkInAt: string | null;
    checkOutAt: string | null;
    currentBreakStartedAt: string | null;
    breakMinutes: number;
    allowedBreakMinutes: number;
    lateMinutes: number;
    lastEvent: { type: AttendanceEventType; occurredAt: string } | null;
  };
};

export type LiveShiftCounts = Record<LiveShiftState, number>;

export type LiveShiftItem = {
  id: string;
  name: string;
  startsAt: string;
  endsAt: string;
  operationalStatus: 'upcoming' | 'in_progress' | 'finished';
  requiredHeadcount: number;
  assignedHeadcount: number;
  missingHeadcount: number;
  allowedBreakMinutes: number;
  branch: { id: string; code: string; name: string; timezone: string };
  department: { id: string; code: string; name: string } | null;
  position: { id: string; code: string; name: string } | null;
  counts: LiveShiftCounts;
  employees: LiveShiftEmployee[];
};

export type LiveShiftResponse = {
  generatedAt: string;
  workDate: string;
  refreshAfterSeconds: number;
  policy: {
    lateGraceMinutes: number;
    missingCheckoutAtEndOfDay: boolean;
    absenceAfterShiftEnds: boolean;
  };
  filters: {
    branches: Array<{ id: string; code: string; name: string }>;
    departments: Array<{ id: string; code: string; name: string }>;
    shifts: Array<{ id: string; name: string; startsAt: string; endsAt: string; branchId: string; departmentId: string | null }>;
  };
  summary: {
    shifts: number;
    assignments: number;
    understaffedShifts: number;
    counts: LiveShiftCounts;
  };
  items: LiveShiftItem[];
};

export function getLiveShifts(params: { date?: string; branchId?: string; departmentId?: string; shiftId?: string }) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) query.set(key, value);
  });
  return apiRequest<LiveShiftResponse>(`/attendance/live-shifts${query.size ? `?${query}` : ''}`);
}

export function reviewAttendanceAdjustment(id: string, payload: { status: 'approved' | 'rejected'; reviewNote: string }) {
  return apiRequest<AttendanceAdjustmentReviewItem[]>(`/attendance/adjustments/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
}

export type BranchGeofenceSetting = {
  id: string;
  code: string;
  name: string;
  address: string;
  enabled: boolean;
  latitude: number | null;
  longitude: number | null;
  radiusM: number;
};

export function getBranchGeofences() {
  return apiRequest<BranchGeofenceSetting[]>('/attendance/settings/branches');
}

export function updateBranchGeofence(id: string, payload: { enabled: boolean; latitude?: number; longitude?: number; radiusM: number }) {
  return apiRequest<BranchGeofenceSetting[]>(`/attendance/settings/branches/${id}/geofence`, { method: 'PATCH', body: JSON.stringify(payload) });
}

export type AttendanceAnomalyType = 'late' | 'early_leave' | 'missing_check_in' | 'missing_check_out' | 'absence' | 'outside_geofence' | 'excessive_break' | 'insufficient_hours' | 'outside_schedule';
export type AttendanceAnomalyStatus = 'provisional' | 'active' | 'cleared' | 'excluded';

export type AttendanceAnomalyItem = {
  id: string;
  type: AttendanceAnomalyType;
  date: string;
  status: AttendanceAnomalyStatus;
  severity: 'info' | 'warning' | 'critical';
  minutesAffected: number;
  details: string | null;
  detectedAt: string;
  lastDetectedAt: string;
  scheduledStartAt: string | null;
  scheduledEndAt: string | null;
  actualStartAt: string | null;
  actualEndAt: string | null;
  employee: { id: string; employeeCode: string; fullName: string; branch: { id: string; name: string }; department: { id: string; name: string } };
  shift: { id: string; name: string; startsAt: string; endsAt: string } | null;
  attendanceRecordId: string | null;
};

export type AttendanceAnomalyOverview = {
  summary: {
    totalActive: number;
    provisional: number;
    affectedEmployees: number;
    minutesAffected: number;
    critical: number;
    types: Record<AttendanceAnomalyType, number>;
  };
  pagination: { page: number; pageSize: number; total: number; pages: number };
  items: AttendanceAnomalyItem[];
};

export type AttendanceAnomalyDetail = AttendanceAnomalyItem & {
  graceMinutes: number;
  calculationVersion: number;
  calculation: Record<string, unknown>;
  exclusion: { by: string | null; at: string | null; reason: string | null };
  events: Array<{ id: string; type: AttendanceEventType; occurredAt: string; method: string; deviceId: string | null; photoUrl: string | null; latitude: number | null; longitude: number | null; accuracyM: number | null; distanceM: number | null; withinGeofence: boolean | null; rejected: boolean; rejectionReason: string | null }>;
  geofence: { latitude: number | null; longitude: number | null; radiusM: number } | null;
  history: Array<{ id: string; eventType: string; oldValues: Record<string, unknown> | null; newValues: Record<string, unknown> | null; source: string; reason: string | null; actor: string; createdAt: string }>;
};

export type AttendanceAnomalySettings = {
  id: string;
  lateGraceMinutes: number;
  earlyLeaveGraceMinutes: number;
  insufficientToleranceMinutes: number;
  missingCheckInReminderMinutes: number;
  maxLocationAccuracyM: number;
  lateCriticalMinutes: number;
  earlyLeaveCriticalMinutes: number;
  breakCriticalMinutes: number;
  insufficientCriticalMinutes: number;
};

function anomalyQuery(filters: Record<string, string | number | undefined>) {
  const query = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => { if (value !== undefined && value !== '') query.set(key, String(value)); });
  return query;
}

export function getAttendanceAnomalies(filters: Record<string, string | number | undefined>) {
  const query = anomalyQuery(filters);
  return apiRequest<AttendanceAnomalyOverview>(`/attendance/anomalies?${query}`);
}

export function getMyAttendanceAnomalies(filters: Record<string, string | number | undefined>) {
  const query = anomalyQuery(filters);
  return apiRequest<AttendanceAnomalyOverview>(`/attendance/me/anomalies?${query}`);
}

export function getAttendanceAnomalyOptions() {
  return apiRequest<{ employees: Array<{ id: string; employeeCode: string; fullName: string }>; branches: Array<{ id: string; name: string }>; departments: Array<{ id: string; name: string }> }>('/attendance/anomalies/options');
}

export function getAttendanceAnomalyDetail(id: string) {
  return apiRequest<AttendanceAnomalyDetail>(`/attendance/anomalies/${id}`);
}

export function getAttendanceAnomalyStatistics(filters: Record<string, string | number | undefined>) {
  const query = anomalyQuery(filters);
  return apiRequest<{ scheduledShifts: number; absence: number; absenceRate: number; byType: Array<{ type: AttendanceAnomalyType; count: number; minutes: number; employees: number }>; daily: Array<{ date: string; count: number; late: number; absence: number }> }>(`/attendance/anomalies/statistics?${query}`);
}

export function excludeAttendanceAnomaly(id: string, reason: string) {
  return apiRequest<AttendanceAnomalyDetail>(`/attendance/anomalies/${id}/exclude`, { method: 'POST', body: JSON.stringify({ reason }) });
}

export function restoreAttendanceAnomaly(id: string) {
  return apiRequest<AttendanceAnomalyDetail>(`/attendance/anomalies/${id}/restore`, { method: 'POST' });
}

export function recalculateAttendanceAnomaly(id: string) {
  return apiRequest<AttendanceAnomalyDetail>(`/attendance/anomalies/${id}/recalculate`, { method: 'POST' });
}

export function recalculateAllAttendanceAnomalies() {
  return apiRequest<{ recalculatedRecords: number; completedAt: string }>('/attendance/anomalies/recalculate-all', { method: 'POST' });
}

export function getAttendanceAnomalySettings() {
  return apiRequest<AttendanceAnomalySettings>('/attendance/anomaly-settings');
}

export function updateAttendanceAnomalySettings(payload: Omit<AttendanceAnomalySettings, 'id'>) {
  return apiRequest<AttendanceAnomalySettings>('/attendance/anomaly-settings', { method: 'PATCH', body: JSON.stringify(payload) });
}
