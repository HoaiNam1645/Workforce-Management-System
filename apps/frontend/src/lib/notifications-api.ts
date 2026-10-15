import { apiRequest } from './api-client';

export type NotificationItem = { id: string; eventType: string; title: string; message: string; data: Record<string, unknown>; actionUrl: string | null; readAt: string | null; createdAt: string };

export function getNotifications() {
  return apiRequest<{ items: NotificationItem[]; unread: number }>('/notifications');
}

export function markNotificationRead(id: string) {
  return apiRequest<NotificationItem>(`/notifications/${id}/read`, { method: 'PATCH' });
}
