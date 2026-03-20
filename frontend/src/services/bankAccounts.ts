import { getStoredToken, logout } from "@/services/auth";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

export interface BankAccount {
  id: number;
  clientId: string;
  accountNumber: string;
  alias?: string | null;
  bankCode: number;
  bankId?: number | null;
  mobPaymentPhone?: string | null;
  currency?: "VES" | "USD" | "EUR";
  isActive: boolean;
  hasTransactions?: boolean;
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
      typeof data?.message === "string" && data.message.trim().length > 0
        ? data.message
        : "Error al comunicarse con el servicio de cuentas bancarias.";
    throw new Error(message);
  }

  return data;
}

export async function listBankAccounts(clientId?: string): Promise<BankAccount[]> {
  const url = new URL(`${API_BASE_URL}/api/bank-accounts`);
  if (clientId) {
    url.searchParams.set("clientId", clientId);
  }

  return authorizedFetch(url.toString());
}

interface CreateBankAccountInput {
  clientId: string;
  accountNumber: string;
  alias?: string;
  bankCode: number;
  mobPaymentPhone?: string;
  currency?: "VES" | "USD" | "EUR";
  isActive?: boolean;
}

export async function createBankAccount(input: CreateBankAccountInput): Promise<BankAccount> {
  return authorizedFetch(`${API_BASE_URL}/api/bank-accounts`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function getBankAccount(id: number): Promise<BankAccount> {
  return authorizedFetch(`${API_BASE_URL}/api/bank-accounts/${id}`, {
    method: "GET",
  });
}

type UpdateBankAccountInput = Partial<CreateBankAccountInput> & {
  clientId?: string;
};

export async function updateBankAccount(id: number, input: UpdateBankAccountInput): Promise<BankAccount> {
  return authorizedFetch(`${API_BASE_URL}/api/bank-accounts/${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export async function deleteBankAccount(id: number): Promise<void> {
  await authorizedFetch(`${API_BASE_URL}/api/bank-accounts/${id}`, {
    method: "DELETE",
  });
}

