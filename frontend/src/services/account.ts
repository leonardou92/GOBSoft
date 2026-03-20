import { getStoredToken, logout } from "@/services/auth";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

export interface LoginSimpleResponse {
  message: string;
  rawResponse: unknown;
  decrypted?: Record<string, unknown>;
}

export interface HistoryByDateSyncParams {
  accountNumber: string;
  startDate: string;
  endDate: string;
  workingKey: string;
  childClientId?: string;
  branchId?: string;
}

export interface HistoryByDateSyncResponse {
  message: string;
  syncedCount: number;
  totalFromBnc: number;
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
    const messageRaw =
      typeof data?.message === "string" && data.message.trim().length > 0
        ? data.message
        : "Error al comunicarse con el servicio de cuentas.";

    // Si el backend responde 401 pero el mensaje está relacionado con 2FA / TOTP,
    // no cerramos la sesión: solo propagamos el error para que la UI lo muestre.
    const lower = typeof messageRaw === "string" ? messageRaw.toLowerCase() : "";
    const isTwoFactorError =
      lower.includes("2fa") ||
      lower.includes("autenticador") ||
      lower.includes("totp") ||
      lower.includes("código") ||
      lower.includes("codigo");

    if (res.status === 401 && !isTwoFactorError) {
      logout();
      if (typeof window !== "undefined") {
        window.location.href = "/login";
      }
      throw new Error("Sesión expirada. Por favor inicia sesión nuevamente.");
    }

    throw new Error(messageRaw);
  }

  return data as any;
}

export interface BalanceSimpleParams {
  workingKey: string;
  clientId?: string;
  accountNumber?: string;
}

export interface BalanceSimpleResponse {
  message?: string;
  rawResponse?: unknown;
  decrypted?: Record<string, unknown> | null;
}

export async function balanceSimple(params: BalanceSimpleParams): Promise<BalanceSimpleResponse> {
  const url = `${API_BASE_URL}/api/account/balance-simple`;
  return authorizedFetch(url, {
    method: "POST",
    body: JSON.stringify({
      workingKey: params.workingKey,
      clientId: params.clientId ?? "",
      accountNumber: params.accountNumber ?? "",
    }),
  });
}

/**
 * Login simple contra el BNC. No requiere JWT.
 * El backend usa BNC_MASTER_KEY y devuelve en decrypted la workingKey para operaciones posteriores.
 */
export async function loginSimple(): Promise<LoginSimpleResponse> {
  const url = `${API_BASE_URL}/api/auth/login-simple`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      typeof data?.message === "string" && data.message.trim().length > 0
        ? data.message
        : "Error al conectar con el BNC (login-simple).";
    throw new Error(message);
  }
  return data as LoginSimpleResponse;
}

const WORKING_KEY_NAMES = [
  "workingKey",
  "WorkingKey",
  "working_key",
  "Value",
  "value",
  "Key",
  "key",
  "SessionKey",
  "sessionKey",
  "EncryptedKey",
  "encryptedKey",
];

function findWorkingKeyInObject(obj: unknown, depth = 0): string | null {
  if (depth > 5) return null;
  if (obj === null || obj === undefined) return null;
  if (typeof obj === "string" && obj.trim()) return obj.trim();
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const found = findWorkingKeyInObject(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof obj === "object") {
    const o = obj as Record<string, unknown>;
    for (const name of WORKING_KEY_NAMES) {
      if (Object.prototype.hasOwnProperty.call(o, name)) {
        const v = o[name];
        if (typeof v === "string" && v.trim()) return v.trim();
        const nested = findWorkingKeyInObject(v, depth + 1);
        if (nested) return nested;
      }
    }
    for (const key of Object.keys(o)) {
      const nested = findWorkingKeyInObject(o[key], depth + 1);
      if (nested) return nested;
    }
  }
  return null;
}

/**
 * Extrae la workingKey de la respuesta de login-simple.
 * Busca en toda la respuesta (decrypted, rawResponse, raíz) y en objetos anidados
 * cualquier propiedad con nombre workingKey, WorkingKey, Value, Key, etc.
 */
