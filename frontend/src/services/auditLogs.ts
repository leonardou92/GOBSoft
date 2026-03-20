import { getStoredToken, logout } from "@/services/auth";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

export interface AuditLog {
  id: number;
  userId: number | null;
  username: string | null;
  context: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  description: string | null;
  metadata?: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt: string;
}

export interface AuditLogPage {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number | null;
  items: AuditLog[];
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
        : "Error al comunicarse con el servicio de auditoría.";
    throw new Error(message);
  }

  return data as AuditLogPage;
}

export async function listAuditLogs(params: {
  page?: number;
  pageSize?: number;
  userId?: number;
  username?: string;
  context?: string;
  action?: string;
  startDate?: string;
  endDate?: string;
  withTotal?: boolean;
} = {}): Promise<AuditLogPage> {
  const url = new URL(`${API_BASE_URL}/api/audit/logs`);
  url.searchParams.set("page", String(params.page ?? 1));
  url.searchParams.set("pageSize", String(params.pageSize ?? 20));
  if (typeof params.userId === "number") {
    url.searchParams.set("userId", String(params.userId));
  }
  if (params.username && params.username.trim().length > 0) {
    url.searchParams.set("username", params.username.trim());
  }
  if (params.context && params.context.trim().length > 0) {
    url.searchParams.set("context", params.context.trim());
  }
  if (params.action && params.action.trim().length > 0) {
    url.searchParams.set("action", params.action.trim());
  }
  if (params.startDate) {
    url.searchParams.set("startDate", params.startDate);
  }
  if (params.endDate) {
    url.searchParams.set("endDate", params.endDate);
  }
  if (typeof params.withTotal === "boolean") {
    url.searchParams.set("withTotal", params.withTotal ? "true" : "false");
  }

  return authorizedFetch(url.toString());
}

export async function auditNavigationEvent(params: {
  path: string;
  fromPath?: string | null;
  description?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const token = getStoredToken();
  if (!token) return;

  const authHeader = token.startsWith("Bearer ") ? token : `Bearer ${token}`;

  try {
    await fetch(`${API_BASE_URL}/api/audit/navigation`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
      },
      body: JSON.stringify({
        path: params.path,
        fromPath: params.fromPath ?? undefined,
        description: params.description,
        metadata: params.metadata,
      }),
    });
  } catch {
    // Silenciar errores de auditoría para no interrumpir la navegación del usuario.
  }
}


