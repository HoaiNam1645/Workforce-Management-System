import { apiRequest } from './api-client';

export type PermissionItem = {
  id: string;
  code: string;
  module: string;
  action: string;
  description: string | null;
};

export type RoleMatrixItem = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  locked: boolean;
  memberCount: number;
  permissionIds: string[];
};

export type PermissionMatrix = { roles: RoleMatrixItem[]; permissions: PermissionItem[] };

export function getPermissionMatrix() {
  return apiRequest<PermissionMatrix>('/access-control/matrix');
}

export function updateRolePermissions(roleId: string, permissionIds: string[]) {
  return apiRequest<PermissionMatrix>(`/access-control/roles/${roleId}/permissions`, {
    method: 'PUT',
    body: JSON.stringify({ permissionIds }),
  });
}
