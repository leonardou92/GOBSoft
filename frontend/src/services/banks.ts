import { getStoredToken, logout } from "@/services/auth";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

export interface BankItem {
  Name: string;
  Code: string;
  Services: string;
}

export interface BanksResponse {
  message: string;
  rawResponse: BankItem[];
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
        : "Error al consultar la lista de bancos en el BNC.";
    throw new Error(message);
  }

  return data as BanksResponse;
}

/**
 * Obtiene la lista de bancos disponibles desde el backend local (/api/services/banks),
 * que a su vez hace proxy al endpoint de Soluciones en Línea del BNC.
 */
export async function listBanks(): Promise<BankItem[]> {
  const url = `${API_BASE_URL}/api/services/banks`;
  const data = await authorizedFetch(url, {
    method: "POST",
    body: JSON.stringify({}),
  });
  return data.rawResponse ?? [];
}

