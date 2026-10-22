import { apiBlob, apiRequest } from './api-client';

export type ReportData = {
  generatedAt: string; range: { from: string; to: string; interval: string }; dataState: 'live' | 'provisional' | 'locked_timesheet'; currency: string;
  employees: Record<string, number>; schedule: Record<string, number>; attendance: Record<string, number>;
  anomalies: Array<Record<string, string | number>>; leave: Record<string, number>; timesheets: Record<string, number>; payroll: Record<string, number>;
  trend: Array<{ key: string; planned: number; actual: number }>;
  dimensions: Array<{ id: string; name: string; kind: string; employees: number; scheduled_minutes: number; worked_minutes: number; overtime_minutes: number; late_minutes: number; absences: number }>;
  performance: Array<{ id: string; employee_code: string; name: string; branch: string; department: string; position: string; shifts: number; scheduled_minutes: number; worked_minutes: number; overtime_minutes: number; late_minutes: number; absences: number; present_shifts: number; on_time_shifts: number; sufficient_shifts: number; anomalies: number }>;
  employeeRows: Array<{ id: string; employee_code: string; name: string; employment_type: string; employment_status: string; hire_date: string; termination_date: string | null; branch: string; department: string; position: string }>;
  scheduleRows: Array<{ id: string; name: string; starts_at: string; ends_at: string; branch: string; department: string | null; position: string | null; required: number; assigned: number; missing: number; coverage_status: string }>;
  attendanceRows: Array<{ id: string; work_date: string; status: string; check_in_at: string | null; check_out_at: string | null; scheduled_minutes: number; worked_minutes: number; break_minutes: number; allowed_break_minutes: number; overtime_minutes: number; late_minutes: number; early_leave_minutes: number; employee: string; employee_code: string; branch: string; shift: string; break_count: number; break_open: boolean; gps_events: number; selfie_events: number; outside_geofence_events: number; adjustment_requests: number }>;
  anomalyRows: Array<{ id: string; violation_date: string; violation_type: string; minutes_affected: number; severity: string; status: string; employee: string; employee_code: string; branch: string; department: string }>;
  leaveRows: Array<{ id: string; starts_at: string; ends_at: string; amount: number; unit: string; is_paid: boolean; status: string; requested_at: string; reviewed_at: string | null; employee: string; employee_code: string; leave_type: string; branch: string; department: string }>;
  timesheetRows: Array<{ id: string; period: string; starts_on: string; ends_on: string; status: string; scheduled_minutes: number; worked_minutes: number; break_minutes: number; regular_minutes: number; overtime_minutes: number; paid_leave_minutes: number; unpaid_leave_minutes: number; employee: string; employee_code: string; branch: string; department: string; adjustments: number }>;
  payrollRows: Array<{ id: string; period: string; starts_on: string; ends_on: string; status: string; currency_code: string; base_salary: number; regular_pay: number; overtime_pay: number; holiday_pay: number; allowance_total: number; bonus_total: number; deduction_total: number; gross_pay: number; net_pay: number; paid_total: number; balance_due: number; employee: string; employee_code: string; branch: string; department: string }>;
  overtimeRows: Array<{ id: string; employee_code: string; employee: string; branch: string; department: string; candidate_minutes: number; confirmed_minutes: number; overtime_pay: number }>;
  options: Array<{ kind: 'branch' | 'department' | 'position'; id: string; code: string; name: string }>;
};

export type ReportFilters = { from: string; to: string; interval?: string; branchId?: string; departmentId?: string; positionId?: string };
function query(filters: ReportFilters) { const params = new URLSearchParams(); Object.entries(filters).forEach(([key,value]) => { if (value) params.set(key,value); }); return params; }
export const getReports = (filters: ReportFilters) => apiRequest<ReportData>(`/reports/overview?${query(filters)}`);
export async function exportReport(filters: ReportFilters, report: string, format: 'csv' | 'xls' | 'pdf') { const params=query(filters); params.set('report',report); params.set('format',format); const blob=await apiBlob(`/reports/export?${params}`); const url=URL.createObjectURL(blob); const link=document.createElement('a'); link.href=url; link.download=`bao-cao-${report}-${filters.from}-${filters.to}.${format}`; link.click(); URL.revokeObjectURL(url); }
