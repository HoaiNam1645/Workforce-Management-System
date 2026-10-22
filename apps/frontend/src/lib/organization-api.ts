import { apiRequest } from "./api-client";

export type OrganizationFilters = {
  search?: string;
  status?: string;
  gps?: string;
  branchId?: string;
  parentId?: string;
};
const query = (filters: OrganizationFilters) => {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value && value !== "all") params.set(key, value);
  });
  return params.toString();
};

export type Branch = {
  id: string;
  code: string;
  name: string;
  email: string | null;
  phone: string | null;
  addressLine: string;
  ward: string | null;
  district: string | null;
  province: string | null;
  countryCode: string;
  postalCode: string | null;
  branchType: string;
  latitude: number | null;
  longitude: number | null;
  geofenceEnabled: boolean;
  geofenceRadiusM: number;
  locationAccuracyM: number;
  timezone: string;
  isHeadOffice: boolean;
  isActive: boolean;
  notes: string | null;
  version: number;
  manager: EmployeeOption | null;
  counts: { employees: number; departments: number; shifts: number };
  warnings: string[];
};
export type EmployeeOption = {
  id: string;
  employeeCode: string;
  fullName: string;
  userId: string | null;
  departmentId: string;
  branchId: string;
  employmentStatus: string;
};
export type BranchPayload = Omit<
  Branch,
  "id" | "manager" | "counts" | "warnings"
>;
export type OperatingHour = {
  id?: string;
  dayOfWeek: number;
  isClosed: boolean;
  opensAt: string | null;
  closesAt: string | null;
  spansNextDay: boolean;
};
export type OperatingException = {
  id?: string;
  exceptionDate: string;
  isClosed: boolean;
  opensAt: string | null;
  closesAt: string | null;
  spansNextDay: boolean;
  name: string;
  note: string | null;
};
export type BranchDetail = Branch & {
  operatingHours: OperatingHour[];
  operatingExceptions: OperatingException[];
  managers: Array<{
    id: string;
    employeeId: string;
    responsibility: string;
    isPrimary: boolean;
    effectiveFrom: string;
    effectiveTo: string | null;
    active: boolean;
    employee: EmployeeOption;
    createdByName: string;
  }>;
  departments: Array<{
    branchId: string;
    departmentId: string;
    isActive: boolean;
    department: { id: string; code: string; name: string };
  }>;
  employees: Array<
    EmployeeOption & {
      position: { id: string; name: string } | null;
      manager: { id: string; name: string } | null;
    }
  >;
  shifts: Array<{
    id: string;
    name: string;
    startsAt: string;
    endsAt: string;
    status: string;
    department: string | null;
    position: string | null;
    requiredHeadcount: number;
  }>;
  scopes: Array<{
    id: string;
    userId: string;
    userName: string;
    email: string;
    role: string;
    grantedAt: string;
  }>;
  history: Array<{
    id: string;
    action: string;
    actor: string;
    oldValues: Record<string, unknown> | null;
    newValues: Record<string, unknown> | null;
    createdAt: string;
  }>;
};
export type Department = {
  id: string;
  code: string;
  name: string;
  parentId: string | null;
  description: string | null;
  isActive: boolean;
  counts: {
    employees: number;
    children: number;
    branches: number;
    positions: number;
  };
  branches: Array<{ id: string; name: string }>;
  positions: Array<{ id: string; name: string }>;
  children?: Department[];
};
export type Position = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isManager: boolean;
  isActive: boolean;
  counts: { employees: number; shifts: number; departments: number };
  departments: Array<{ id: string; name: string }>;
};

