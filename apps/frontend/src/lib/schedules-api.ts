import { apiRequest } from './api-client';

export type ShiftStatus = 'draft' | 'published' | 'completed' | 'cancelled';

export type ShiftItem = {
  id: string;
  shiftTemplateId: string | null;
  name: string;
  startsAt: string;
  endsAt: string;
  unpaidBreakMinutes: number;
  requiredHeadcount: number;
  assignmentCount: number;
  openHeadcount: number;
  status: ShiftStatus;
  canModify: boolean;
  lockReason: string | null;
  notes: string | null;
  branch: { id: string; code: string; name: string; timezone: string };
  department: { id: string; code: string; name: string } | null;
  position: { id: string; code: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
};

export type ShiftPage = {
  items: ShiftItem[];
  summary: { total: number; draft: number; published: number; requiredHeadcount: number; assignedHeadcount: number };
  pagination: { page: number; limit: number; total: number; totalPages: number };
};

type Option = { id: string; code: string; name: string };

export type ScheduleOptions = {
  branches: Array<Option & { timezone: string }>;
  departments: Option[];
  positions: Option[];
};

export type ShiftPayload = {
  branchId: string;
  departmentId?: string | null;
  positionId?: string | null;
  name: string;
  startsAt: string;
  endsAt: string;
  unpaidBreakMinutes: number;
  requiredHeadcount: number;
  notes?: string | null;
};

export type ShiftTemplate = {
  id: string;
  code: string;
  name: string;
  color: string;
  startTime: string;
  endTime: string;
  crossesMidnight: boolean;
  unpaidBreakMinutes: number;
  requiredHeadcount: number;
  isActive: boolean;
  branch: Option | null;
  createdAt: string;
  updatedAt: string;
};

export type ShiftTemplatePayload = {
  branchId?: string | null;
  code: string;
  name: string;
  color: string;
  startTime: string;
  endTime: string;
  crossesMidnight: boolean;
  unpaidBreakMinutes: number;
  requiredHeadcount: number;
};

export type ShiftAssignment = {
  id: string;
  status: string;
  assignedAt: string;
  employee: {
    id: string;
    employeeCode: string;
    fullName: string;
    initials: string;
    department: { id: string; name: string };
    position: { id: string; name: string };
    branch: { id: string; name: string };
  };
};

export type EmployeeScheduleGrid = {
  shifts: ShiftItem[];
  employees: Array<{
    id: string;
    employeeCode: string;
    fullName: string;
    initials: string;
    employmentType: string;
    employmentStatus: string;
    department: { id: string; name: string };
    position: { id: string; name: string };
    branch: { id: string; name: string };
  }>;
  assignments: Array<{ id: string; shiftId: string; employeeId: string; status: string }>;
};

export type ShiftCandidate = {
  id: string;
  employeeCode: string;
  fullName: string;
  initials: string;
  department: { id: string; name: string };
  position: { id: string; name: string };
  branch: { id: string; name: string };
  matchesDepartment: boolean;
  matchesPosition: boolean;
  recommended: boolean;
  eligible: boolean;
  reasons: string[];
};

export function getScheduleOptions() {
  return apiRequest<ScheduleOptions>('/schedules/options');
}

export function getShifts(params: {
  from?: string;
  to?: string;
  branchId?: string;
  departmentId?: string;
  status?: ShiftStatus;
  search?: string;
  page?: number;
  limit?: number;
}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') query.set(key, String(value));
  });
  return apiRequest<ShiftPage>(`/schedules/shifts?${query.toString()}`);
}

export function getEmployeeScheduleGrid(params: {
  from: string;
  to: string;
  branchId?: string;
  departmentId?: string;
  status?: ShiftStatus;
  search?: string;
}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') query.set(key, String(value));
  });
  query.set('limit', '200');
  return apiRequest<EmployeeScheduleGrid>(`/schedules/grid?${query.toString()}`);
}

export function createShift(payload: ShiftPayload) {
  return apiRequest<ShiftItem>('/schedules/shifts', { method: 'POST', body: JSON.stringify(payload) });
}

