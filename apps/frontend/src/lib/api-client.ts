export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api').replace(/\/$/, '');
export const AUTH_TOKEN_KEY = 'workforce_access_token';

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export function getAccessToken() {
  return typeof window === 'undefined' ? null : window.localStorage.getItem(AUTH_TOKEN_KEY);
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAccessToken();
  const headers = new Headers(init?.headers);
  if (!(init?.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers,
  });
  const body = await response.json().catch(() => null) as { message?: string | string[] } | T | null;
  if (!response.ok) {
    const rawMessage = body && typeof body === 'object' && 'message' in body ? body.message : null;
    const message = Array.isArray(rawMessage) ? rawMessage.join(', ') : rawMessage;
    if (response.status === 401 && typeof window !== 'undefined') {
      window.dispatchEvent(new Event('workforce:unauthorized'));
    }
    throw new ApiError(message || 'Không thể kết nối tới máy chủ', response.status);
  }
  return body as T;
}

export async function apiBlob(path: string): Promise<Blob> {
  const token = getAccessToken();
  const response = await fetch(`${API_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!response.ok) throw new ApiError('Không thể tải ảnh selfie', response.status);
  return response.blob();
}
