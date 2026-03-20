import { getStoredToken, logout } from "@/services/auth";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

export interface Associate {
  id: number;
  childClientId: string;
  name: string;
  description?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AssociatesPage {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  items: Associate[];
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
        : "Error al comunicarse con el servicio de asociados.";
    throw new Error(message);
  }

  return data;
}

export async function listAssociates(params: {
  page?: number;
  pageSize?: number;
  isActive?: boolean;
} = {}): Promise<AssociatesPage> {
  const url = new URL(`${API_BASE_URL}/api/associates`);
  url.searchParams.set("page", String(params.page ?? 1));
  url.searchParams.set("pageSize", String(params.pageSize ?? 20));
  if (typeof params.isActive === "boolean") {
    url.searchParams.set("isActive", String(params.isActive));
  }
  return authorizedFetch(url.toString());
}

export async function getAssociate(id: number): Promise<Associate> {
  return authorizedFetch(`${API_BASE_URL}/api/associates/${id}`, {
    method: "GET",
  });
}

export async function createAssociate(input: {
  childClientId: string;
  name: string;
  description?: string;
}): Promise<Associate> {
  return authorizedFetch(`${API_BASE_URL}/api/associates`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateAssociate(
  id: number,
  input: {
    name?: string;
    description?: string;
    isActive?: boolean;
  },
): Promise<Associate> {
  return authorizedFetch(`${API_BASE_URL}/api/associates/${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export async function deleteAssociate(id: number): Promise<void> {
  await authorizedFetch(`${API_BASE_URL}/api/associates/${id}`, {
    method: "DELETE",
  });
}

export interface AssociateDetailSimpleResponse {
  message: string;
  existsInBnc: boolean;
  child?: {
    ChildName: string;
    ChildID: string;
    ClientNumber: string;
    CreateDate: string;
    UpdateDate: string;
    AccountNumber: string;
    Phone: string;
    Affiliation: string;
    Terminal: string;
    IsActive: boolean;
    Branches: unknown[];
  };
}

export async function associateDetailSimple(params: {
  childClientId: string;
}): Promise<AssociateDetailSimpleResponse> {
  return authorizedFetch(`${API_BASE_URL}/api/associates/detail-simple`, {
    method: "POST",
    body: JSON.stringify({ childClientId: params.childClientId }),
  });
}

export interface AssociateDisableSimpleResponse {
  message: string;
  rawResponse?: {
    status?: string;
    message?: string;
    [key: string]: unknown;
  };
}

export async function associateDisableSimple(params: {
  childClientId: string;
}): Promise<AssociateDisableSimpleResponse> {
  return authorizedFetch(`${API_BASE_URL}/api/associates/disable-simple`, {
    method: "POST",
    body: JSON.stringify({ childClientId: params.childClientId }),
  });
}

