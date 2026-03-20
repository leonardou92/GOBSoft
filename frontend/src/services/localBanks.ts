import { getStoredToken, logout } from "@/services/auth";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

export interface LocalBank {
  id: number;
  code: number;
  name: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
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
        : "Error al comunicarse con el servicio de bancos.";
    throw new Error(message);
  }

  return data;
}

export async function listLocalBanks(params?: { isActive?: "all" }): Promise<LocalBank[]> {
  const url = new URL(`${API_BASE_URL}/api/banks`);
  if (params?.isActive === "all") {
    url.searchParams.set("isActive", "all");
  }
  return authorizedFetch(url.toString(), { method: "GET" });
}

export async function getLocalBank(id: number): Promise<LocalBank> {
  return authorizedFetch(`${API_BASE_URL}/api/banks/${id}`, { method: "GET" });
}

export async function createLocalBank(input: {
  code: number;
  name: string;
  isActive?: boolean;
}): Promise<LocalBank> {
  return authorizedFetch(`${API_BASE_URL}/api/banks`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateLocalBank(
  id: number,
  input: Partial<{ code: number; name: string; isActive: boolean }>,
): Promise<LocalBank> {
  return authorizedFetch(`${API_BASE_URL}/api/banks/${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export async function deleteLocalBank(id: number): Promise<void> {
  await authorizedFetch(`${API_BASE_URL}/api/banks/${id}`, { method: "DELETE" });
}

