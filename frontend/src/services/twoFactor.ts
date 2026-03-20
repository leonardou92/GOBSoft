import { getStoredToken } from "@/services/auth";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

async function authorizedFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const token = getStoredToken();
  if (!token) {
    throw new Error("No hay sesión activa. Por favor inicia sesión nuevamente.");
  }

  const authHeader = token.startsWith("Bearer ") ? token : `Bearer ${token}`;

  const res = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {}),
      Authorization: authHeader,
    },
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    // Para endpoints de 2FA, un 401 puede significar código TOTP inválido.
    // No cerramos la sesión aquí; solo propagamos el mensaje del backend.
    const message =
      typeof data?.message === "string" && data.message.trim().length > 0
        ? data.message
        : "Error al procesar la operación 2FA.";
    throw new Error(message);
  }

  return data as any;
}

export interface TwoFactorSetupResponse {
  message: string;
  otpAuthUrl: string;
  qrCodeDataUrl: string;
  manualEntryKey: string;
}

export interface TwoFactorVerifyResponse {
  message: string;
  twoFactorEnabled?: boolean;
}

export interface TwoFactorStatus {
  enabled: boolean;
  hasSecret: boolean;
  configured: boolean;
  enabledAt?: string | null;
}

export async function setupTwoFactor(): Promise<TwoFactorSetupResponse> {
  const url = `${API_BASE_URL}/api/auth/2fa/setup`;
  return authorizedFetch(url, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function verifyTwoFactorSetup(code: string): Promise<TwoFactorVerifyResponse> {
  const normalizedCode = code.trim();
  if (!/^\d{6}$/.test(normalizedCode)) {
    throw new Error("El código de verificación debe tener 6 dígitos.");
  }

  const url = `${API_BASE_URL}/api/auth/2fa/verify-setup`;
  return authorizedFetch(url, {
    method: "POST",
    body: JSON.stringify({ code: normalizedCode }),
  });
}

export async function disableTwoFactor(code: string): Promise<TwoFactorVerifyResponse> {
  const normalizedCode = code.trim();
  if (!/^\d{6}$/.test(normalizedCode)) {
    throw new Error("El código de verificación debe tener 6 dígitos.");
  }

  const url = `${API_BASE_URL}/api/auth/2fa/disable`;
  return authorizedFetch(url, {
    method: "POST",
    body: JSON.stringify({ code: normalizedCode }),
  });
}

export async function getTwoFactorStatus(): Promise<TwoFactorStatus> {
  const url = `${API_BASE_URL}/api/auth/2fa/status`;
  const data = await authorizedFetch(url, {
    method: "GET",
  });
  return {
    enabled: Boolean(data.enabled),
    hasSecret: Boolean(data.hasSecret),
    configured: Boolean(data.configured),
    enabledAt: typeof data.enabledAt === "string" ? data.enabledAt : null,
  };
}

export async function deleteTwoFactorConfig(): Promise<{ message: string }> {
  const url = `${API_BASE_URL}/api/auth/2fa`;
  return authorizedFetch(url, {
    method: "DELETE",
  });
}


