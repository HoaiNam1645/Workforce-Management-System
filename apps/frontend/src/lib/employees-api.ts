import { apiRequest, ApiError } from './api-client';

export { ApiError } from './api-client';

export type EmploymentStatus = 'active' | 'on_leave' | 'terminated';
export type EmploymentType = 'full_time' | 'part_time';

export type EmployeeListItem = {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  fullName: string;
  initials: string;
  workEmail: string | null;
  personalEmail: string | null;
  email: string | null;
  phone: string | null;
  employmentType: EmploymentType;
  employmentStatus: EmploymentStatus;
  hireDate: string;
  terminationDate: string | null;
  avatarUrl: string | null;
  branch: { id: string; code: string; name: string };
  department: { id: string; code: string; name: string };
  position: { id: string; code: string; name: string };
  manager: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
};

export type EmployeeWorkHistoryItem = {
  id: string;
  branch: { id: string; name: string };
  department: { id: string; name: string };
  position: { id: string; name: string };
  manager: { id: string; name: string } | null;
  employmentType: EmploymentType;
  effectiveFrom: string;
  effectiveTo: string | null;
  reason: string | null;
};

export type EmployeeDetail = EmployeeListItem & {
  dateOfBirth: string | null;
  gender: string | null;
  address: string | null;
  emergencyContact: { name: string | null; phone: string | null; relationship: string | null };
  terminationReason: string | null;
  managerId: string | null;
  notes: string | null;
  workHistory: EmployeeWorkHistoryItem[];
};

export type SalaryRate = {
  id: string;
  payType: 'hourly' | 'monthly';
  baseRate: number;
  currencyCode: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  note: string | null;
  createdAt: string;
};

export type SalaryRatesResponse = { current: SalaryRate | null; history: SalaryRate[] };

export type AccessRole = { id: string; code: string; name: string; description: string | null };

export type EmployeeAccess = {
  enabled: boolean;
  email: string | null;
  status: 'invited' | 'active' | 'locked' | 'disabled' | null;
  roles: AccessRole[];
  availableRoles: AccessRole[];
};

export type EmployeePage = {
  items: EmployeeListItem[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
};

export type EmployeeSummary = {
  total: number;
  active: number;
  onLeave: number;
  terminated: number;
  fullTime: number;
  partTime: number;
};

type SelectOption = { id: string; code: string; name: string };

export type EmployeeOptions = {
  organization: SelectOption | null;
  branches: SelectOption[];
  departments: SelectOption[];
  positions: Array<SelectOption & { isManager: boolean }>;
  roles: AccessRole[];
};

export type EmployeePayload = {
  employeeCode: string;
  firstName: string;
  lastName: string;
  workEmail?: string | null;
  phone?: string | null;
  employmentType: EmploymentType;
  employmentStatus?: EmploymentStatus;
  hireDate: string;
  terminationDate?: string | null;
  terminationReason?: string | null;
  primaryBranchId: string;
  departmentId: string;
  positionId: string;
  createAccount?: boolean;
  loginEmail?: string;
  password?: string;
  roleIds?: string[];
};

export function getEmployees(params: {
  search?: string;
  status?: EmploymentStatus;
  branchId?: string;
  departmentId?: string;
  page: number;
  limit: number;
}) {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') searchParams.set(key, String(value));
  });
  return apiRequest<EmployeePage>(`/employees?${searchParams.toString()}`);
}

export function getEmployeeSummary() {
  return apiRequest<EmployeeSummary>('/employees/summary');
}

export function getEmployeeOptions() {
  return apiRequest<EmployeeOptions>('/employees/options');
}

export function createEmployee(payload: EmployeePayload) {
  return apiRequest<EmployeeListItem>('/employees', { method: 'POST', body: JSON.stringify(payload) });
}

export function updateEmployee(id: string, payload: Partial<EmployeePayload>) {
  return apiRequest<EmployeeListItem>(`/employees/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
}

export function deleteEmployee(id: string) {
  return apiRequest<{ id: string; deleted: boolean }>(`/employees/${id}`, { method: 'DELETE' });
}

export function getEmployee(id: string) {
  return apiRequest<EmployeeDetail>(`/employees/${id}`);
}

export function getEmployeeWorkHistory(id: string) {
  return apiRequest<EmployeeWorkHistoryItem[]>(`/employees/${id}/work-history`);
}

export function getSalaryRates(id: string) {
  return apiRequest<SalaryRatesResponse>(`/employees/${id}/salary-rates`);
}

export function createSalaryRate(id: string, payload: {
  payType: 'hourly' | 'monthly';
  baseRate: number;
  currencyCode: string;
  effectiveFrom: string;
  note?: string | null;
}) {
  return apiRequest<SalaryRatesResponse>(`/employees/${id}/salary-rates`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function getEmployeeAccess(id: string) {
  return apiRequest<EmployeeAccess>(`/employees/${id}/access`);
}

export function updateEmployeeAccess(id: string, payload: {
  enabled: boolean;
  email?: string;
  status?: 'invited' | 'active' | 'locked' | 'disabled';
  roleIds?: string[];
  password?: string;
}) {
  return apiRequest<EmployeeAccess>(`/employees/${id}/access`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}