export function getWorkingKeyFromLoginResponse(response: LoginSimpleResponse): string {
  if (!response || typeof response !== "object") {
    throw new Error("No se obtuvo respuesta del BNC (login-simple).");
  }
  const r = response as Record<string, unknown>;
  const toSearch: unknown[] = [r.decrypted, r.rawResponse, r];
  if (r.decrypted && typeof r.decrypted === "object") {
    const d = r.decrypted as Record<string, unknown>;
    toSearch.push(d.Data, d.data, d.Result, d.result, d.Response, d.response);
  }
  for (const obj of toSearch) {
    const found = findWorkingKeyInObject(obj);
    if (found) return found;
  }
  throw new Error(
    "No se encontró workingKey en la respuesta del BNC (login-simple). Revisa que el backend devuelva decrypted.workingKey o decrypted.WorkingKey."
  );
}

/** @deprecated Usa getWorkingKeyFromLoginResponse(loginRes) pasando la respuesta completa. */
export function getWorkingKeyFromDecrypted(decrypted: Record<string, unknown> | undefined): string {
  return getWorkingKeyFromLoginResponse({ message: "", rawResponse: {}, decrypted });
}

// ---------------------------------------------------------------------------
// P2P simple (empresa paga a proveedores) - /api/account/p2p-simple
// ---------------------------------------------------------------------------

export interface P2pSimpleParams {
  amount: number;
  beneficiaryBankCode: number;
  beneficiaryCellPhone: string;
  beneficiaryEmail?: string;
  beneficiaryId: string;
  beneficiaryName: string;
  description: string;
  /**
   * Referencia única diaria para la operación. Si no se envía, el servicio puede generar una.
   */
  operationRef?: string;
  /**
   * Asociado (ChildClientID) opcional para escenarios multiempresa.
   */
  childClientId?: string;
  /**
   * Sucursal (BranchID) opcional asociada al ChildClientID.
   */
  branchId?: string;
  /**
   * Código TOTP de Google Authenticator (6 dígitos).
   */
  totpCode: string;
}

export interface P2pSimpleResponse {
  message: string;
  rawResponse?: unknown;
  decrypted?: {
    Reference?: string;
    Status?: string;
    Code?: string | null;
    Message?: string | null;
    [key: string]: unknown;
  };
}

/**
 * Ejecuta un Pago Móvil P2P simple (egreso de la empresa hacia un beneficiario).
 * Internamente:
 *  - Hace login-simple para obtener workingKey.
 *  - Llama a POST /api/account/p2p-simple con el payload esperado por el backend.
 */
export async function p2pSimple(params: P2pSimpleParams): Promise<P2pSimpleResponse> {
  const loginRes = await loginSimple();
  const workingKey = getWorkingKeyFromLoginResponse(loginRes);
  const normalizedTotpCode = params.totpCode.trim();

  if (!/^\d{6}$/.test(normalizedTotpCode)) {
    throw new Error("El código de verificación debe tener 6 dígitos.");
  }

  const opRef =
    params.operationRef && params.operationRef.trim().length > 0
      ? params.operationRef.trim()
      : `P2P-${Date.now()}`;

  const url = `${API_BASE_URL}/api/account/p2p-simple`;
  return authorizedFetch(url, {
    method: "POST",
    body: JSON.stringify({
      amount: params.amount,
      beneficiaryBankCode: params.beneficiaryBankCode,
      beneficiaryCellPhone: params.beneficiaryCellPhone,
      beneficiaryEmail: params.beneficiaryEmail ?? "",
      beneficiaryId: params.beneficiaryId,
      beneficiaryName: params.beneficiaryName,
      description: params.description,
      operationRef: opRef,
      workingKey,
      childClientId: params.childClientId ?? "",
      branchId: params.branchId ?? "",
      totpCode: normalizedTotpCode,
    }),
  });
}

// ---------------------------------------------------------------------------
// C2P simple (cliente paga a la empresa) - /api/account/c2p-simple
// ---------------------------------------------------------------------------

export interface C2pSimpleParams {
  amount: number;
  debtorBankCode: number;
  debtorCellPhone: string;
  debtorId: string;
  token: string;
  cardType?: number;
  childClientId?: string;
  branchId?: string;
}

export interface C2pSimpleResponse {
  message: string;
  rawResponse?: unknown;
  decrypted?: {
    IdTransaction?: number;
    Reference?: string;
    [key: string]: unknown;
  };
}

