import { prisma } from '../lib/prisma';
import { logError } from '../utils/logger';
import { encryptJson, decryptJson } from '../utils/bncCrypto';
import { getTransactionTypeLabel } from '../utils/transactionTypes';
import { resolveBankClient, BncClient } from '../services/bankClients';
import {
  BankEnvironment,
  BankIntegrationProvider,
  BankIntegrationService,
} from '../generated/prisma/enums';

function parseYyyyMmDd(input: string): Date | null {
  const s = input.trim();
  if (!s) return null;
  const parts = s.split('-');
  if (parts.length !== 3) return null;
  const [yearStr, monthStr, dayStr] = parts;
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

function formatDateYyyyMmDd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Sincroniza un rango de fechas (máx 31 días) para una cuenta usando HistoryByDate.
 * Reutiliza la misma lógica que /history-by-date-sync, incluyendo externalOrder.
 */
async function syncHistoryRangeForAccount(
  accountNumber: string,
  startDateIso: string,
  endDateIso: string,
): Promise<void> {
  const bankAccount = await prisma.bankAccount.findUnique({
    where: { accountNumber },
  });

  if (!bankAccount) {
    throw new Error(
      `La cuenta bancaria ${accountNumber} no existe en la BD local. Regístrela primero.`,
    );
  }

  const env =
    process.env.NODE_ENV === 'production' ? BankEnvironment.PRODUCTION : BankEnvironment.SANDBOX;

  const anyConfig = await prisma.bankIntegrationConfig.findFirst({
    where: {
      environment: env,
      isActive: true,
      services: {
        some: { service: BankIntegrationService.QUERIES },
      },
    },
  });

  if (!anyConfig) {
    throw new Error(
      `No existe configuración de integración bancaria activa para el servicio de consultas en entorno ${env}.`,
    );
  }

  const bankId = anyConfig.bankId;

  const authClient = await resolveBankClient({
    bankId,
    environment: env,
    service: BankIntegrationService.AUTH,
  });

  const queriesClient = await resolveBankClient({
    bankId,
    environment: env,
    service: BankIntegrationService.QUERIES,
  });

  if (
    authClient.provider !== BankIntegrationProvider.BNC ||
    queriesClient.provider !== BankIntegrationProvider.BNC
  ) {
    throw new Error(
      `La integración configurada para bankId=${bankId} no es BNC; solo BNC está soportado para syncHistoryRangeForAccount.`,
    );
  }

  const authBnc = authClient as BncClient;
  const queriesBnc = queriesClient as BncClient;

  const authBaseUrl = authBnc.urlBase;
  const queriesBaseUrl = queriesBnc.urlBase;
  const clientGuid = authBnc.clientGuid;
  const masterKey = authBnc.masterKey;
  const clientIdFromConfig = queriesBnc.clientId;

  if (!authBaseUrl || !queriesBaseUrl || !clientGuid || !masterKey || !clientIdFromConfig) {
    throw new Error(
      'La configuración de integración bancaria para syncHistoryRangeForAccount no tiene urlBase, clientGuid, masterKey o clientId definidos.',
    );
  }

  // Obtener WorkingKey vía Auth/LogOn (login-simple)
  const loginBody = {
    ClientGUID: clientGuid,
  };

  const { value: loginValue, validation: loginValidation } = encryptJson(loginBody, masterKey);

  const loginEnvelope = {
    ClientGUID: clientGuid,
    Value: loginValue,
    Validation: loginValidation,
    swTestOperation: false,
  };

  const loginResponse = await fetch(`${authBaseUrl.replace(/\/+$/, '')}/Auth/LogOn`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(loginEnvelope),
  });

  const loginData: any = await loginResponse.json().catch(() => null);

  if (!loginResponse.ok || loginData?.status !== 'OK') {
    throw new Error(
      `Error en Auth/LogOn (initial sync) para ${accountNumber}: ${String(
        loginData?.message ?? 'status not OK',
      )}`,
    );
  }

  let loginDecrypted: any = null;
  try {
    loginDecrypted = decryptJson(loginData.value, masterKey);
  } catch {
    loginDecrypted = null;
  }

  const workingKey: string | undefined =
    loginDecrypted?.WorkingKey ?? loginDecrypted?.workingKey;

  if (!workingKey) {
    throw new Error(
      `No se pudo obtener WorkingKey (initial sync) para la cuenta ${accountNumber}.`,
    );
  }

  const originalBody = {
    ClientID: clientIdFromConfig,
    AccountNumber: accountNumber,
    StartDate: startDateIso,
    EndDate: endDateIso,
  };

  const { value, validation } = encryptJson(originalBody, workingKey);

  const envelope = {
    ClientGUID: clientGuid,
    Value: value,
    Validation: validation,
    swTestOperation: false,
  };

  const upstreamResponse = await fetch(
    `${queriesBaseUrl.replace(/\/+$/, '')}/Position/HistoryByDate`,
    {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(envelope),
  });

  const data = await upstreamResponse.json().catch(() => null);

  if (!upstreamResponse.ok || data?.status !== 'OK') {
    throw new Error(
      `Error en HistoryByDate (initial sync) para ${accountNumber}: ${String(
        data?.message ?? 'status not OK',
      )}`,
    );
  }

  let decrypted: any = null;
  try {
    decrypted = decryptJson(data.value, workingKey);
  } catch {
    decrypted = null;
  }

  if (!decrypted) {
    throw new Error(
      `No se pudo desencriptar HistoryByDate (initial sync) para la cuenta ${accountNumber}.`,
    );
  }

  let movements: any[] = [];
  if (Array.isArray(decrypted)) {
    movements = decrypted;
  } else if (typeof decrypted === 'object' && decrypted !== null) {
    const firstValue = Object.values(decrypted)[0];
    if (Array.isArray(firstValue)) {
      movements = firstValue;
    }
  }

  if (!Array.isArray(movements) || movements.length === 0) {
    return;
  }

  const parseDateOnly = (raw: unknown): Date | null => {
    if (!raw) return null;
    const dateStr = String(raw);

    if (dateStr.includes('/')) {
      const [day, month, year] = dateStr.split('/');
      if (!day || !month || !year) return null;
      return new Date(Number(year), Number(month) - 1, Number(day), 0, 0, 0, 0);
    }

    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return null;
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  };

  const dataToInsert: import('../generated/prisma/models/BankTransaction').BankTransactionCreateManyInput[] =
    [];

  // Insertar del último al primero para este rango histórico (por mes)
  for (let index = movements.length - 1; index >= 0; index -= 1) {
    const m = movements[index];
    const movementDate = parseDateOnly(m.Date);
    const amount = m.Amount !== undefined && m.Amount !== null ? Number(m.Amount) : null;
    const type = m.Type !== undefined && m.Type !== null ? String(m.Type) : null;
    if (!movementDate || amount === null || !type) continue;

    const upperType = type.toUpperCase();
    const upperConcept = String(m.Concept ?? '').toUpperCase();
    const upperBalanceDelta = String(m.BalanceDelta ?? '').toUpperCase();
    let kind: 'TRF' | 'DEP' | 'P2P' = 'TRF';
    if (upperType.includes('PAGO MOVIL') || upperConcept.includes('PAGO MOVIL')) kind = 'P2P';
    else if (upperBalanceDelta === 'INGRESO') kind = 'DEP';

    const transactionTypeLabel =
      m.Code !== undefined && m.Code !== null ? getTransactionTypeLabel(m.Code) : null;

    const row: import('../generated/prisma/models/BankTransaction').BankTransactionCreateManyInput =
      {
        bankAccountId: bankAccount.id,
        accountNumber,
        movementDate,
        controlNumber: String(m.ControlNumber ?? ''),
        amount,
        code: String(m.Code ?? ''),
        bankCode: String(m.BankCode ?? ''),
        concept: String(m.Concept ?? ''),
        type,
        balanceDelta: String(m.BalanceDelta ?? ''),
        kind,
        debtorInstrument: m.DebtorInstrument != null ? String(m.DebtorInstrument) : null,
        referenceA: m.ReferenceA != null ? String(m.ReferenceA) : null,
        referenceB: m.ReferenceB != null ? String(m.ReferenceB) : null,
        referenceC: m.ReferenceC != null ? String(m.ReferenceC) : null,
        referenceD: m.ReferenceD != null ? String(m.ReferenceD) : null,
        transactionTypeLabel: transactionTypeLabel ?? null,
      };

    (row as any).externalOrder = index;
    dataToInsert.push(row);
  }

  if (dataToInsert.length === 0) return;

  await prisma.bankTransaction.createMany({
    data: dataToInsert,
    skipDuplicates: true,
  });
}

