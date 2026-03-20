import { getStoredToken, logout } from "@/services/auth";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";
const BASE_URL = `${API_BASE_URL}/api/bank-integrations`;

export type BankIntegrationProvider = "BNC" | "BDV";
export type BankIntegrationEnvironment = "SANDBOX" | "PRODUCTION";
// Servicios lógicos visibles en el frontend
export type BankIntegrationService = "QUERIES" | "VPOS" | "C2P";

export interface BankIntegrationBank {
  id: number;
  code: number;
  name: string;
}

export interface BankIntegrationConfig {
  id: number;
  bankId: number;
  bank?: BankIntegrationBank;
  provider: BankIntegrationProvider;
  environment: BankIntegrationEnvironment;
  services: BankIntegrationService[];
  urlBase: string | null;
  clientGuid: string | null;
  masterKey: string | null;
  clientId: string | null;
  affiliationNumber: string | null;
  terminalId: string | null;
  secret: string | null;
  apiKey: string | null;
  token: string | null;
  extra: unknown | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type BankIntegrationCreateDto = Omit<
  BankIntegrationConfig,
  "id" | "bank" | "createdAt" | "updatedAt"
> & {
  // En el backend se acepta string que se convierte a number
  bankId: number | string;
};

export type BankIntegrationUpdateDto = Partial<BankIntegrationCreateDto>;

export interface BankWizardRequest {
  bank: {
    code: number | string;
    name: string;
    isActive?: boolean;
  };
  integration: {
    environment: BankIntegrationEnvironment;
    services: BankIntegrationService[] | BankIntegrationService;
    urlBase?: string | null;
    clientGuid?: string | null;
    masterKey?: string | null;
    clientId?: string | null;
    affiliationNumber?: string | null;
    terminalId?: string | null;
    secret?: string | null;
    apiKey?: string | null;
    token?: string | null;
    extra?: unknown | null;
    isActive?: boolean;
  };
}

export interface BankWizardResponse {
  bank: {
    id: number;
    code: number;
    name: string;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
  };
  integration: BankIntegrationConfig;
}

interface ListParams {
  bankId?: number;
  provider?: BankIntegrationProvider;
  environment?: BankIntegrationEnvironment;
  service?: BankIntegrationService;
  isActive?: "true" | "false" | "all";
}

export function getRequiredFields(
  provider: BankIntegrationProvider,
  services: BankIntegrationService[],
): string[] {
  const base = new Set<string>();

  if (provider === "BNC") {
    // BNC: siempre requiere URL base y credenciales principales
    base.add("urlBase");
    base.add("clientGuid");
    base.add("masterKey");
    // Para BNC, clientId siempre requerido
    base.add("clientId");
    if (services.includes("VPOS")) {
      base.add("affiliationNumber");
    }
    if (services.includes("C2P")) {
      base.add("terminalId");
    }
  }

  if (provider === "BDV") {
    const hasQueries = services.includes("QUERIES");
    const hasPasarela = services.includes("VPOS") || services.includes("C2P");

    // Consultas BDV: URL base + token
    if (hasQueries) {
      base.add("urlBase");
      base.add("token");
    }

    // Pasarela BDV (VPOS/C2P): secret + apiKey
    if (hasPasarela) {
      base.add("secret");
      base.add("apiKey");
    }
  }

  return Array.from(base);
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
        : "Error al comunicarse con el servicio de integraciones bancarias.";
    throw new Error(message);
  }

  return data;
}

export async function listBankIntegrations(params: ListParams = {}): Promise<BankIntegrationConfig[]> {
  const url = new URL(BASE_URL);
  if (params.bankId != null) url.searchParams.set("bankId", String(params.bankId));
  if (params.provider) url.searchParams.set("provider", params.provider);
  if (params.environment) url.searchParams.set("environment", params.environment);
  if (params.service) url.searchParams.set("service", params.service);
  if (params.isActive) url.searchParams.set("isActive", params.isActive);
  return authorizedFetch(url.toString(), { method: "GET" });
}

export async function createBankIntegration(
  input: BankIntegrationCreateDto,
): Promise<BankIntegrationConfig> {
  const result = await authorizedFetch(BASE_URL, {
    method: "POST",
    body: JSON.stringify(input),
  });

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("bank-integrations-updated"));
  }

  return result as BankIntegrationConfig;
}

export async function updateBankIntegration(
  id: number,
  input: BankIntegrationUpdateDto,
): Promise<BankIntegrationConfig> {
  const result = await authorizedFetch(`${BASE_URL}/${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("bank-integrations-updated"));
  }

  return result as BankIntegrationConfig;
}

export async function deleteBankIntegration(id: number): Promise<void> {
  await authorizedFetch(`${BASE_URL}/${id}`, { method: "DELETE" });

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("bank-integrations-updated"));
  }
}

export async function saveBankIntegrationWizard(
  input: BankWizardRequest,
): Promise<BankWizardResponse> {
  const result = await authorizedFetch(`${BASE_URL}/wizard`, {
    method: "POST",
    body: JSON.stringify(input),
  });

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("bank-integrations-updated"));
  }

  return result as BankWizardResponse;
}

