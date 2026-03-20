import { getStoredToken, logout } from "@/services/auth";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

export interface DashboardHeartbeatResponse {
  watermark: string | null;
  lastTransactionsUpdateAt: string | null;
  lastErrorLogsUpdateAt: string | null;
  updated: boolean;
  recentTx: Array<{
    id: number;
    movementDate: string;
    transactionTypeLabel: string | null;
    type: string;
    amount: number;
    balanceDelta: string;
    accountNumber: string;
  }>;
  todayTxCount: number;
  yesterdayTxCount: number;
  txStats: {
    p2pCount: number;
    c2pCount: number;
    vposCount: number;
    immediateCreditCount: number;
  };
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
        : "Error al comunicarse con el servicio de dashboard.";
    throw new Error(message);
  }

  return data as DashboardHeartbeatResponse;
}

export async function getDashboardHeartbeat(params?: {
  startDate?: string;
  endDate?: string;
  recentPageSize?: number;
  since?: string;
}): Promise<DashboardHeartbeatResponse> {
  const url = new URL(`${API_BASE_URL}/api/dashboard/heartbeat`);
  if ((params?.startDate && !params?.endDate) || (!params?.startDate && params?.endDate)) {
    throw new Error("Si envías startDate, también debes enviar endDate.");
  }
  if (params?.startDate && params?.endDate) {
    url.searchParams.set("startDate", params.startDate);
    url.searchParams.set("endDate", params.endDate);
  }
  if (
    typeof params?.recentPageSize === "number" &&
    Number.isFinite(params.recentPageSize) &&
    params.recentPageSize >= 1 &&
    params.recentPageSize <= 200
  ) {
    url.searchParams.set("recentPageSize", String(params.recentPageSize));
  }
  if (params?.since && params.since.trim().length > 0) {
    url.searchParams.set("since", params.since.trim());
  }
  return authorizedFetch(url.toString(), { method: "GET" });
}

