import { apiRequest } from './api-client';

export type AuthRole = {
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
  roles: AuthRole[];
  permissions: string[];
};

export type LoginResponse = { accessToken: string; user: AuthUser };

export function login(email: string, password: string) {
  return apiRequest<LoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export function getCurrentUser() {
  return apiRequest<AuthUser>('/auth/me');
}