/**
 * Ejecuta un cobro C2P simple (cliente -> empresa).
 *  - Obtiene workingKey via login-simple.
 *  - Llama a POST /api/account/c2p-simple con el payload esperado.
 */
export async function c2pSimple(params: C2pSimpleParams): Promise<C2pSimpleResponse> {
  const loginRes = await loginSimple();
  const workingKey = getWorkingKeyFromLoginResponse(loginRes);

  const url = `${API_BASE_URL}/api/account/c2p-simple`;
  return authorizedFetch(url, {
    method: "POST",
    body: JSON.stringify({
      amount: params.amount,
      debtorBankCode: params.debtorBankCode,
      debtorCellPhone: params.debtorCellPhone,
      debtorId: params.debtorId,
      token: params.token,
      workingKey,
      cardType: params.cardType,
      childClientId: params.childClientId ?? "",
      branchId: params.branchId ?? "",
    }),
  });
}

// ---------------------------------------------------------------------------
// VPOS simple (pago con tarjeta) - /api/account/vpos-simple
// ---------------------------------------------------------------------------

export interface VposSimpleParams {
  amount: number;              // Amount
  cardHolderId: number;        // CardHolderID (solo números)
  cardHolderName: string;      // CardHolderName
  cardNumber: string;          // CardNumber
  cvv: number;                 // CVV (3 dígitos)
  expirationDate: number;      // MMyyyy (dtExpiration)
  accountType: number;         // AccountType (00,10,20)
  cardPin?: number | null;     // CardPIN opcional
  cardType?: number;           // idCardType (1 VISA, 2 MC, 3 Débito)
  transactionId: string;       // TransactionIdentifier
  operationRef?: string;       // OperationRef opcional
  childClientId?: string;      // ChildClientID opcional
  branchId?: string;           // BranchID opcional
  operationId?: number;        // OperationId opcional
}

export interface VposSimpleResponse {
  message: string;
  rawResponse?: {
    status?: string;
    message?: string;
    [key: string]: unknown;
  };
  decrypted?: {
    Reference?: number;
    Status?: string;
    Code?: string | null;
    Message?: string | null;
    [key: string]: unknown;
  };
}

/**
 * Ejecuta un pago VPOS simple contra el backend local, que a su vez llama al
 * endpoint de Soluciones en Línea del BNC.
 */
export async function vposSimple(params: VposSimpleParams): Promise<VposSimpleResponse> {
  const loginRes = await loginSimple();
  const workingKey = getWorkingKeyFromLoginResponse(loginRes);

  const url = `${API_BASE_URL}/api/account/vpos-simple`;
  return authorizedFetch(url, {
    method: "POST",
    body: JSON.stringify({
      accountType: params.accountType,
      amount: params.amount,
      cardHolderID: params.cardHolderId,
      cardHolderName: params.cardHolderName,
      cardNumber: params.cardNumber.replace(/\s+/g, ""),
      cvv: params.cvv,
      expirationDate: params.expirationDate,
      cardType: params.cardType,
      transactionID: params.transactionId,
      cardPIN: params.cardPin ?? null,
      operationRef: params.operationRef,
      childClientId: params.childClientId ?? "",
      branchId: params.branchId ?? "",
      operationId: params.operationId,
      workingKey,
    }),
  });
}

// ---------------------------------------------------------------------------
// Débito inmediato (SIMF) – token y cobro simple
// ---------------------------------------------------------------------------

export interface ImmediateDebitTokenParams {
  amount: number;
  debtorAccount: string;      // cuenta (20 dígitos) o teléfono (12) según debtorAccountType
  debtorAccountType: "CNTA" | "CELE";
  debtorBank: string;         // código banco, ej: "0191"
  debtorId: string;           // ej: "V012345678"
  childClientId?: string;
  branchId?: string;
}

export interface ImmediateDebitTokenResponse {
  message: string;
  rawResponse?: {
    status?: string;
    message?: string;
    [key: string]: unknown;
  };
  decrypted?: {
    Status?: string;
    Code?: string;
    [key: string]: unknown;
  };
}

/**
 * Wrapper de POST /api/immediate-debit/token-simple
 * Solicita/valida el token SIMF para un débito inmediato (no ejecuta el débito).
 */