export function updateShift(id: string, payload: Partial<ShiftPayload>) {
  return apiRequest<ShiftItem>(`/schedules/shifts/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
}

export function moveShift(id: string, startsAt: string, endsAt: string) {
  return updateShift(id, { startsAt, endsAt });
}

export function deleteShift(id: string) {
  return apiRequest<{ id: string; action: 'deleted' | 'cancelled' }>(`/schedules/shifts/${id}`, { method: 'DELETE' });
}

export function getShiftTemplates() {
  return apiRequest<ShiftTemplate[]>('/schedules/shift-templates');
}

export function createShiftTemplate(payload: ShiftTemplatePayload) {
  return apiRequest<ShiftTemplate>('/schedules/shift-templates', { method: 'POST', body: JSON.stringify(payload) });
}

export function updateShiftTemplate(id: string, payload: Partial<ShiftTemplatePayload>) {
  return apiRequest<ShiftTemplate>(`/schedules/shift-templates/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
}

export function deleteShiftTemplate(id: string) {
  return apiRequest<{ id: string; deleted: boolean }>(`/schedules/shift-templates/${id}`, { method: 'DELETE' });
}

export function getShiftAssignments(shiftId: string) {
  return apiRequest<ShiftAssignment[]>(`/schedules/shifts/${shiftId}/assignments`);
}

export function getShiftCandidates(shiftId: string, search?: string) {
  const query = search ? `?search=${encodeURIComponent(search)}` : '';
  return apiRequest<ShiftCandidate[]>(`/schedules/shifts/${shiftId}/candidates${query}`);
}

export function assignEmployees(shiftId: string, employeeIds: string[], allowDepartmentOrPositionMismatch = false) {
  return apiRequest<ShiftAssignment[]>(`/schedules/shifts/${shiftId}/assignments`, {
    method: 'POST',
    body: JSON.stringify({ employeeIds, allowDepartmentOrPositionMismatch }),
  });
}

export function removeShiftAssignment(shiftId: string, assignmentId: string) {
  return apiRequest<ShiftAssignment[]>(`/schedules/shifts/${shiftId}/assignments/${assignmentId}`, { method: 'DELETE' });
}

export type ScheduleValidation = {
  valid: boolean;
  shiftCount: number;
  conflicts: Array<{ employeeId: string; employeeName: string; firstShiftId: string; secondShiftId: string }>;
  understaffed: Array<{ id: string; name: string; startsAt: string; assigned: number; required: number }>;
};

export type ScheduleTemplate = {
  id: string;
  name: string;
  description: string | null;
  items: Array<{ id: string; dayOffset: number; requiredHeadcount: number; shiftTemplate: ShiftTemplate; department: { id: string; name: string } | null; position: { id: string; name: string } | null }>;
};

export function repeatShift(id: string, payload: { frequency: 'daily' | 'weekly'; occurrences: number; until: string }) {
  return apiRequest<{ recurrenceGroupId: string; created: number }>(`/schedules/shifts/${id}/repeat`, { method: 'POST', body: JSON.stringify(payload) });
}

export function copySchedule(payload: { sourceFrom: string; sourceTo: string; targetStart: string; maxShifts?: number }) {
  return apiRequest<{ created: number }>('/schedules/copy', { method: 'POST', body: JSON.stringify(payload) });
}

export function validateSchedule(payload: { from: string; to: string; branchId?: string }) {
  return apiRequest<ScheduleValidation>('/schedules/validate', { method: 'POST', body: JSON.stringify(payload) });
}

export function publishSchedule(payload: { from: string; to: string; branchId?: string; allowUnderstaffed?: boolean }) {
  return apiRequest<{ published: number; validation: ScheduleValidation }>('/schedules/publish', { method: 'POST', body: JSON.stringify(payload) });
}

export function getScheduleTemplates() {
  return apiRequest<ScheduleTemplate[]>('/schedules/schedule-templates');
}

export function saveScheduleTemplateFromRange(payload: { name: string; from: string; to: string; branchId?: string }) {
  return apiRequest<{ id: string; createdItems: number }>('/schedules/schedule-templates/from-range', { method: 'POST', body: JSON.stringify(payload) });
}

export function applyScheduleTemplate(id: string, payload: { branchId: string; startDate: string }) {
  return apiRequest<{ created: number }>(`/schedules/schedule-templates/${id}/apply`, { method: 'POST', body: JSON.stringify(payload) });
}

export function getMySchedule(from: string, to: string) {
  const query = new URLSearchParams({ from, to });
  return apiRequest<ShiftItem[]>(`/schedules/my-schedule?${query}`);
}

export type PersonalShiftDetail = ShiftItem & {
  coworkers: Array<{ id: string; employeeCode: string; fullName: string; initials: string; department: string; position: string }>;
};

export function getMyShiftDetail(id: string) {
  return apiRequest<PersonalShiftDetail>(`/schedules/my-schedule/${id}`);
}
