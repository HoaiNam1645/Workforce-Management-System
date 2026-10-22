import { apiRequest } from "./api-client";

export type DashboardData = {
  setup: {
    branches: number;
    departments: number;
    positions: number;
    employees: number;
    shiftTemplates: number;
    leaveTypes: number;
    draftTimesheets: number;
    approvedTimesheets: number;
    lockedTimesheets: number;
  };
  today: {
    shifts: number;
    required: number;
    assigned: number;
    working: number;
    missing: number;
    anomalies: number;
  };
  pending: { leaveRequests: number; timesheets: number };
  chart: Array<{ day: string; planned: number; actual: number }>;
};

export function getDashboard() {
  return apiRequest<DashboardData>("/organization/dashboard");
}
