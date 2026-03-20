import cron from 'node-cron';
import { prisma } from '../lib/prisma';
import { logError } from '../utils/logger';
import { encryptJson, decryptJson } from '../utils/bncCrypto';
import { resolveBankClient, BncClient } from '../services/bankClients';
import {
  BankEnvironment,
  BankIntegrationProvider,
  BankIntegrationService,
} from '../generated/prisma/enums';

/**
 * Sincroniza el estado de cuenta de una sola cuenta bancaria:
 * - Hace Auth/LogOn para obtener WorkingKey
 * - Llama al servicio Position/History del BNC
 * - Inserta/actualiza movimientos en BankTransaction (evitando duplicados)
 */
export async function syncAccountStatementForAccount(accountNumber: string) {
  // 1) Verificar que la cuenta exista en nuestra BD
  const bankAccount = await prisma.bankAccount.findUnique({
    where: { accountNumber },
  });

  if (!bankAccount) {
    throw new Error(
      `La cuenta bancaria ${accountNumber} no existe en la BD local. Regístrela primero.`,
    );
  }

  // 2) Resolver integración bancaria (AUTH para obtener WorkingKey y QUERIES para Position/History)
  const env =
    process.env.NODE_ENV === 'production' ? BankEnvironment.PRODUCTION : BankEnvironment.SANDBOX;

  // Primero buscamos una integración para QUERIES; si no hay, error explícito
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
      `La integración configurada para bankId=${bankId} no es BNC; solo BNC está soportado para syncAccountStatementForAccount.`,
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
      'La configuración de integración bancaria para syncAccountStatementForAccount no tiene urlBase, clientGuid, masterKey o clientId definidos.',
    );
  }

  // 3) Obtener WorkingKey vía Auth/LogOn usando el mismo esquema que /auth/login-simple
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
      `Error en Auth/LogOn para la cuenta ${accountNumber}: ${String(
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
      `No se pudo obtener WorkingKey en Auth/LogOn para la cuenta ${accountNumber}.`,
    );
  }

  // 4) Armar body para Position/History
  const originalBody = {
    AccountNumber: accountNumber,
    ClientID: clientIdFromConfig,
  };

  const { value, validation } = encryptJson(originalBody, workingKey);

  const envelope = {
    ClientGUID: clientGuid,
    Value: value,
    Validation: validation,
    swTestOperation: false,
  };

  const upstreamResponse = await fetch(
    `${queriesBaseUrl.replace(/\/+$/, '')}/Position/History`,
    {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(envelope),
  });

  const data: any = await upstreamResponse.json().catch(() => null);

  if (!upstreamResponse.ok || data?.status !== 'OK') {
    throw new Error(
      `Error al consultar Position/History para la cuenta ${accountNumber}: ${String(
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
      `No se pudo desencriptar respuesta de Position/History para la cuenta ${accountNumber}.`,
    );
  }

  // La respuesta puede venir como array directo o como diccionario { accountNumber: [movs] }
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

  // Construir un set con las claves existentes en BD para evitar duplicados:
  // clave = fecha (YYYY-MM-DD) + cuenta + referenciaA + monto
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - 5); // margen de seguridad alrededor de los 3 días
  fromDate.setHours(0, 0, 0, 0);

  const existing = await prisma.bankTransaction.findMany({
    where: {
      accountNumber,
      movementDate: {
        gte: fromDate,
      },
    },
    select: {
      movementDate: true,
      accountNumber: true,
      referenceA: true,
      amount: true,
    },
  });

  const existingKeys = new Set<string>();
  for (const tx of existing) {
    const day = tx.movementDate.toISOString().slice(0, 10);
    const key = `${day}|${tx.accountNumber}|${tx.referenceA ?? ''}|${tx.amount ?? 0}`;
    existingKeys.add(key);
  }

  for (let index = 0; index < movements.length; index += 1) {
    const m = movements[index];
    const movementDate = parseDateOnly(m.Date);
    const amount = m.Amount !== undefined && m.Amount !== null ? Number(m.Amount) : null;
    const type = m.Type !== undefined && m.Type !== null ? String(m.Type) : null;
    if (!movementDate || amount === null || !type) continue;

    const day = movementDate.toISOString().slice(0, 10);
    const key = `${day}|${accountNumber}|${m.ReferenceA != null ? String(m.ReferenceA) : ''}|${
      amount ?? 0
    }`;

    // Si ya existe una transacción con misma fecha, cuenta, referenciaA y monto, se salta
    if (existingKeys.has(key)) continue;
    existingKeys.add(key);

    const upperType = type.toUpperCase();
    const upperConcept = String(m.Concept ?? '').toUpperCase();
    const upperBalanceDelta = String(m.BalanceDelta ?? '').toUpperCase();
    let kind: 'TRF' | 'DEP' | 'P2P' = 'TRF';
    if (upperType.includes('PAGO MOVIL') || upperConcept.includes('PAGO MOVIL')) kind = 'P2P';
    else if (upperBalanceDelta === 'INGRESO') kind = 'DEP';

    const transactionTypeLabel =
      m.Code !== undefined && m.Code !== null
        ? // eslint-disable-next-line @typescript-eslint/no-var-requires
          require('../utils/transactionTypes').getTransactionTypeLabel(m.Code)
        : null;

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

  if (dataToInsert.length === 0) {
    return;
  }

  await prisma.bankTransaction.createMany({
    data: dataToInsert,
    skipDuplicates: true,
  });
}

export function startStatementSyncJob(): void {
  const defaultCron = '*/10 * * * *';
  const cronExpr =
    (process.env.STATEMENT_SYNC_CRON && process.env.STATEMENT_SYNC_CRON.trim()) || defaultCron;

  cron.schedule(cronExpr, async () => {
    try {
      const accounts = await prisma.bankAccount.findMany({
        where: { isActive: true },
      });

      for (const acc of accounts) {
        try {
          await syncAccountStatementForAccount(acc.accountNumber);
        } catch (err) {
          logError('jobs/statement-sync', err, { accountNumber: acc.accountNumber });
        }
      }
    } catch (err) {
      logError('jobs/statement-sync', err);
    }
  });
}

