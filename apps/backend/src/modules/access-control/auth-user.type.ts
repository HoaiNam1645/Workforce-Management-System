export type AuthRoleAssignment = {
  roleId: string;
  code: string;
  branchId: string | null;
  departmentId: string | null;
};

export type AuthUser = {
  id: string;
  email: string;
  displayName: string;
  employeeId: string | null;
  roles: AuthRoleAssignment[];
  permissions: string[];
};
