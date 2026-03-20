import { getStoredToken, logout } from "@/services/auth";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

export interface UserRole {
  id: number;
  name: string;
  description?: string | null;
}

export interface User {
  id: number;
  username: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  role?: UserRole | null;
}

export interface UsersPageResponse {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  items: User[];
}

export interface CreateUserBody {
  username: string;
  password: string;
  firstName?: string;
  lastName?: string;
  email?: string;
}

export interface UpdateUserBody {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  isActive?: boolean;
  password?: string;
  roleId?: number | null;
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
        : "Error al comunicarse con el servicio de usuarios.";
    throw new Error(message);
  }

  return data;
}

/**
 * Crea un usuario (no requiere JWT).
 * Usa POST /api/auth/register según documentación.
 */
export async function createUser(body: CreateUserBody): Promise<User> {
  const url = `${API_BASE_URL}/api/auth/register`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      typeof data?.message === "string" && data.message.trim().length > 0
        ? data.message
        : "Error creando usuario.";
    throw new Error(message);
  }
  return data as User;
}

/**
 * Lista paginada de usuarios (requiere JWT).
 */
export async function listUsers(page = 1, pageSize = 20): Promise<UsersPageResponse> {
  const url = new URL(`${API_BASE_URL}/api/users`);
  url.searchParams.set("page", String(page));
  url.searchParams.set("pageSize", String(pageSize));
  const data = await authorizedFetch(url.toString(), { method: "GET" });
  return data as UsersPageResponse;
}

export async function getUser(id: number): Promise<User> {
  const url = `${API_BASE_URL}/api/users/${id}`;
  const data = await authorizedFetch(url, { method: "GET" });
  return data as User;
}

export async function updateUser(id: number, body: UpdateUserBody): Promise<User> {
  const url = `${API_BASE_URL}/api/users/${id}`;
  const data = await authorizedFetch(url, {
    method: "PUT",
    body: JSON.stringify(body),
  });
  return data as User;
}

export async function deleteUser(id: number): Promise<void> {
  const url = `${API_BASE_URL}/api/users/${id}`;
  await authorizedFetch(url, { method: "DELETE" });
}

