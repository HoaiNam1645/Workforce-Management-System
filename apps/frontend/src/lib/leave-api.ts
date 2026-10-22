import { apiRequest } from './api-client';

export type LeaveUnit = 'day' | 'hour' | 'both';
export type AccrualMethod = 'upfront' | 'monthly' | 'none';

export type LeaveEntitlementPolicy = {
  id: string;
  leaveTypeId: string;
  name: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  accrualMethod: AccrualMethod;
  allowanceAmount: number;
  unit: LeaveUnit;
  carryoverLimit: number | null;
  maxBalance: number | null;
  prorateNewHires: boolean;
  appliesToEmploymentType: 'full_time' | 'part_time' | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type LeaveTypeItem = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  color: string;
  isPaid: boolean;
  unit: LeaveUnit;
  tracksBalance: boolean;
  allowNegativeBalance: boolean;
  requiresAttachment: boolean;
  attachmentRequiredAfter: number | null;
  hoursPerDay: number;
  hourIncrementMinutes: number;
  minNoticeDays: number;
  allowRetroactive: boolean;
  requiresApproval: boolean;
  isActive: boolean;
  currentPolicy: LeaveEntitlementPolicy | null;
  nextPolicy: LeaveEntitlementPolicy | null;
  usage: { employeesWithBalance: number; requests: number; policyCount: number };
  createdAt: string;
  updatedAt: string;
};

export type LeaveTypeReport = {
  summary: { total: number; active: number; paid: number; trackedBalance: number; missingPolicy: number };
  items: LeaveTypeItem[];
};

export type LeaveTypePayload = {
  code: string;
  name: string;
  description?: string | null;
  color: string;
  isPaid: boolean;
  unit: LeaveUnit;
  tracksBalance: boolean;
  allowNegativeBalance: boolean;
  requiresAttachment: boolean;
  attachmentRequiredAfter?: number | null;
  hoursPerDay: number;
  hourIncrementMinutes: number;
  minNoticeDays: number;
  allowRetroactive: boolean;
  requiresApproval: boolean;
  isActive: boolean;
};

export type LeavePolicyPayload = {
  name: string;
  effectiveFrom: string;
  effectiveTo?: string | null;
  accrualMethod: AccrualMethod;
  allowanceAmount: number;
  carryoverLimit?: number | null;
  maxBalance?: number | null;
  prorateNewHires: boolean;
  appliesToEmploymentType?: 'full_time' | 'part_time' | null;
  isActive: boolean;
};

export function getLeaveTypes(filters: Record<string, string | undefined>) {
  const query = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => { if (value) query.set(key, value); });
  return apiRequest<LeaveTypeReport>(`/leave/types?${query.toString()}`);
}

export function createLeaveType(payload: LeaveTypePayload) {
  return apiRequest<LeaveTypeItem>('/leave/types', { method: 'POST', body: JSON.stringify(payload) });
}

