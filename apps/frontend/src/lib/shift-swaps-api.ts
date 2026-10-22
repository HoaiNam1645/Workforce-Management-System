import { apiRequest } from './api-client';

export type SwapAssignment = { id: string; employeeId: string; shift: { id: string; name: string; startsAt: string; endsAt: string; branch: { id: string; name: string } | null; department: { id: string; name: string } | null; position: { id: string; name: string } | null } };
export type SwapEmployee = { id: string; employeeCode: string; fullName: string; branch: string; department: string; position: string; assignments: SwapAssignment[] };
export type ShiftSwapRequest = {
  id: string; requestType: 'swap' | 'give_away'; status: string; reason: string | null; receiverNote: string | null; reviewNote: string | null;
  createdAt: string; expiresAt: string | null; requester: { id: string; employeeCode: string; fullName: string };
  targetEmployee: { id: string; employeeCode: string; fullName: string } | null; offeredAssignment: SwapAssignment; requestedAssignment: SwapAssignment | null;
  actions: { respond: boolean; cancel: boolean };
};

export const getShiftSwapOptions = () => apiRequest<{ assignments: SwapAssignment[]; employees: SwapEmployee[] }>('/schedules/shift-swaps/options');
export const getMyShiftSwaps = (status = 'all') => apiRequest<{ items: ShiftSwapRequest[] }>(`/schedules/shift-swaps/mine?status=${status}`);
export const getShiftSwapsForReview = (status = 'all') => apiRequest<{ items: ShiftSwapRequest[] }>(`/schedules/shift-swaps/review?status=${status}`);
export const createShiftSwap = (body: { requestType: 'swap' | 'give_away'; offeredAssignmentId: string; targetEmployeeId: string; requestedAssignmentId?: string | null; reason?: string }) => apiRequest<ShiftSwapRequest>('/schedules/shift-swaps', { method: 'POST', body: JSON.stringify(body) });
export const actOnShiftSwap = (id: string, action: 'accept' | 'decline' | 'approve' | 'reject' | 'cancel', note?: string) => apiRequest<{ id: string; status: string }>(`/schedules/shift-swaps/${id}/${action}`, { method: 'PATCH', body: JSON.stringify({ note }) });
export const getShiftSwapHistory = (id: string) => apiRequest<Array<{ id: string; action: string; fromStatus: string | null; toStatus: string; note: string | null; createdAt: string; actor: { displayName: string } | null }>>(`/schedules/shift-swaps/${id}/history`);
