import { useAuthStore } from '@/stores/auth-store';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public payload: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface ApiOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  // Skip the 401 → refresh → retry cycle (used internally by /auth/refresh).
  skipRefresh?: boolean;
}

// Single in-flight refresh promise so 5 concurrent 401s only fire one refresh.
let refreshInFlight: Promise<string | null> | null = null;

async function performRefresh(): Promise<string | null> {
  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { accessToken: string };

    const current = useAuthStore.getState();
    if (current.user) {
      useAuthStore
        .getState()
        .setAuth({ accessToken: data.accessToken, user: current.user, profile: current.profile });
    } else {
      // Refresh succeeded but we don't have user state — caller will fetch /me.
      useAuthStore.setState({ accessToken: data.accessToken });
    }
    return data.accessToken;
  } catch {
    return null;
  }
}

function getRefresh() {
  if (!refreshInFlight) {
    refreshInFlight = performRefresh().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

export async function api<T>(path: string, opts: ApiOptions = {}): Promise<T> {
  const { body, headers, skipRefresh, ...rest } = opts;

  const doFetch = async (token: string | null) => {
    const finalHeaders = new Headers(headers);
    if (body !== undefined && !finalHeaders.has('Content-Type')) {
      finalHeaders.set('Content-Type', 'application/json');
    }
    if (token) finalHeaders.set('Authorization', `Bearer ${token}`);

    return fetch(`${API_URL}${path}`, {
      ...rest,
      credentials: 'include',
      headers: finalHeaders,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  };

  let res = await doFetch(useAuthStore.getState().accessToken);

  if (res.status === 401 && !skipRefresh) {
    const newToken = await getRefresh();
    if (newToken) res = await doFetch(newToken);
  }

  if (!res.ok) {
    let payload: unknown = null;
    try {
      payload = await res.json();
    } catch {
      payload = await res.text().catch(() => null);
    }
    const message =
      (payload &&
        typeof payload === 'object' &&
        'error' in payload &&
        (payload as { error?: { message?: string } }).error?.message) ||
      `HTTP ${res.status}`;
    throw new ApiError(res.status, message as string, payload);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
