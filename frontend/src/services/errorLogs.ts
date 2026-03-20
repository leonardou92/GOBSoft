import { getStoredToken, logout } from "@/services/auth";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

export interface ApiErrorLog {
  id: number;
  context: string;
  message: string;
  name?: string | null;
  stack?: string | null;
  extra?: unknown;
  createdAt: string;
}

export interface ApiErrorLogPage {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  items: ApiErrorLog[];
}

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
    if (res.status === 401) {
      logout();
      if (typeof window !== "undefined") {
        window.location.href = "/login";
      }
      throw new Error("Sesión expirada. Por favor inicia sesión nuevamente.");
    }

    const message =
      typeof (data as any)?.message === "string" && (data as any).message.trim().length > 0
        ? (data as any).message
        : "Error al comunicarse con el servicio de logs de API.";
    throw new Error(message);
  }

  return data;
}

export async function listApiErrorLogs(params: {
  page?: number;
  pageSize?: number;
  context?: string;
} = {}): Promise<ApiErrorLogPage> {
  const url = new URL(`${API_BASE_URL}/api/error-logs`);
  url.searchParams.set("page", String(params.page ?? 1));
  url.searchParams.set("pageSize", String(params.pageSize ?? 20));
  if (params.context && params.context.trim().length > 0) {
    url.searchParams.set("context", params.context.trim());
  }
  return authorizedFetch(url.toString());
}

export async function getApiErrorLog(id: number): Promise<ApiErrorLog> {
  return authorizedFetch(`${API_BASE_URL}/api/error-logs/${id}`, {
    method: "GET",
  });
}