export async function immediateDebitTokenSimple(
  params: ImmediateDebitTokenParams,
): Promise<ImmediateDebitTokenResponse> {
  const url = `${API_BASE_URL}/api/immediate-debit/token-simple`;
  return authorizedFetch(url, {
    method: "POST",
    body: JSON.stringify({
      amount: params.amount,
      debtorAccount: params.debtorAccount,
      debtorAccountType: params.debtorAccountType,
      debtorBank: params.debtorBank,
      debtorId: params.debtorId,
      childClientId: params.childClientId ?? "",
      branchId: params.branchId ?? "",
    }),
  });
}

export interface ImmediateDebitBeginnerParams {
  amount: number;
  debtorAccount: string;        // cuenta (20) o teléfono (12)
  debtorAccountType: "CNTA" | "CELE";
  debtorBank: string;
  debtorId: string;
  debtorName: string;
  concept: string;              // hasta 100 chars
  token: number;                // AddtlInf (máx 8 dígitos)
  childClientId?: string;
  branchId?: string;
}

export interface ImmediateDebitBeginnerResponse {
  message: string;
  rawResponse?: {
    status?: string;
    message?: string;
    [key: string]: unknown;
  };
  decrypted?: {
    Reference?: string;
    OperationType?: string;
    SubOperationType?: string;
    Status?: string;
    Code?: string | null;
    RejectDescription?: string | null;
    [key: string]: unknown;
  };
}

/**
 * Wrapper de POST /api/immediate-debit/beginner-simple
 * Ejecuta el débito inmediato en SIMF (CNTA / CELE) usando un token SIMF válido.
 */
export async function immediateDebitBeginnerSimple(
  params: ImmediateDebitBeginnerParams,
): Promise<ImmediateDebitBeginnerResponse> {
  const url = `${API_BASE_URL}/api/immediate-debit/beginner-simple`;
  return authorizedFetch(url, {
    method: "POST",
    body: JSON.stringify({
      amount: params.amount,
      debtorAccount: params.debtorAccount,
      debtorAccountType: params.debtorAccountType,
      debtorBank: params.debtorBank,
      debtorId: params.debtorId,
      debtorName: params.debtorName,
      concept: params.concept,
      token: params.token,
      childClientId: params.childClientId ?? "",
      branchId: params.branchId ?? "",
    }),
  });
}

function normalizeToIsoDateTime(dateStr: string): string {
  if (!dateStr) return dateStr;
  if (dateStr.includes("T")) return dateStr;
  const iso = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    return `${iso[1]}-${iso[2]}-${iso[3]}T00:00:00`;
  }
  const ddmmyyyy = dateStr.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (ddmmyyyy) {
    const [, d, m, y] = ddmmyyyy;
    const dd = d.padStart(2, "0");
    const mm = m.padStart(2, "0");
    return `${y}-${mm}-${dd}T00:00:00`;
  }
  return dateStr;
}

/**
 * Sincroniza el historial de movimientos del BNC para una cuenta y rango de fechas.
 * Los movimientos se guardan en la base de datos (tabla banktransaction).
 * startDate/endDate pueden ser ISO (YYYY-MM-DD[THH:mm:ss]) o dd/MM/yyyy; se envían al backend en ISO
 * con hora fija T00:00:00 (ej: 2025-08-01T00:00:00), tal como en la documentación.
 * Ver docs/sincronizar-transacciones.md
 */
export async function syncTransactions(
  params: HistoryByDateSyncParams
): Promise<HistoryByDateSyncResponse> {
  const wk = typeof params.workingKey === "string" ? params.workingKey.trim() : "";
  if (!wk) {
    throw new Error("La workingKey está vacía. Debe obtenerse de POST /api/auth/login-simple antes de sincronizar.");
  }
  const url = `${API_BASE_URL}/api/account/history-by-date-sync`;
  return authorizedFetch(url, {
    method: "POST",
    body: JSON.stringify({
      accountNumber: params.accountNumber.trim(),
      startDate: normalizeToIsoDateTime(params.startDate),
      endDate: normalizeToIsoDateTime(params.endDate),
      workingKey: wk,
      childClientId: params.childClientId ?? "",
      branchId: params.branchId ?? "",
    }),
  });
}