/**
 * Corre una sincronización inicial desde INITIAL_SYNC_START_DATE hasta hoy,
 * por rangos de máximo 31 días, para todas las cuentas activas.
 * Si la variable de entorno no está definida, no hace nada.
 */
export async function runInitialHistorySyncIfNeeded(): Promise<void> {
  const startDateEnv = process.env.INITIAL_SYNC_START_DATE;
  if (!startDateEnv) {
    return;
  }

  const startDate = parseYyyyMmDd(startDateEnv);
  if (!startDate) {
    logError('jobs/initial-history-sync', new Error('INITIAL_SYNC_START_DATE inválida'), {
      value: startDateEnv,
    });
    return;
  }

  const today = new Date();
  const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);

  try {
    const accounts = await prisma.bankAccount.findMany({
      where: { isActive: true },
    });

    for (const acc of accounts) {
      let cursor = new Date(startDate.getTime());

      while (cursor <= todayDate) {
        const end = new Date(cursor.getTime());
        end.setDate(end.getDate() + 30); // máx ~31 días
        if (end > todayDate) {
          end.setTime(todayDate.getTime());
        }

        const startIso = formatDateYyyyMmDd(cursor);
        const endIso = formatDateYyyyMmDd(end);

        try {
          await syncHistoryRangeForAccount(acc.accountNumber, startIso, endIso);
        } catch (err) {
          logError('jobs/initial-history-sync', err, {
            accountNumber: acc.accountNumber,
            startIso,
            endIso,
          });
        }

        // siguiente ventana
        end.setDate(end.getDate() + 1);
        cursor = end;
      }
    }
  } catch (err) {
    logError('jobs/initial-history-sync', err);
  }
}

