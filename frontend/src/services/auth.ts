const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

export interface LoginResponse {
  token: string;
  tokenType: string;
  expiresIn: string;
  /**
   * Opcional: id del usuario autenticado, si el backend lo envía.
   */
  userId?: number;
  /**
   * Opcional: objeto usuario, si el backend lo incluye.
   */
  user?: {
    id?: number | string;
    firstName?: string;
    lastName?: string;
    [key: string]: unknown;
  };
}

export interface RefreshTokenResponse extends LoginResponse {
  user: {
    id: number;
    username: string;
    firstName: string;
    lastName: string;
    email: string;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
  };
}

export function parseExpiresInToMs(expiresIn: string | undefined): number {
  if (!expiresIn) return 15 * 60_000;

  const minutesMatch = expiresIn.match(/(\d+)\s*m/i);
  if (minutesMatch) {
    const minutes = parseInt(minutesMatch[1] ?? "0", 10);
    if (Number.isFinite(minutes) && minutes > 0) {
      return minutes * 60_000;
    }
  }

  const asNumber = Number(expiresIn);
  if (Number.isFinite(asNumber) && asNumber > 0) {
    return asNumber * 1000;
  }

  return 15 * 60_000;
}

export async function login(username: string, password: string): Promise<LoginResponse> {
  const res = await fetch(`${API_BASE_URL}/api/auth/login-token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ username, password }),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const message =
      typeof data?.message === "string" && data.message.trim().length > 0
        ? data.message
        : "Error al iniciar sesión. Verifica tus credenciales.";
    throw new Error(message);
  }

  return data as LoginResponse;
}

function getActiveStorageForToken(token: string): Storage {
  if (typeof window === "undefined") return window.localStorage;

  const prefixed = token.startsWith("Bearer ") ? token : `Bearer ${token}`;

  if (window.localStorage.getItem("auth_token") === prefixed) {
    return window.localStorage;
  }
  if (window.sessionStorage.getItem("auth_token") === prefixed) {
    return window.sessionStorage;
  }

  return window.localStorage;
}

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;

  const readFromStorage = (storage: Storage): string | null => {
    const token = storage.getItem("auth_token");
    if (!token) return null;
    return token;
  };

  const fromLocal = readFromStorage(window.localStorage);
  if (fromLocal) return fromLocal;

  const fromSession = readFromStorage(window.sessionStorage);
  if (fromSession) return fromSession;

  return null;
}

export async function refreshTokenIfNeeded(): Promise<string | null> {
  if (typeof window === "undefined") return null;

  const now = Date.now();

  const selectTokenAndStorage = (): { token: string; storage: Storage } | null => {
    const localToken = window.localStorage.getItem("auth_token");
    const sessionToken = window.sessionStorage.getItem("auth_token");

    if (!localToken && !sessionToken) return null;

    // Preferimos localStorage si existe; si no, sessionStorage
    const storage = localToken ? window.localStorage : window.sessionStorage;
    const token = localToken ?? (sessionToken as string);

    const expRaw = storage.getItem("auth_expires_at");
    if (!expRaw) {
      return { token, storage };
    }

    const exp = Number(expRaw);
    if (!Number.isFinite(exp)) {
      return { token, storage };
    }

    const timeLeft = exp - now;
    // Si faltan más de 120s, no refrescamos todavía
    if (timeLeft > 120_000) {
      return null;
    }

    return { token, storage };
  };

  const selection = selectTokenAndStorage();
  if (!selection) {
    return getStoredToken();
  }

  const { token, storage } = selection;

  try {
    const refreshed = await refreshToken(token, storage);
    return `${refreshed.tokenType} ${refreshed.token}`;
  } catch (error) {
    const anyError = error as { status?: number };
    if (anyError?.status === 401 || anyError?.status === 403) {
      logout();
      return null;
    }
    return getStoredToken();
  }
}

export function logout(): void {
  if (typeof window === "undefined") return;

  window.localStorage.removeItem("auth_token");
  window.localStorage.removeItem("auth_expires_at");
  window.localStorage.removeItem("auth_expires_in_ms");
  window.localStorage.removeItem("auth_username");
  window.localStorage.removeItem("auth_full_name");
  window.localStorage.removeItem("auth_user_id");
  window.sessionStorage.removeItem("auth_token");
  window.sessionStorage.removeItem("auth_expires_at");
  window.sessionStorage.removeItem("auth_expires_in_ms");
  window.sessionStorage.removeItem("auth_username");
  window.sessionStorage.removeItem("auth_full_name");
  window.sessionStorage.removeItem("auth_user_id");
}

export function getStoredUserId(): number | null {
  if (typeof window === "undefined") return null;

  const readFromStorage = (storage: Storage): number | null => {
    const raw = storage.getItem("auth_user_id");
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  };

  const fromLocal = readFromStorage(window.localStorage);
  if (fromLocal !== null) return fromLocal;

  const fromSession = readFromStorage(window.sessionStorage);
  if (fromSession !== null) return fromSession;

  return null;
}

export async function logoutApi(): Promise<void> {
  const token = getStoredToken();
  if (!token) return;

  const authHeader = token.startsWith("Bearer ") ? token : `Bearer ${token}`;

  try {
    await fetch(`${API_BASE_URL}/api/auth/logout`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
      },
    });
  } catch {
  }
}

export async function refreshToken(
  currentToken: string,
  storage?: Storage,
): Promise<RefreshTokenResponse> {
  const authHeader = currentToken.startsWith("Bearer ")
    ? currentToken
    : `Bearer ${currentToken}`;

  const res = await fetch(`${API_BASE_URL}/api/auth/refresh-token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader,
    },
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const message =
      typeof data?.message === "string" && data.message.trim().length > 0
        ? data.message
        : "No fue posible refrescar la sesión.";
    const error = new Error(message) as Error & { status?: number };
    error.status = res.status;
    throw error;
  }

  const fullToken = `${data.tokenType} ${data.token}`;
  const ttlMs = parseExpiresInToMs(data.expiresIn);
  const now = Date.now();
  const expiresAt = now + ttlMs;

  const targetStorage =
    storage ??
    (typeof window !== "undefined" ? window.localStorage : (undefined as unknown as Storage));

  targetStorage.setItem("auth_token", fullToken);
  targetStorage.setItem("auth_expires_at", String(expiresAt));
  targetStorage.setItem("auth_expires_in_ms", String(ttlMs));

  if (data?.user?.id != null) {
    targetStorage.setItem("auth_user_id", String(data.user.id));
  }
  const fullName = `${data?.user?.firstName ?? ""} ${data?.user?.lastName ?? ""}`.trim();
  if (fullName.length > 0) {
    targetStorage.setItem("auth_full_name", fullName);
  }

  return data as RefreshTokenResponse;
}

