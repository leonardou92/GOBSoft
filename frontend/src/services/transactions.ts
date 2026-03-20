import { getStoredToken, logout } from "@/services/auth";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

/**
 * Tabla en BD: banktransaction (MySQL / Prisma).
 * Las transacciones se guardan al sincronizar con el BNC:
 *   POST /api/account/history-by-date-sync
 *   Body: { accountNumber, startDate, endDate, workingKey }
 *
 * Esquema real:
 *
 *   CREATE TABLE `banktransaction` (
 *     `id` int(11) NOT NULL AUTO_INCREMENT,
 *     `bankAccountId` int(11) NOT NULL,
 *     `accountNumber` varchar(191) NOT NULL,
 *     `movementDate` datetime(3) NOT NULL,
 *     `controlNumber` varchar(191) NOT NULL,
 *     `amount` double NOT NULL,
 *     `code` varchar(191) NOT NULL,
 *     `bankCode` varchar(191) NOT NULL,
 *     `debtorInstrument` varchar(191) DEFAULT NULL,
 *     `concept` varchar(191) NOT NULL,
 *     `type` varchar(191) NOT NULL,
 *     `balanceDelta` varchar(191) NOT NULL,
 *     `referenceA` varchar(191) DEFAULT NULL,
 *     `referenceB` varchar(191) DEFAULT NULL,
 *     `referenceC` varchar(191) DEFAULT NULL,
 *     `referenceD` varchar(191) DEFAULT NULL,
 *     `createdAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
 *     `updatedAt` datetime(3) NOT NULL,
 *     `kind` enum('TRF','DEP','P2P') NOT NULL DEFAULT 'TRF',
 *     `operationType` varchar(191) DEFAULT NULL,
 *     `transactionTypeCode` int(11) DEFAULT NULL,
 *     `transactionTypeLabel` varchar(191) DEFAULT NULL,
 *     PRIMARY KEY (`id`),
 *     UNIQUE KEY `BankTransaction_bankAccountId_referenceA_amount_movementDate_key` (...),
 *     KEY `BankTransaction_bankAccountId_idx` (`bankAccountId`),
 *     CONSTRAINT `BankTransaction_bankAccountId_fkey` FOREIGN KEY (`bankAccountId`) REFERENCES `bankaccount` (`id`)
 *   );
 */

/**
 * Campos de cada ítem de GET /api/transactions (mapeo 1:1 con tabla banktransaction).
 */
export interface TransactionItem {
  id?: number;
  bankAccountId?: number;
  accountNumber?: string;
  movementDate?: string;
  controlNumber?: string;
  amount?: number;
  code?: string;
  bankCode?: string;
  debtorInstrument?: string | null;
  concept?: string;
  type?: string;
  balanceDelta?: string;
  referenceA?: string | null;
  referenceB?: string | null;
  referenceC?: string | null;
  referenceD?: string | null;
  createdAt?: string;
  updatedAt?: string;
  kind?: "TRF" | "DEP" | "P2P";
  operationType?: string | null;
  transactionTypeCode?: number | null;
  transactionTypeLabel?: string | null;
  /**
   * Usuario asociado en TransactionLog (puede venir null si no hay match).
   */
  user?: {
    id?: number;
    username?: string;
    firstName?: string;
    lastName?: string;
    email?: string;
  } | null;
}

export interface TransactionsPage {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  items: TransactionItem[];
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
        : "Error al comunicarse con el servicio de transacciones.";
    throw new Error(message);
  }

  return data as TransactionsPage;
}

export async function hasTransactionsForAccount(accountNumber: string, clientId?: string): Promise<boolean> {
  const url = new URL(`${API_BASE_URL}/api/transactions`);
  url.searchParams.set("page", "1");
  url.searchParams.set("pageSize", "1");
  url.searchParams.set("accountNumber", accountNumber);
  if (clientId) {
    url.searchParams.set("clientId", clientId);
  }

  const data = await authorizedFetch(url.toString());
  return typeof data.total === "number" && data.total > 0;
}

/** Valores permitidos para filtrar por tipo lógico (operationType). */
export const OPERATION_TYPES = [
  "CARGO",
  "P2PTSP",
  "CIOPPS",
  "CIPOTR",
  "CIORPS",
  "ABONO",
  "CIOCCS",
] as const;
export type OperationType = (typeof OPERATION_TYPES)[number];

export async function listTransactions(params: {
  page?: number;
  pageSize?: number;
  accountNumber?: string;
  clientId?: string;
  operationType?: string;
  startDate?: string;
  endDate?: string;
  withTotal?: boolean;
} = {}): Promise<TransactionsPage> {
  const url = new URL(`${API_BASE_URL}/api/transactions`);
  url.searchParams.set("page", String(params.page ?? 1));
  url.searchParams.set("pageSize", String(params.pageSize ?? 20));
  if (params.accountNumber) {
    url.searchParams.set("accountNumber", params.accountNumber);
  }
  if (params.clientId) {
    url.searchParams.set("clientId", params.clientId);
  }
  if (params.operationType) {
    url.searchParams.set("operationType", params.operationType);
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