export function updateLeaveType(id: string, payload: Partial<LeaveTypePayload>) {
  return apiRequest<LeaveTypeItem>(`/leave/types/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
}

export function createLeavePolicy(leaveTypeId: string, payload: LeavePolicyPayload) {
  return apiRequest<LeaveEntitlementPolicy>(`/leave/types/${leaveTypeId}/entitlement-policies`, { method: 'POST', body: JSON.stringify(payload) });
}

export function updateLeavePolicy(id: string, payload: LeavePolicyPayload) {
  return apiRequest<LeaveEntitlementPolicy>(`/leave/entitlement-policies/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
}

export type LeaveBalanceItem = {
  id: string;
  year: number;
  employee: { id: string; employeeCode: string; fullName: string; branch: { id: string; name: string }; department: { id: string; name: string } };
  leaveType: { id: string; code: string; name: string; color: string; unit: LeaveUnit; balanceUnit: 'day' | 'hour'; isPaid: boolean; allowNegativeBalance: boolean };
  opening: number;
  accrued: number;
  adjusted: number;
  reserved: number;
  used: number;
  expired: number;
  totalGranted: number;
  available: number;
  updatedAt: string;
};

export type LeaveBalanceReport = {
  year: number;
  summary: {
    employees: number; granted: number; reserved: number; used: number; available: number; low: number;
    byUnit: Record<'day' | 'hour', { granted: number; reserved: number; used: number; available: number }>;
  };
  items: LeaveBalanceItem[];
};

export type LeaveBalanceOptions = {
  employees: Array<{ id: string; employeeCode: string; fullName: string; branch: { id: string; name: string }; department: { id: string; name: string } }>;
  leaveTypes: Array<{ id: string; code: string; name: string; color: string; unit: LeaveUnit; tracksBalance: boolean; isPaid: boolean }>;
  branches: Array<{ id: string; name: string }>;
  departments: Array<{ id: string; name: string }>;
};

export type BalanceLedger = {
  balance: LeaveBalanceItem;
  transactions: Array<{ id: string; type: string; amount: number; balanceBefore: number | null; balanceAfter: number | null; effectiveDate: string; description: string | null; createdBy: string; createdAt: string }>;
};

export type LeaveRequestPayload = {
  leaveTypeId: string;
  requestMode: 'full_day' | 'half_day' | 'hourly';
  startDate: string;
  endDate: string;
  dayPart?: 'first_half' | 'second_half' | null;
  startTime?: string | null;
  endTime?: string | null;
  reason: string;
  attachmentUrl?: string | null;
};

export type MyLeaveData = {
  employee: { id: string; employeeCode: string; fullName: string };
  leaveTypes: Array<{
    id: string; code: string; name: string; description: string | null; color: string; isPaid: boolean; unit: LeaveUnit;
    tracksBalance: boolean; allowNegativeBalance: boolean; requiresAttachment: boolean; attachmentRequiredAfter: number | null;
    hoursPerDay: number; hourIncrementMinutes: number; minNoticeDays: number; allowRetroactive: boolean;
    balance: null | { opening: number; accrued: number; adjusted: number; reserved: number; used: number; expired: number; totalGranted: number; available: number };
  }>;
  requests: Array<{ id: string; leaveType: { id: string; name: string; color: string }; startsAt: string; endsAt: string; requestMode: string; dayPart: string | null; amount: number; unit: string; isPaid: boolean; reason: string | null; attachmentUrl: string | null; status: string; requestedAt: string }>;
};

export type LeaveRequestPreview = {
  startsAt: string;
  endsAt: string;
  amount: number;
  unit: 'day' | 'hour';
  balanceYear: number;
  leaveType: { id: string; name: string; unit: LeaveUnit; isPaid: boolean; tracksBalance: boolean };
  balance: { available: number; deductedAmount: number; afterRequest: number } | null;
  overlap: { id: string; startsAt: string; endsAt: string; status: string } | null;
  valid: boolean;
  errors: string[];
};

export function getLeaveBalances(filters: Record<string, string | undefined>) {
  const query = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => { if (value) query.set(key, value); });
  return apiRequest<LeaveBalanceReport>(`/leave/balances?${query.toString()}`);
}

export function getLeaveBalanceOptions() {
  return apiRequest<LeaveBalanceOptions>('/leave/balances/options');
}

export function getLeaveBalanceLedger(id: string) {
  return apiRequest<BalanceLedger>(`/leave/balances/${id}/ledger`);
}

export function adjustLeaveBalance(payload: { employeeId: string; leaveTypeId: string; balanceYear: number; direction: 'increase' | 'decrease'; amount: number; effectiveDate: string; reason: string }) {
  return apiRequest<LeaveBalanceItem>('/leave/balances/adjust', { method: 'POST', body: JSON.stringify(payload) });
}

export function getMyLeave() {
  return apiRequest<MyLeaveData>('/leave/my');
}

export function previewLeaveRequest(payload: LeaveRequestPayload) {
  return apiRequest<LeaveRequestPreview>('/leave/requests/preview', { method: 'POST', body: JSON.stringify(payload) });
}

export function createLeaveRequest(payload: LeaveRequestPayload) {
  return apiRequest<MyLeaveData['requests'][number]>('/leave/requests', { method: 'POST', body: JSON.stringify(payload) });
}
