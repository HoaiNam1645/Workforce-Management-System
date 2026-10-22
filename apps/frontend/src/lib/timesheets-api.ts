import { apiBlob, apiRequest } from './api-client';

export type TimesheetTotals = {
  scheduledMinutes: number;
  workedMinutes: number;
  breakMinutes: number;
  regularMinutes: number;
  overtimeCandidateMinutes: number;
  overtimeMinutes: number;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  entries: number;
  issues: number;
};

export type TimesheetEntry = {
  key: string;
  attendanceRecordId: string | null;
  workDate: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  branchId: string;
  branchName: string;
  departmentId: string | null;
  departmentName: string;
  shiftId: string | null;
  shiftName: string;
  scheduledStartAt: string | null;
  scheduledEndAt: string | null;
  actualCheckInAt: string | null;
  actualCheckOutAt: string | null;
  scheduledMinutes: number;
  workedMinutes: number;
  breakMinutes: number;
  regularMinutes: number;
  overtimeCandidateMinutes: number;
  overtimeMinutes: number;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  state: 'complete' | 'incomplete' | 'absent' | 'scheduled' | 'outside_schedule' | 'adjusted';
  warnings: string[];
  adjustment: { reason: string; adjustedAt: string } | null;
};

export type TimesheetReport = {
  generatedAt: string;
  range: { from: string; to: string; timezone: string };
  period: { id: string; name: string; status: string } | null;
  summary: TimesheetTotals & { employees: number };
  options: {
    branches: { id: string; code: string; name: string }[];
    departments: { id: string; code: string; name: string }[];
    employees: { id: string; employeeCode: string; fullName: string }[];
  };
  timesheets: {
    id: string | null;
    employee: {
      id: string;
      employeeCode: string;
      fullName: string;
      branch: { id: string; name: string };
      department: { id: string | null; name: string };
    };
    status: string;
    totals: TimesheetTotals;
    entries: TimesheetEntry[];
  }[];
  byDay: TimesheetAggregate[];
  byWeek: TimesheetAggregate[];
  byMonth: TimesheetAggregate[];
  byDepartment: TimesheetDimension[];
  byBranch: TimesheetDimension[];
  byShift: TimesheetDimension[];
};

export type TimesheetAggregate = TimesheetTotals & { key: string; label: string };
export type TimesheetDimension = TimesheetTotals & { id: string; name: string; employees: number };

export type TimesheetFilters = {
  from: string;
  to: string;
  employeeId?: string;
  branchId?: string;
  departmentId?: string;
  shiftId?: string;
  search?: string;
};

export function getTimesheetReport(filters: TimesheetFilters) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  return apiRequest<TimesheetReport>(`/timesheets?${params.toString()}`);
}

export function generateTimesheets(filters: Pick<TimesheetFilters, 'from' | 'to' | 'branchId' | 'departmentId'>) {
  return apiRequest<TimesheetReport>('/timesheets/generate', { method: 'POST', body: JSON.stringify(filters) });
}

export function adjustTimesheet(id: string, payload: { sourceKey: string; workDate: string; breakMinutes: number; regularMinutes: number; overtimeMinutes: number; reason: string }) {
  return apiRequest<TimesheetReport>(`/timesheets/${id}/adjust`, { method: 'PATCH', body: JSON.stringify(payload) });
}

export function actOnTimesheet(id: string, action: 'approve' | 'return' | 'lock' | 'unlock', note: string) {
  return apiRequest<{ id: string; status: string }>(`/timesheets/${id}/${action}`, { method: 'PATCH', body: JSON.stringify({ note }) });
}

export type TimesheetHistoryItem = {
  id: string;
  type: 'status' | 'change';
  action: string;
  note: string | null;
  actor: string;
  createdAt: string;
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
};

export function getTimesheetHistory(id: string) {
  return apiRequest<TimesheetHistoryItem[]>(`/timesheets/${id}/history`);
}

export async function exportTimesheets(filters: TimesheetFilters) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value); });
  const blob = await apiBlob(`/timesheets/export?${params.toString()}`);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `bang-cong-${filters.from}-${filters.to}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