export function getBranches(filters: OrganizationFilters) {
  return apiRequest<{
    summary: {
      total: number;
      active: number;
      geofence: number;
      missingConfiguration: number;
      employees: number;
    };
    items: Branch[];
  }>(`/organization/branches?${query(filters)}`);
}
export function geocodeAddress(address: string) {
  return apiRequest<{
    latitude: number;
    longitude: number;
    displayName: string;
  } | null>(`/organization/geocode?q=${encodeURIComponent(address)}`);
}
export function getBranch(id: string) {
  return apiRequest<BranchDetail>(`/organization/branches/${id}`);
}
export function saveBranch(payload: BranchPayload, id?: string) {
  return apiRequest<Branch>(
    id ? `/organization/branches/${id}` : "/organization/branches",
    { method: id ? "PATCH" : "POST", body: JSON.stringify(payload) },
  );
}
export function changeBranchStatus(
  id: string,
  active: boolean,
  reason: string,
) {
  return apiRequest<Branch>(
    `/organization/branches/${id}/${active ? "reactivate" : "deactivate"}`,
    { method: "POST", body: JSON.stringify({ reason }) },
  );
}
export function saveOperatingHours(
  id: string,
  hours: OperatingHour[],
  exceptions: OperatingException[],
) {
  return apiRequest<{
    hours: OperatingHour[];
    exceptions: OperatingException[];
  }>(`/organization/branches/${id}/operating-hours`, {
    method: "PUT",
    body: JSON.stringify({ hours, exceptions }),
  });
}
export function assignBranchManager(
  id: string,
  payload: {
    employeeId: string;
    responsibility: string;
    isPrimary: boolean;
    effectiveFrom: string;
    effectiveTo?: string | null;
    grantManagerScope?: boolean;
  },
) {
  return apiRequest(`/organization/branches/${id}/managers`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
export function endBranchManager(
  id: string,
  assignmentId: string,
  payload: {
    effectiveTo: string;
    reason: string;
    revokeManagerScope?: boolean;
  },
) {
  return apiRequest(
    `/organization/branches/${id}/managers/${assignmentId}/end`,
    { method: "PATCH", body: JSON.stringify(payload) },
  );
}
export function setBranchDepartments(id: string, departmentIds: string[]) {
  return apiRequest(`/organization/branches/${id}/departments`, {
    method: "PUT",
    body: JSON.stringify({ departmentIds }),
  });
}
export function grantBranchScope(
  id: string,
  payload: { userId: string; roleCode: "MANAGER" },
) {
  return apiRequest(`/organization/branches/${id}/scopes`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
export function revokeBranchScope(id: string, scopeId: string, reason: string) {
  return apiRequest(`/organization/branches/${id}/scopes/${scopeId}`, {
    method: "DELETE",
    body: JSON.stringify({ reason }),
  });
}
export function getDepartments(filters: OrganizationFilters) {
  return apiRequest<{
    summary: {
      total: number;
      active: number;
      roots: number;
      withoutEmployees: number;
    };
    items: Department[];
    tree: Department[];
  }>(`/organization/departments?${query(filters)}`);
}
export function saveDepartment(
  payload: {
    code: string;
    name: string;
    parentId?: string | null;
    description?: string | null;
    isActive?: boolean;
    branchIds?: string[];
  },
  id?: string,
) {
  return apiRequest<Department>(
    id ? `/organization/departments/${id}` : "/organization/departments",
    { method: id ? "PATCH" : "POST", body: JSON.stringify(payload) },
  );
}
export function moveDepartment(id: string, parentId: string | null) {
  return apiRequest<Department>(`/organization/departments/${id}/move`, {
    method: "POST",
    body: JSON.stringify({ parentId }),
  });
}
export function changeDepartmentStatus(
  id: string,
  active: boolean,
  reason: string,
) {
  return apiRequest<Department>(
    `/organization/departments/${id}/${active ? "reactivate" : "deactivate"}`,
    { method: "POST", body: JSON.stringify({ reason }) },
  );
}
export function getPositions(filters: OrganizationFilters) {
  return apiRequest<{
    summary: {
      total: number;
      active: number;
      managers: number;
      unused: number;
    };
    items: Position[];
  }>(`/organization/positions?${query(filters)}`);
}
export function savePosition(
  payload: {
    code: string;
    name: string;
    description?: string | null;
    isManager: boolean;
    isActive?: boolean;
    departmentIds?: string[];
  },
  id?: string,
) {
  return apiRequest<Position>(
    id ? `/organization/positions/${id}` : "/organization/positions",
    { method: id ? "PATCH" : "POST", body: JSON.stringify(payload) },
  );
}
export function changePositionStatus(
  id: string,
  active: boolean,
  reason: string,
) {
  return apiRequest<Position>(
    `/organization/positions/${id}/${active ? "reactivate" : "deactivate"}`,
    { method: "POST", body: JSON.stringify({ reason }) },
  );
}
