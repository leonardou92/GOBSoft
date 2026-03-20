import { Router } from 'express';
import type { BankTransactionCreateManyInput } from '../generated/prisma/models/BankTransaction';
import { prisma } from '../lib/prisma';
import { decryptJson, encryptJson } from '../utils/bncCrypto';
import { logError } from '../utils/logger';
import { getTransactionTypeLabel } from '../utils/transactionTypes';
import { auditEvent } from '../utils/audit';
import { resolveBankClient } from '../services/bankClients';
import { authTokenMiddleware } from '../middleware/authToken';
import { requirePermissions } from '../middleware/authorize';
import { decryptTwoFactorSecret, verifyTotpCode } from '../utils/twoFactor';
import {
  BankEnvironment,
  BankIntegrationProvider,
  BankIntegrationService,
} from '../generated/prisma/enums';
import { BncClient } from '../services/bankClients';

const router = Router();
const TWO_FA_MAX_FAILED_ATTEMPTS = 5;
const TWO_FA_BLOCK_WINDOW_MS = 10 * 60 * 1000;
const twoFactorAttempts = new Map<string, { count: number; blockedUntil?: number }>();

function getClientIp(req: any): string {
  return (
    (req.headers?.['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ||
    req.ip ||
    'unknown'
  );
}

function getTwoFactorRateLimitKey(req: any, userId: number): string {
  return `${userId}:${getClientIp(req)}`;
}

function isTwoFactorBlocked(key: string): boolean {
  const current = twoFactorAttempts.get(key);
  if (!current?.blockedUntil) return false;
  if (Date.now() > current.blockedUntil) {
    twoFactorAttempts.delete(key);
    return false;
  }
  return true;
}

function registerTwoFactorFailure(key: string): void {
  const current = twoFactorAttempts.get(key) ?? { count: 0 };
  const nextCount = current.count + 1;
  if (nextCount >= TWO_FA_MAX_FAILED_ATTEMPTS) {
    twoFactorAttempts.set(key, {
      count: nextCount,
      blockedUntil: Date.now() + TWO_FA_BLOCK_WINDOW_MS,
    });
    return;
  }
  twoFactorAttempts.set(key, { count: nextCount });
}

function clearTwoFactorFailures(key: string): void {
  twoFactorAttempts.delete(key);
}

// Proxy directo: espera envelope ya encriptado (Value + Validation) y usa integración bancaria
router.post(
  '/statement',
  authTokenMiddleware,
  requirePermissions(['VIEW_TRANSACTIONS']),
  async (req, res) => {
  try {
    const { bankId: bankIdFromBody } = req.body || {};

    // Determinar entorno lógico
    const env =
      process.env.NODE_ENV === 'production'
        ? BankEnvironment.PRODUCTION
        : BankEnvironment.SANDBOX;

    // Determinar bankId para el servicio de consultas (QUERIES)
    let bankId: number;

    if (bankIdFromBody != null) {
      bankId = Number(bankIdFromBody);
    } else {
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
        return res.status(400).json({
          message:
            'No existe configuración de integración bancaria activa para el servicio de consultas. Configure una integración antes de usar este endpoint.',
          code: 'NO_BANK_INTEGRATION_CONFIG',
          meta: {
            environment: env,
            service: BankIntegrationService.QUERIES,
          },
        });
      }

      bankId = anyConfig.bankId;
    }

    const client = await resolveBankClient({
      bankId,
      environment: env,
      service: BankIntegrationService.QUERIES,
    });

    if (client.provider !== BankIntegrationProvider.BNC) {
      return res.status(400).json({
        message:
          'La integración configurada para este banco no soporta aún el endpoint /account/statement.',
      });
    }

    const bncClient = client as BncClient;

    const baseUrl = bncClient.urlBase;
    const clientGuid = bncClient.clientGuid;

    if (!baseUrl || !clientGuid) {
      return res.status(500).json({
        message:
          'La configuración de integración bancaria para este banco no tiene urlBase o clientGuid definidos.',
      });
    }

    const bodyFromClient = req.body || {};

    const envelope = {
      ClientGUID: clientGuid,
      ...bodyFromClient,
    };

    const upstreamResponse = await fetch(`${baseUrl.replace(/\/+$/, '')}/Position/History`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(envelope),
    });

    const data = await upstreamResponse.json().catch(() => null);

    if (!upstreamResponse.ok) {
      return res.status(upstreamResponse.status).json({
        message: 'Error al consultar el estado de cuenta en el banco.',
        statusCode: upstreamResponse.status,
        body: data,
      });
    }

    return res.status(200).json({
      message: 'Estado de cuenta obtenido desde el banco.',
      rawResponse: data,
    });
  } catch (error: any) {
    if (error?.code === 'NO_BANK_INTEGRATION_CONFIG') {
      return res.status(400).json({
        message:
          'No existe configuración de integración bancaria activa para este banco y servicio. Configure una integración antes de usar este endpoint.',
        code: 'NO_BANK_INTEGRATION_CONFIG',
        meta: error.meta,
      });
    }

    logError('account/statement', error);
    return res.status(500).json({
      message: 'No se pudo obtener el estado de cuenta desde el banco.',
    });
  }
},
);

// Endpoint "simple": recibe datos legibles y WorkingKey y arma el envelope usando integración bancaria
router.post(
  '/statement-simple',
  authTokenMiddleware,
  requirePermissions(['VIEW_TRANSACTIONS']),
  async (req, res) => {
  const { accountNumber, workingKey, bankId: bankIdFromBody } = req.body || {};

  if (!accountNumber || !workingKey) {
    return res.status(400).json({
      message: 'Debe enviar accountNumber y workingKey en el cuerpo.',
    });
  }

  try {
    // Determinar entorno lógico
    const env =
      process.env.NODE_ENV === 'production'
        ? BankEnvironment.PRODUCTION
        : BankEnvironment.SANDBOX;

    // Determinar bankId:
    // - Si viene en el cuerpo, se usa.
    // - Si no, se intenta obtener por la cuenta; si la cuenta no tiene banco asignado,
    //   se toma cualquier integración activa para QUERIES.
    let bankId: number;

    if (bankIdFromBody != null) {
      bankId = Number(bankIdFromBody);
    } else {
      const bankAccount = await prisma.bankAccount.findUnique({
        where: { accountNumber },
      });

      if (bankAccount?.bankId) {
        bankId = bankAccount.bankId;
      } else {
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
          return res.status(400).json({
            message:
              'No existe configuración de integración bancaria activa para el servicio de consultas. Configure una integración antes de usar este endpoint.',
            code: 'NO_BANK_INTEGRATION_CONFIG',
            meta: {
              environment: env,
              service: BankIntegrationService.QUERIES,
            },
          });
        }

        bankId = anyConfig.bankId;
      }
    }

    const client = await resolveBankClient({
      bankId,
      environment: env,
      service: BankIntegrationService.QUERIES,
    });

    if (client.provider !== BankIntegrationProvider.BNC) {
      return res.status(400).json({
        message:
          'La integración configurada para este banco no soporta aún el endpoint /account/statement-simple.',
      });
    }

    const bncClient = client as BncClient;

    const baseUrl = bncClient.urlBase;
    const clientGuid = bncClient.clientGuid;
    const clientIdFromConfig = bncClient.clientId;

    if (!baseUrl || !clientGuid || !clientIdFromConfig) {
      return res.status(500).json({
        message:
          'La configuración de integración bancaria para este banco no tiene urlBase, clientGuid o clientId definidos.',
      });
    }

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

    const upstreamResponse = await fetch(`${baseUrl.replace(/\/+$/, '')}/Position/History`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(envelope),
    });

    const data = await upstreamResponse.json();

    if (!upstreamResponse.ok || data.status !== 'OK') {
      logError('account/statement-simple', new Error('Bank status not OK'), {
        statusCode: upstreamResponse.status,
        body: data,
      });
      return res.status(upstreamResponse.status).json({
        message: 'Error al consultar el estado de cuenta (simple) en el banco.',
        statusCode: upstreamResponse.status,
        body: data,
      });
    }

    let decrypted: unknown = null;
    try {
      decrypted = decryptJson(data.value, workingKey);
    } catch {
      decrypted = null;
    }

    return res.status(200).json({
      message: 'Estado de cuenta obtenido desde el banco (statement-simple).',
      rawResponse: data,
      decrypted,
    });
  } catch (error: any) {
    if (error?.code === 'NO_BANK_INTEGRATION_CONFIG') {
      return res.status(400).json({
        message:
          'No existe configuración de integración bancaria activa para este banco y servicio. Configure una integración antes de usar este endpoint.',
        code: 'NO_BANK_INTEGRATION_CONFIG',
        meta: error.meta,
      });
    }

    logError('account/statement-simple', error);
    return res.status(500).json({
      message: 'No se pudo obtener el estado de cuenta (simple) desde el banco.',
    });
  }
},
);

// Endpoint "simple" para Historial por rango de fechas (máx 31 días) usando integración bancaria
router.post(
  '/history-by-date-simple',
  authTokenMiddleware,
  requirePermissions(['VIEW_TRANSACTIONS']),
  async (req, res) => {
  const {
    accountNumber,
    startDate,
    endDate,
    workingKey,
    childClientId,
    branchId,
    bankId: bankIdFromBody,
  } = req.body || {};

  if (!accountNumber || !startDate || !endDate || !workingKey) {
    return res.status(400).json({
      message:
        'Debe enviar accountNumber, startDate, endDate y workingKey en el cuerpo.',
    });
  }

  try {
    const env =
      process.env.NODE_ENV === 'production'
        ? BankEnvironment.PRODUCTION
        : BankEnvironment.SANDBOX;

    let bankId: number;

    if (bankIdFromBody != null) {
      bankId = Number(bankIdFromBody);
    } else {
      const bankAccount = await prisma.bankAccount.findUnique({
        where: { accountNumber },
      });

      if (bankAccount?.bankId) {
        bankId = bankAccount.bankId;
      } else {
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
          return res.status(400).json({
            message:
              'No existe configuración de integración bancaria activa para el servicio de consultas. Configure una integración antes de usar este endpoint.',
            code: 'NO_BANK_INTEGRATION_CONFIG',
            meta: {
              environment: env,
              service: BankIntegrationService.QUERIES,
            },
          });
        }

        bankId = anyConfig.bankId;
      }
    }

    const client = await resolveBankClient({
      bankId,
      environment: env,
      service: BankIntegrationService.QUERIES,
    });

    if (client.provider !== BankIntegrationProvider.BNC) {
      return res.status(400).json({
        message:
          'La integración configurada para este banco no soporta aún el endpoint /account/history-by-date-simple.',
      });
    }

    const bncClient = client as BncClient;

    const baseUrl = bncClient.urlBase;
    const clientGuid = bncClient.clientGuid;
    const clientIdFromConfig = bncClient.clientId;

    if (!baseUrl || !clientGuid || !clientIdFromConfig) {
      return res.status(500).json({
        message:
          'La configuración de integración bancaria para este banco no tiene urlBase, clientGuid o clientId definidos.',
      });
    }

    const originalBody: Record<string, unknown> = {
      ClientID: clientIdFromConfig,
      AccountNumber: accountNumber,
      StartDate: startDate,
      EndDate: endDate,
    };

    if (childClientId) {
      originalBody.ChildClientID = childClientId;
    }

    if (branchId) {
      originalBody.BranchID = branchId;
    }

    const { value, validation } = encryptJson(originalBody, workingKey);

    const envelope = {
      ClientGUID: clientGuid,
      Value: value,
      Validation: validation,
      swTestOperation: false,
    };

    const upstreamResponse = await fetch(
      `${baseUrl.replace(/\/+$/, '')}/Position/HistoryByDate`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(envelope),
      },
    );

    const data = await upstreamResponse.json();

    if (!upstreamResponse.ok || data.status !== 'OK') {
      logError('account/history-by-date-simple', new Error('Bank status not OK'), {
        statusCode: upstreamResponse.status,
        body: data,
      });
      return res.status(upstreamResponse.status).json({
        message:
          'Error al consultar el historial por rango de fechas (simple) en el banco.',
        statusCode: upstreamResponse.status,
        body: data,
      });
    }

    let decrypted: unknown = null;
    try {
      decrypted = decryptJson(data.value, workingKey);
    } catch {
      decrypted = null;
    }

    return res.status(200).json({
      message:
        'Historial por rango de fechas obtenido desde el banco (history-by-date-simple).',
      rawResponse: data,
      decrypted,
    });
  } catch (error: any) {
    if (error?.code === 'NO_BANK_INTEGRATION_CONFIG') {
      return res.status(400).json({
        message:
          'No existe configuración de integración bancaria activa para este banco y servicio. Configure una integración antes de usar este endpoint.',
        code: 'NO_BANK_INTEGRATION_CONFIG',
        meta: error.meta,
      });
    }

    logError('account/history-by-date-simple', error);
    return res.status(500).json({
      message:
        'No se pudo obtener el historial por rango de fechas (simple) desde el banco.',
    });
  }
},
);

// Endpoint "simple" para consultar saldo actual (Position/Current) usando integración bancaria
router.post(
  '/balance-simple',
  authTokenMiddleware,
  requirePermissions(['VIEW_TRANSACTIONS']),
  async (req, res) => {
  const { workingKey, clientId, bankId: bankIdFromBody } = req.body || {};

  if (!workingKey) {
    return res.status(400).json({
      message: 'Debe enviar workingKey en el cuerpo.',
    });
  }

  try {
    // Resolver integración para consultas (QUERIES) en el entorno actual.
    // Regla:
    // - Si viene bankId en el cuerpo, se usa ese banco.
    // - Si NO viene bankId, se toma la primera integración activa BNC para QUERIES.
    // - Si no hay integración, NO se consume la API y se avisa al cliente.
    const env = process.env.NODE_ENV === 'production' ? BankEnvironment.PRODUCTION : BankEnvironment.SANDBOX;

    let bankId: number;

    if (bankIdFromBody != null) {
      bankId = Number(bankIdFromBody);
    } else {
      const anyConfig = await prisma.bankIntegrationConfig.findFirst({
        where: {
          environment: env,
          provider: BankIntegrationProvider.BNC,
          isActive: true,
          services: {
            some: { service: BankIntegrationService.QUERIES },
          },
        },
      });

      if (!anyConfig) {
        return res.status(400).json({
          message:
            'No existe configuración de integración bancaria activa para el servicio de consultas. Configure una integración antes de usar balance-simple.',
          code: 'NO_BANK_INTEGRATION_CONFIG',
          meta: {
            environment: env,
            service: BankIntegrationService.QUERIES,
          },
        });
      }

      bankId = anyConfig.bankId;
    }

    const client = await resolveBankClient({
      bankId,
      environment: env,
      service: BankIntegrationService.QUERIES,
    });

    if (client.provider !== BankIntegrationProvider.BNC) {
      return res.status(400).json({
        message:
          'La integración configurada para este banco no es BNC y aún no se ha implementado balance-simple para otros proveedores.',
      });
    }

    const bncClient = client as BncClient;

    const baseUrl = bncClient.urlBase;
    const clientGuid = bncClient.clientGuid;
    const clientIdFromConfig = bncClient.clientId;

    if (!baseUrl || !clientGuid || !clientIdFromConfig) {
      return res.status(500).json({
        message:
          'La configuración de integración BNC para este banco no tiene urlBase, clientGuid o clientId definidos.',
      });
    }

    const effectiveClientId = String(clientId || clientIdFromConfig);

    const originalBody = {
      ClientID: effectiveClientId,
    };

    const { value, validation } = encryptJson(originalBody, workingKey);

    const envelope = {
      ClientGUID: clientGuid,
      Value: value,
      Validation: validation,
      swTestOperation: false,
    };

    const upstreamResponse = await fetch(`${baseUrl.replace(/\/+$/, '')}/Position/Current`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(envelope),
    });

    const data = await upstreamResponse.json();

    if (!upstreamResponse.ok || data.status !== 'OK') {
      logError('account/balance-simple', new Error('BNC status not OK'), {
        statusCode: upstreamResponse.status,
        body: data,
      });
      return res.status(upstreamResponse.status).json({
        message: 'Error al consultar el saldo actual (simple) en el BNC.',
        statusCode: upstreamResponse.status,
        body: data,
      });
    }

    let decrypted: unknown = null;
    try {
      decrypted = decryptJson(data.value, workingKey);
    } catch {
      decrypted = null;
    }

    return res.status(200).json({
      message: 'Saldo actual obtenido desde el BNC (balance-simple).',
      rawResponse: data,
      decrypted,
    });
  } catch (error: any) {
    if (error?.code === 'NO_BANK_INTEGRATION_CONFIG') {
      return res.status(400).json({
        message: 'No existe configuración de integración activa para este banco y servicio.',
        code: 'NO_BANK_INTEGRATION_CONFIG',
        meta: error.meta,
      });
    }

    logError('account/balance-simple', error);
    return res.status(500).json({
      message: 'No se pudo consultar el saldo actual (simple) en el BNC.',
    });
  }
},
);

// Endpoint "simple" para Validar P2P (Position/ValidateP2P) usando integración bancaria
router.post(
  '/validate-p2p-simple',
  authTokenMiddleware,
  requirePermissions(['EXECUTE_P2P']),
  async (req, res) => {
  const {
    accountNumber,
    amount,
    phoneNumber,
    reference,
    requestDate,
    workingKey,
    bankCode,
    clientId,
    childClientId,
    branchId,
    bankId: bankIdFromBody,
  } = req.body || {};

  if (
    !accountNumber ||
    amount === undefined ||
    amount === null ||
    !phoneNumber ||
    !reference ||
    !requestDate ||
    !workingKey
  ) {
    return res.status(400).json({
      message:
        'Debe enviar accountNumber, amount, phoneNumber, reference, requestDate y workingKey.',
    });
  }

  try {
    const env =
      process.env.NODE_ENV === 'production'
        ? BankEnvironment.PRODUCTION
        : BankEnvironment.SANDBOX;

    // 1) Buscar la cuenta en nuestra base de datos (si existe) para inferir bankId
    const bankAccount = await prisma.bankAccount.findUnique({
      where: { accountNumber },
    });

    // 2) Determinar bankId para servicio C2P (pasarela pago móvil)
    let bankId: number;

    if (bankIdFromBody != null) {
      bankId = Number(bankIdFromBody);
    } else if (bankAccount?.bankId) {
      bankId = bankAccount.bankId;
    } else {
      const anyConfig = await prisma.bankIntegrationConfig.findFirst({
        where: {
          environment: env,
          isActive: true,
          services: {
            some: { service: BankIntegrationService.C2P },
          },
        },
      });

      if (!anyConfig) {
        return res.status(400).json({
          message:
            'No existe configuración de integración bancaria activa para el servicio de pagos C2P/P2P. Configure una integración antes de usar este endpoint.',
          code: 'NO_BANK_INTEGRATION_CONFIG',
          meta: {
            environment: env,
            service: BankIntegrationService.C2P,
          },
        });
      }

      bankId = anyConfig.bankId;
    }

    const client = await resolveBankClient({
      bankId,
      environment: env,
      service: BankIntegrationService.C2P,
    });

    if (client.provider !== BankIntegrationProvider.BNC) {
      return res.status(400).json({
        message:
          'La integración configurada para este banco no soporta aún el endpoint /account/validate-p2p-simple.',
      });
    }

    const bncClient = client as BncClient;

    const baseUrl = bncClient.urlBase;
    const clientGuid = bncClient.clientGuid;
    const clientIdFromConfig = bncClient.clientId;

    if (!baseUrl || !clientGuid || !clientIdFromConfig) {
      return res.status(500).json({
        message:
          'La configuración de integración bancaria para este banco no tiene urlBase, clientGuid o clientId definidos.',
      });
    }

    const effectiveBankCode = Number(bankCode ?? bankAccount?.bankCode ?? 0);
    const effectiveClientId = String(clientId ?? clientIdFromConfig);

    const originalBody: Record<string, unknown> = {
      AccountNumber: String(accountNumber),
      Amount: Number(amount),
      BankCode: effectiveBankCode,
      ClientID: effectiveClientId,
      PhoneNumber: String(phoneNumber),
      Reference: String(reference),
      RequestDate: String(requestDate),
    };

    if (childClientId) {
      originalBody.ChildClientID = String(childClientId);
    }

    if (branchId) {
      originalBody.BranchID = String(branchId);
    }

    const { value, validation } = encryptJson(originalBody, workingKey);

    const envelope = {
      ClientGUID: clientGuid,
      Value: value,
      Validation: validation,
      swTestOperation: false,
    };

    const upstreamResponse = await fetch(
      `${baseUrl.replace(/\/+$/, '')}/Position/ValidateP2P`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(envelope),
      },
    );

    const data = await upstreamResponse.json();

    if (!upstreamResponse.ok || data.status !== 'OK') {
      logError('account/validate-p2p-simple', new Error('Bank status not OK'), {
        statusCode: upstreamResponse.status,
        body: data,
      });
      return res.status(upstreamResponse.status).json({
        message: 'Error al validar P2P (simple) en el banco.',
        statusCode: upstreamResponse.status,
        body: data,
      });
    }

    let decrypted: unknown = null;
    try {
      decrypted = decryptJson(data.value, workingKey);
    } catch {
      decrypted = null;
    }

    return res.status(200).json({
      message: 'Validación P2P ejecutada en el banco (validate-p2p-simple).',
      rawResponse: data,
      decrypted,
    });
  } catch (error: any) {
    if (error?.code === 'NO_BANK_INTEGRATION_CONFIG') {
      return res.status(400).json({
        message:
          'No existe configuración de integración bancaria activa para este banco y servicio. Configure una integración antes de usar este endpoint.',
        code: 'NO_BANK_INTEGRATION_CONFIG',
        meta: error.meta,
      });
    }

    logError('account/validate-p2p-simple', error);
    return res.status(500).json({
      message: 'No se pudo validar P2P (simple) en el banco.',
    });
  }
},
);

// Endpoint para sincronizar historial por rango de fechas y guardar en base de datos usando integración bancaria.
router.post(
  '/history-by-date-sync',
  authTokenMiddleware,
  requirePermissions(['VIEW_TRANSACTIONS']),
  async (req, res) => {
  const { accountNumber, startDate, endDate, workingKey, bankId: bankIdFromBody } =
    req.body || {};

  if (!accountNumber || !startDate || !endDate || !workingKey) {
    return res.status(400).json({
      message:
        'Debe enviar accountNumber, startDate, endDate y workingKey en el cuerpo.',
    });
  }

  try {
    const env =
      process.env.NODE_ENV === 'production'
        ? BankEnvironment.PRODUCTION
        : BankEnvironment.SANDBOX;

    // 1) Buscar la cuenta en nuestra base de datos
    const bankAccount = await prisma.bankAccount.findUnique({
      where: { accountNumber },
    });

    if (!bankAccount) {
      return res.status(404).json({
        message:
          'La cuenta bancaria no existe en la base de datos local. Regístrela primero.',
      });
    }

    // 2) Determinar bankId para el servicio de consultas
    let bankId: number;

    if (bankIdFromBody != null) {
      bankId = Number(bankIdFromBody);
    } else if (bankAccount.bankId) {
      bankId = bankAccount.bankId;
    } else {
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
        return res.status(400).json({
          message:
            'No existe configuración de integración bancaria activa para el servicio de consultas. Configure una integración antes de usar este endpoint.',
          code: 'NO_BANK_INTEGRATION_CONFIG',
          meta: {
            environment: env,
            service: BankIntegrationService.QUERIES,
          },
        });
      }

      bankId = anyConfig.bankId;
    }

    const client = await resolveBankClient({
      bankId,
      environment: env,
      service: BankIntegrationService.QUERIES,
    });

    if (client.provider !== BankIntegrationProvider.BNC) {
      return res.status(400).json({
        message:
          'La integración configurada para este banco no soporta aún el endpoint /account/history-by-date-sync.',
      });
    }

    const bncClient = client as BncClient;

    const baseUrl = bncClient.urlBase;
    const clientGuid = bncClient.clientGuid;
    const clientIdFromConfig = bncClient.clientId;

    if (!baseUrl || !clientGuid || !clientIdFromConfig) {
      return res.status(500).json({
        message:
          'La configuración de integración bancaria para este banco no tiene urlBase, clientGuid o clientId definidos.',
      });
    }

    // 3) Armar el body para HistoryByDate
    const originalBody = {
      ClientID: clientIdFromConfig,
      AccountNumber: accountNumber,
      StartDate: startDate,
      EndDate: endDate,
      ChildClientID: null,
      BranchID: null,
    };

    const { value, validation } = encryptJson(originalBody, workingKey);

    const envelope = {
      ClientGUID: clientGuid,
      Value: value,
      Validation: validation,
      swTestOperation: false,
    };

    // 4) Llamar al banco
    const upstreamResponse = await fetch(
      `${baseUrl.replace(/\/+$/, '')}/Position/HistoryByDate`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(envelope),
      },
    );

    const data = await upstreamResponse.json();

    if (!upstreamResponse.ok || data.status !== 'OK') {
      const upstreamMessage = typeof data?.message === 'string' ? data.message : '';
      logError(
        'account/history-by-date-sync',
        new Error(upstreamMessage || 'Bank status not OK'),
        {
          statusCode: upstreamResponse.status,
          body: data,
        },
      );
      const hint =
        data?.message && String(data.message).toUpperCase().includes('RWK')
          ? ' El WorkingKey puede estar vencido (renueve con Auth/LogOn).'
          : data?.message
            ? ''
            : ' Verifique WorkingKey (vence a medianoche), fechas y cuenta.';
      return res.status(502).json({
        message:
          'Error al consultar el historial por rango de fechas (sync) en el banco.' +
          hint,
        statusCode: upstreamResponse.status,
        upstreamMessage: upstreamMessage || null,
        body: data,
      });
    }

    // 5) Desencriptar la respuesta
    let decrypted: any = null;
    try {
      decrypted = decryptJson(data.value, workingKey);
    } catch {
      decrypted = null;
    }

    if (!decrypted) {
      return res.status(500).json({
        message:
          'No se pudo desencriptar el historial por rango de fechas devuelto por el banco.',
      });
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
      return res.status(200).json({
        message:
          'Historial por rango de fechas obtenido desde el banco, pero no hay movimientos para sincronizar.',
        syncedCount: 0,
        totalFromBnc: 0,
      });
    }

    // 6) Preparar datos para inserción masiva (evitando duplicados por índice único)
    const parseDateOnly = (raw: unknown): Date | null => {
      if (!raw) return null;
      const dateStr = String(raw);

      // Formato dd/MM/yyyy
      if (dateStr.includes('/')) {
        const [day, month, year] = dateStr.split('/');
        if (!day || !month || !year) return null;
        return new Date(Number(year), Number(month) - 1, Number(day), 0, 0, 0, 0);
      }

      // Formato ISO u otros compatibles con Date
      const d = new Date(dateStr);
      if (Number.isNaN(d.getTime())) return null;
      return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
    };

    const dataToInsert: BankTransactionCreateManyInput[] = [];

    // Insertar del último al primero para este rango (respuesta del banco)
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

      const row: BankTransactionCreateManyInput = {
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
      return res.status(200).json({
        message:
          'Historial obtenido desde el banco, pero ningún movimiento tenía datos suficientes para ser sincronizado.',
        syncedCount: 0,
        totalFromBnc: movements.length,
      });
    }

    const result = await prisma.bankTransaction.createMany({
      data: dataToInsert,
      skipDuplicates: true,
    });

    void auditEvent(req, {
      context: 'account/history-by-date-sync',
      action: 'SYNC_EXECUTED',
      entityType: 'BankTransaction',
      entityId: null,
      description: 'Sincronizó historial por rango de fechas',
      metadata: {
        accountNumber,
        startDate,
        endDate,
        syncedCount: result.count,
        totalFromBnc: movements.length,
      },
    });

    return res.status(200).json({
      message:
        'Historial por rango de fechas sincronizado y almacenado en base de datos.',
      syncedCount: result.count,
      totalFromBnc: movements.length,
    });
  } catch (error: any) {
    if (error?.code === 'NO_BANK_INTEGRATION_CONFIG') {
      return res.status(400).json({
        message:
          'No existe configuración de integración bancaria activa para este banco y servicio. Configure una integración antes de usar este endpoint.',
        code: 'NO_BANK_INTEGRATION_CONFIG',
        meta: error.meta,
      });
    }

    logError('account/history-by-date-sync', error);
    return res.status(500).json({
      message:
        'No se pudo sincronizar el historial por rango de fechas con la base de datos.',
    });
  }
},
);

// Endpoint para sincronizar estado de cuenta (Position/History) y guardar en base de datos usando integración bancaria.
// Usa la misma lógica de /statement-simple pero además persiste los movimientos en BankTransaction.
router.post(
  '/statement-sync',
  authTokenMiddleware,
  requirePermissions(['VIEW_TRANSACTIONS']),
  async (req, res) => {
  const { accountNumber, workingKey, bankId: bankIdFromBody } = req.body || {};

  if (!accountNumber || !workingKey) {
    return res.status(400).json({
      message: 'Debe enviar accountNumber y workingKey en el cuerpo.',
    });
  }

  try {
    const env =
      process.env.NODE_ENV === 'production'
        ? BankEnvironment.PRODUCTION
        : BankEnvironment.SANDBOX;

    // 1) Buscar la cuenta en nuestra base de datos
    const bankAccount = await prisma.bankAccount.findUnique({
      where: { accountNumber },
    });

    if (!bankAccount) {
      return res.status(404).json({
        message:
          'La cuenta bancaria no existe en la base de datos local. Regístrela primero.',
      });
    }

    // 2) Determinar bankId para servicio de consultas
    let bankId: number;

    if (bankIdFromBody != null) {
      bankId = Number(bankIdFromBody);
    } else if (bankAccount.bankId) {
      bankId = bankAccount.bankId;
    } else {
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
        return res.status(400).json({
          message:
            'No existe configuración de integración bancaria activa para el servicio de consultas. Configure una integración antes de usar este endpoint.',
          code: 'NO_BANK_INTEGRATION_CONFIG',
          meta: {
            environment: env,
            service: BankIntegrationService.QUERIES,
          },
        });
      }

      bankId = anyConfig.bankId;
    }

    const client = await resolveBankClient({
      bankId,
      environment: env,
      service: BankIntegrationService.QUERIES,
    });

    if (client.provider !== BankIntegrationProvider.BNC) {
      return res.status(400).json({
        message:
          'La integración configurada para este banco no soporta aún el endpoint /account/statement-sync.',
      });
    }

    const bncClient = client as BncClient;

    const baseUrl = bncClient.urlBase;
    const clientGuid = bncClient.clientGuid;
    const clientIdFromConfig = bncClient.clientId;

    if (!baseUrl || !clientGuid || !clientIdFromConfig) {
      return res.status(500).json({
        message:
          'La configuración de integración bancaria para este banco no tiene urlBase, clientGuid o clientId definidos.',
      });
    }

    // 3) Armar el body para Position/History (igual que /statement-simple)
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

    // 4) Llamar al banco
    const upstreamResponse = await fetch(
      `${baseUrl.replace(/\/+$/, '')}/Position/History`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(envelope),
      },
    );

    const data = await upstreamResponse.json();

    if (!upstreamResponse.ok || data.status !== 'OK') {
      const upstreamMessage = typeof data?.message === 'string' ? data.message : '';
      logError('account/statement-sync', new Error(upstreamMessage || 'Bank status not OK'), {
        statusCode: upstreamResponse.status,
        body: data,
      });
      const hint =
        data?.message && String(data.message).toUpperCase().includes('RWK')
          ? ' El WorkingKey puede estar vencido (renueve con Auth/LogOn).'
          : data?.message
            ? ''
            : ' Verifique WorkingKey (vence a medianoche) y la cuenta.';
      return res.status(502).json({
        message: 'Error al consultar el estado de cuenta (sync) en el banco.' + hint,
        statusCode: upstreamResponse.status,
        upstreamMessage: upstreamMessage || null,
        body: data,
      });
    }

    // 5) Desencriptar la respuesta
    let decrypted: any = null;
    try {
      decrypted = decryptJson(data.value, workingKey);
    } catch {
      decrypted = null;
    }

    if (!decrypted) {
      return res.status(500).json({
        message:
          'No se pudo desencriptar el estado de cuenta devuelto por el banco.',
      });
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
      return res.status(200).json({
        message:
          'Estado de cuenta obtenido desde el banco, pero no hay movimientos para sincronizar.',
        syncedCount: 0,
        totalFromBnc: 0,
      });
    }

    // 6) Preparar datos para inserción masiva (misma lógica que history-by-date-sync)
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

    const dataToInsert: BankTransactionCreateManyInput[] = [];

    // Insertar del último al primero para este rango (respuesta del banco)
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

      const row: BankTransactionCreateManyInput = {
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
      return res.status(200).json({
        message:
          'Estado de cuenta obtenido desde el banco, pero ningún movimiento tenía datos suficientes para ser sincronizado.',
        syncedCount: 0,
        totalFromBnc: movements.length,
      });
    }

    const result = await prisma.bankTransaction.createMany({
      data: dataToInsert,
      skipDuplicates: true,
    });

    void auditEvent(req, {
      context: 'account/statement-sync',
      action: 'SYNC_EXECUTED',
      entityType: 'BankTransaction',
      entityId: null,
      description: 'Sincronizó estado de cuenta',
      metadata: {
        accountNumber,
        syncedCount: result.count,
        totalFromBnc: movements.length,
      },
    });

    return res.status(200).json({
      message: 'Estado de cuenta sincronizado y almacenado en base de datos.',
      syncedCount: result.count,
      totalFromBnc: movements.length,
    });
  } catch (error: any) {
    if (error?.code === 'NO_BANK_INTEGRATION_CONFIG') {
      return res.status(400).json({
        message:
          'No existe configuración de integración bancaria activa para este banco y servicio. Configure una integración antes de usar este endpoint.',
        code: 'NO_BANK_INTEGRATION_CONFIG',
        meta: error.meta,
      });
    }

    logError('account/statement-sync', error);
    return res.status(500).json({
      message: 'No se pudo sincronizar el estado de cuenta con la base de datos.',
    });
  }
},
);

// Endpoint "simple" para Pago Móvil P2P usando integración bancaria
router.post(
  '/p2p-simple',
  authTokenMiddleware,
  requirePermissions(['EXECUTE_P2P']),
  async (req, res) => {
  const {
    amount,
    beneficiaryBankCode,
    beneficiaryCellPhone,
    beneficiaryEmail,
    beneficiaryId,
    beneficiaryName,
    description,
    operationRef,
    workingKey,
    totpCode,
    childClientId,
    branchId,
    bankId: bankIdFromBody,
  } = req.body || {};

  if (
    amount === undefined ||
    amount === null ||
    !beneficiaryBankCode ||
    !beneficiaryCellPhone ||
    !beneficiaryId ||
    !beneficiaryName ||
    !description ||
    !operationRef ||
    !workingKey ||
    !totpCode
  ) {
    return res.status(400).json({
      message:
        'Debe enviar amount, beneficiaryBankCode, beneficiaryCellPhone, beneficiaryId, beneficiaryName, description, operationRef, workingKey y totpCode.',
    });
  }

  if (!/^\d{6}$/.test(String(totpCode))) {
    return res.status(400).json({
      message: 'totpCode inválido. Debe tener 6 dígitos.',
    });
  }

  try {
    const env =
      process.env.NODE_ENV === 'production'
        ? BankEnvironment.PRODUCTION
        : BankEnvironment.SANDBOX;

    const userId = (req as any).user?.sub as number | undefined;
    if (!userId) {
      return res.status(401).json({ message: 'Autorización requerida.' });
    }

    const authUser = await prisma.user.findUnique({
      where: { id: Number(userId) },
    });

    if (!authUser) {
      return res.status(401).json({ message: 'Token JWT inválido o expirado.' });
    }

    if (!authUser.isActive) {
      return res.status(403).json({
        message: 'Usuario inactivo. Consulte al administrador del sistema.',
      });
    }

    const config = await prisma.securityConfig.findUnique({
      where: { id: 1 },
    });

    if (!config || !config.globalTwoFactorEnabled || !config.globalTwoFactorSecretEncrypted) {
      return res.status(500).json({
        message:
          'El autenticador global 2FA no está configurado o habilitado. Configure 2FA global antes de ejecutar pagos.',
      });
    }

    const attemptKey = getTwoFactorRateLimitKey(req, authUser.id);
    if (isTwoFactorBlocked(attemptKey)) {
      return res.status(429).json({
        message: 'Demasiados intentos 2FA fallidos. Intente nuevamente más tarde.',
      });
    }

    const twoFactorSecret = decryptTwoFactorSecret(
      config.globalTwoFactorSecretEncrypted,
    );
    const twoFactorOk = verifyTotpCode(twoFactorSecret, String(totpCode));
    if (!twoFactorOk) {
      registerTwoFactorFailure(attemptKey);

      void auditEvent(req as any, {
        context: 'account/p2p-simple',
        action: '2FA_FAILED',
        entityType: 'User',
        entityId: String(authUser.id),
        userIdOverride: authUser.id,
        usernameOverride: authUser.username,
        description: 'Intento de pago P2P con 2FA inválido',
        metadata: {
          operationRef: String(operationRef ?? ''),
          amount: Number(amount ?? 0),
        },
      });

      return res.status(401).json({
        message: 'Código 2FA inválido o expirado.',
      });
    }

    clearTwoFactorFailures(attemptKey);

    // Determinar bankId para servicio C2P/P2P
    let bankId: number;

    if (bankIdFromBody != null) {
      bankId = Number(bankIdFromBody);
    } else {
      const anyConfig = await prisma.bankIntegrationConfig.findFirst({
        where: {
          environment: env,
          isActive: true,
          services: {
            some: { service: BankIntegrationService.C2P },
          },
        },
      });

      if (!anyConfig) {
        return res.status(400).json({
          message:
            'No existe configuración de integración bancaria activa para el servicio de pagos C2P/P2P. Configure una integración antes de usar este endpoint.',
          code: 'NO_BANK_INTEGRATION_CONFIG',
          meta: {
            environment: env,
            service: BankIntegrationService.C2P,
          },
        });
      }

      bankId = anyConfig.bankId;
    }

    const client = await resolveBankClient({
      bankId,
      environment: env,
      service: BankIntegrationService.C2P,
    });

    if (client.provider !== BankIntegrationProvider.BNC) {
      return res.status(400).json({
        message:
          'La integración configurada para este banco no soporta aún el endpoint /account/p2p-simple.',
      });
    }

    const bncClient = client as BncClient;

    const baseUrl = bncClient.urlBase;
    const clientGuid = bncClient.clientGuid;

    if (!baseUrl || !clientGuid) {
      return res.status(500).json({
        message:
          'La configuración de integración bancaria para este banco no tiene urlBase o clientGuid definidos.',
      });
    }

    const originalBody: Record<string, unknown> = {
      Amount: Number(amount),
      BeneficiaryBankCode: Number(beneficiaryBankCode),
      BeneficiaryCellPhone: String(beneficiaryCellPhone),
      BeneficiaryEmail: beneficiaryEmail ? String(beneficiaryEmail) : '',
      BeneficiaryID: String(beneficiaryId),
      BeneficiaryName: String(beneficiaryName),
      Description: String(description),
      OperationRef: String(operationRef),
    };

    if (childClientId) {
      originalBody.ChildClientID = String(childClientId);
    }

    if (branchId) {
      originalBody.BranchID = String(branchId);
    }

    const { value, validation } = encryptJson(originalBody, workingKey);

    const envelope = {
      ClientGUID: clientGuid,
      Value: value,
      Validation: validation,
      swTestOperation: false,
    };

    const upstreamResponse = await fetch(
      `${baseUrl.replace(/\/+$/, '')}/MobPayment/SendP2P`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(envelope),
      },
    );

    const data = await upstreamResponse.json();

    if (!upstreamResponse.ok || data.status !== 'OK') {
      logError('account/p2p-simple', new Error('Bank status not OK'), {
        statusCode: upstreamResponse.status,
        body: data,
      });

      const userId = (req as any).user?.sub as number | undefined;
      try {
        await prisma.transactionLog.create({
          data: {
            context: 'account/p2p-simple',
            operation: 'P2P_SEND',
            userId: userId ?? null,
            accountNumber: null,
            amount: Number(amount ?? 0),
            reference: String(operationRef ?? ''),
            status: String(data?.status ?? ''),
            code: String(data?.message ?? ''),
            requestPayload: req.body,
            responsePayload: data,
          },
        });
      } catch {
        // no bloquear por fallo de log
      }

      void auditEvent(req, {
        context: 'account/p2p-simple',
        action: 'PAYMENT_FAILED',
        entityType: 'Transaction',
        entityId: String(operationRef ?? ''),
        description: 'Intento de Pago Móvil P2P fallido en el banco',
        metadata: {
          amount: Number(amount ?? 0),
          bankStatus: data?.status ?? null,
          bankMessage: data?.message ?? null,
        },
      });

      return res.status(upstreamResponse.status).json({
        message: 'Error al ejecutar Pago Móvil P2P (simple) en el banco.',
        statusCode: upstreamResponse.status,
        body: data,
      });
    }

    let decrypted: unknown = null;
    try {
      decrypted = decryptJson(data.value, workingKey);
    } catch {
      decrypted = null;
    }

    try {
      const refFromDecrypted =
        decrypted && typeof decrypted === 'object' && 'Reference' in decrypted
          ? String((decrypted as any).Reference ?? '')
          : '';

      await prisma.transactionLog.create({
        data: {
          context: 'account/p2p-simple',
          operation: 'P2P_SEND',
          userId: userId ?? null,
          accountNumber: null,
          amount: Number(amount ?? 0),
          reference: refFromDecrypted || String(operationRef ?? ''),
          status: String(data?.status ?? ''),
          code: String(data?.message ?? ''),
          requestPayload: req.body,
          responsePayload: data,
        },
      });
    } catch {
      // no bloquear por fallo de log
    }

    const finalReference =
      (decrypted && typeof decrypted === 'object' && 'Reference' in decrypted
        ? String((decrypted as any).Reference ?? '')
        : '') || String(operationRef ?? '');

    void auditEvent(req, {
      context: 'account/p2p-simple',
      action: 'PAYMENT_EXECUTED',
      entityType: 'Transaction',
      entityId: finalReference || null,
      description: `Ejecutó Pago Móvil P2P por ${Number(amount).toFixed(2)}`,
      metadata: {
        amount: Number(amount),
        beneficiaryBankCode: Number(beneficiaryBankCode),
        beneficiaryCellPhone: String(beneficiaryCellPhone),
        beneficiaryEmail: beneficiaryEmail ? String(beneficiaryEmail) : null,
        beneficiaryId: String(beneficiaryId),
        beneficiaryName: String(beneficiaryName),
        description,
        operationRef: String(operationRef ?? ''),
        reference: finalReference,
        childClientId: childClientId ? String(childClientId) : null,
        branchId: branchId ? String(branchId) : null,
        bankStatus: data?.status ?? null,
        bankMessage: data?.message ?? null,
        twoFactorValidated: true,
      },
    });

    return res.status(200).json({
      message: 'Pago Móvil P2P ejecutado en el banco (simple).',
      rawResponse: data,
      decrypted,
    });
  } catch (error: any) {
    if (error?.code === 'NO_BANK_INTEGRATION_CONFIG') {
      return res.status(400).json({
        message:
          'No existe configuración de integración bancaria activa para este banco y servicio. Configure una integración antes de usar este endpoint.',
        code: 'NO_BANK_INTEGRATION_CONFIG',
        meta: error.meta,
      });
    }

    logError('account/p2p-simple', error);
    return res.status(500).json({
      message: 'No se pudo ejecutar el Pago Móvil P2P (simple) en el banco.',
    });
  }
},
);

// Endpoint "simple" para Pago Móvil C2P (transferencia comercio → persona por token) usando integración bancaria
router.post(
  '/c2p-simple',
  authTokenMiddleware,
  requirePermissions(['EXECUTE_C2P']),
  async (req, res) => {
  const {
    amount,
    debtorBankCode,
    debtorCellPhone,
    debtorId,
    token,
    workingKey,
    bankId: bankIdFromBody,
  } = req.body || {};

  if (
    amount === undefined ||
    amount === null ||
    !debtorBankCode ||
    !debtorCellPhone ||
    !debtorId ||
    !token ||
    !workingKey
  ) {
    return res.status(400).json({
      message:
        'Debe enviar amount, debtorBankCode, debtorCellPhone, debtorId, token y workingKey.',
    });
  }

  try {
    const env =
      process.env.NODE_ENV === 'production'
        ? BankEnvironment.PRODUCTION
        : BankEnvironment.SANDBOX;

    // Determinar bankId para el servicio C2P
    let bankId: number;

    if (bankIdFromBody != null) {
      bankId = Number(bankIdFromBody);
    } else {
      const anyConfig = await prisma.bankIntegrationConfig.findFirst({
        where: {
          environment: env,
          isActive: true,
          services: {
            some: { service: BankIntegrationService.C2P },
          },
        },
      });

      if (!anyConfig) {
        return res.status(400).json({
          message:
            'No existe configuración de integración bancaria activa para el servicio de pagos C2P. Configure una integración antes de usar este endpoint.',
          code: 'NO_BANK_INTEGRATION_CONFIG',
          meta: {
            environment: env,
            service: BankIntegrationService.C2P,
          },
        });
      }

      bankId = anyConfig.bankId;
    }

    const client = await resolveBankClient({
      bankId,
      environment: env,
      service: BankIntegrationService.C2P,
    });

    if (client.provider !== BankIntegrationProvider.BNC) {
      return res.status(400).json({
        message:
          'La integración configurada para este banco no soporta aún el endpoint /account/c2p-simple.',
      });
    }

    const bncClient = client as BncClient;

    const baseUrl = bncClient.urlBase;
    const clientGuid = bncClient.clientGuid;
    const terminalFromConfig = bncClient.terminalId;

    if (!baseUrl || !clientGuid || !terminalFromConfig) {
      return res.status(500).json({
        message:
          'La configuración de integración bancaria para este banco no tiene urlBase, clientGuid o terminalId definidos.',
      });
    }

    const terminal = String(terminalFromConfig).trim();

    if (!terminal) {
      return res.status(500).json({
        message:
          'El terminal es requerido en la configuración de integración bancaria para este banco.',
      });
    }

    const originalBody = {
      Amount: Number(amount),
      DebtorBankCode: Number(debtorBankCode),
      DebtorCellPhone: String(debtorCellPhone),
      DebtorID: String(debtorId),
      Token: String(token),
      Terminal: terminal,
    };

    const { value, validation } = encryptJson(originalBody, workingKey);

    const envelope = {
      ClientGUID: clientGuid,
      Value: value,
      Validation: validation,
      swTestOperation: false,
    };

    const upstreamResponse = await fetch(
      `${baseUrl.replace(/\/+$/, '')}/MobPayment/SendC2P`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(envelope),
      },
    );

    const data = await upstreamResponse.json();

    if (!upstreamResponse.ok || data.status !== 'OK') {
      logError('account/c2p-simple', new Error('Bank status not OK'), {
        statusCode: upstreamResponse.status,
        body: data,
      });
      void auditEvent(req, {
        context: 'account/c2p-simple',
        action: 'PAYMENT_FAILED',
        entityType: 'Transaction',
        entityId: token ? String(token) : null,
        description: 'Intento de transferencia C2P fallido en el banco',
        metadata: {
          amount: Number(amount ?? 0),
          bankStatus: data?.status ?? null,
          bankMessage: data?.message ?? null,
        },
      });

      return res.status(upstreamResponse.status).json({
        message: 'Error al ejecutar transferencia C2P (simple) en el banco.',
        statusCode: upstreamResponse.status,
        body: data,
      });
    }

    let decrypted: unknown = null;
    try {
      decrypted = decryptJson(data.value, workingKey);
    } catch {
      decrypted = null;
    }

    void auditEvent(req, {
      context: 'account/c2p-simple',
      action: 'PAYMENT_EXECUTED',
      entityType: 'Transaction',
      entityId: token ? String(token) : null,
      description: `Ejecutó transferencia C2P por ${Number(amount).toFixed(2)}`,
      metadata: {
        amount: Number(amount),
        debtorBankCode: Number(debtorBankCode),
        debtorCellPhone: String(debtorCellPhone),
        debtorId: String(debtorId),
        token: String(token),
        terminal,
        bankStatus: data?.status ?? null,
        bankMessage: data?.message ?? null,
      },
    });

    return res.status(200).json({
      message: 'Transferencia C2P ejecutada en el banco (simple).',
      rawResponse: data,
      decrypted,
    });
  } catch (error: any) {
    if (error?.code === 'NO_BANK_INTEGRATION_CONFIG') {
      return res.status(400).json({
        message:
          'No existe configuración de integración bancaria activa para este banco y servicio. Configure una integración antes de usar este endpoint.',
        code: 'NO_BANK_INTEGRATION_CONFIG',
        meta: error.meta,
      });
    }

    logError('account/c2p-simple', error);
    return res.status(500).json({
      message: 'No se pudo ejecutar la transferencia C2P (simple) en el banco.',
    });
  }
},
);

// Endpoint "simple" para VPOS / Punto de Venta Virtual (Transaction/Send) usando integración bancaria
router.post(
  '/vpos-simple',
  authTokenMiddleware,
  requirePermissions(['EXECUTE_VPOS']),
  async (req, res) => {
  const {
    accountType,
    amount,
    cardHolderID,
    cardHolderName,
    cardNumber,
    cardPIN,
    cvv,
    expirationDate,
    cardType,
    transactionID,
    workingKey,
    operationRef,
    childClientId,
    branchId,
    operationId,
    bankId: bankIdFromBody,
  } = req.body || {};

  if (
    !accountType ||
    amount === undefined ||
    amount === null ||
    !cardHolderID ||
    !cardHolderName ||
    !cardNumber ||
    !cvv ||
    !expirationDate ||
    !cardType ||
    !transactionID ||
    !workingKey
  ) {
    return res.status(400).json({
      message:
        'Debe enviar accountType, amount, cardHolderID, cardHolderName, cardNumber, cvv, expirationDate, cardType, transactionID y workingKey. El PIN es opcional.',
    });
  }

  try {
    const env =
      process.env.NODE_ENV === 'production'
        ? BankEnvironment.PRODUCTION
        : BankEnvironment.SANDBOX;

    // Determinar bankId para servicio VPOS
    let bankId: number;

    if (bankIdFromBody != null) {
      bankId = Number(bankIdFromBody);
    } else {
      const anyConfig = await prisma.bankIntegrationConfig.findFirst({
        where: {
          environment: env,
          isActive: true,
          services: {
            some: { service: BankIntegrationService.VPOS },
          },
        },
      });

      if (!anyConfig) {
        return res.status(400).json({
          message:
            'No existe configuración de integración bancaria activa para el servicio de pagos VPOS. Configure una integración antes de usar este endpoint.',
          code: 'NO_BANK_INTEGRATION_CONFIG',
          meta: {
            environment: env,
            service: BankIntegrationService.VPOS,
          },
        });
      }

      bankId = anyConfig.bankId;
    }

    const client = await resolveBankClient({
      bankId,
      environment: env,
      service: BankIntegrationService.VPOS,
    });

    if (client.provider !== BankIntegrationProvider.BNC) {
      return res.status(400).json({
        message:
          'La integración configurada para este banco no soporta aún el endpoint /account/vpos-simple.',
      });
    }

    const bncClient = client as BncClient;

    const baseUrl = bncClient.urlBase;
    const clientGuid = bncClient.clientGuid;
    const affiliationFromConfig = bncClient.affiliationNumber;

    if (!baseUrl || !clientGuid || !affiliationFromConfig) {
      return res.status(500).json({
        message:
          'La configuración de integración bancaria para este banco no tiene urlBase, clientGuid o affiliationNumber definidos.',
      });
    }

    const originalBody = {
      AccountType: Number(accountType), // 00, 10, 20
      AffiliationNumber: Number(affiliationFromConfig), // VPOS del comercio
      Amount: Number(amount),
      CardHolderID: Number(cardHolderID),
      CardHolderName: String(cardHolderName),
      CardNumber: String(cardNumber),
      CVV: Number(cvv),
      dtExpiration: Number(expirationDate), // ej: 122024
      idCardType: Number(cardType), // 1=VISA, 2=MC, 3=Débito
      TransactionIdentifier: String(transactionID),
    };

    if (cardPIN !== undefined && cardPIN !== null && String(cardPIN).trim() !== '') {
      (originalBody as any).CardPIN = Number(cardPIN);
    }

    if (operationRef) {
      (originalBody as any).OperationRef = String(operationRef);
    }

    if (childClientId) {
      (originalBody as any).ChildClientID = String(childClientId);
    }

    if (branchId) {
      (originalBody as any).BranchID = String(branchId);
    }

    if (operationId !== undefined && operationId !== null) {
      (originalBody as any).OperationId = Number(operationId);
    }

    const { value, validation } = encryptJson(originalBody, workingKey);

    const envelope = {
      ClientGUID: clientGuid,
      Value: value,
      Validation: validation,
      swTestOperation: false,
    };

    const upstreamResponse = await fetch(
      `${baseUrl.replace(/\/+$/, '')}/Transaction/Send`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(envelope),
      },
    );

    const rawBody = await upstreamResponse.text();

    let data: any;
    try {
      data = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      data = { status: 'KO', message: rawBody };
    }

    if (!upstreamResponse.ok || data.status !== 'OK') {
      logError('account/vpos-simple', new Error('Bank status not OK'), {
        statusCode: upstreamResponse.status,
        body: data,
      });
      void auditEvent(req, {
        context: 'account/vpos-simple',
        action: 'PAYMENT_FAILED',
        entityType: 'Transaction',
        entityId: operationId != null ? Number(operationId) : String(transactionID),
        description: 'Intento de transacción VPOS fallido en el banco',
        metadata: {
          amount: Number(amount ?? 0),
          bankStatus: data?.status ?? null,
          bankMessage: data?.message ?? null,
        },
      });

      return res
        .status(
          Number.isFinite(upstreamResponse.status) ? upstreamResponse.status : 502,
        )
        .json({
          message: 'Error al ejecutar transacción VPOS (simple) en el banco.',
          statusCode: upstreamResponse.status,
          body: data,
        });
    }

    let decrypted: unknown = null;
    try {
      decrypted = decryptJson(data.value, workingKey);
    } catch {
      decrypted = null;
    }

    void auditEvent(req, {
      context: 'account/vpos-simple',
      action: 'PAYMENT_EXECUTED',
      entityType: 'Transaction',
      entityId: operationId != null ? Number(operationId) : String(transactionID),
      description: `Ejecutó transacción VPOS por ${Number(amount).toFixed(2)}`,
      metadata: {
        accountType: Number(accountType),
        amount: Number(amount),
        cardHolderID: Number(cardHolderID),
        cardHolderName: String(cardHolderName),
        cardType: Number(cardType),
        affiliationNumber: Number(affiliationFromConfig),
        transactionID: String(transactionID),
        operationRef: operationRef ? String(operationRef) : null,
        childClientId: childClientId ? String(childClientId) : null,
        branchId: branchId ? String(branchId) : null,
        operationId: operationId != null ? Number(operationId) : null,
        bankStatus: data?.status ?? null,
        bankMessage: data?.message ?? null,
      },
    });

    return res.status(200).json({
      message: 'Transacción VPOS ejecutada en el banco (vpos-simple).',
      rawResponse: data,
      decrypted,
    });
  } catch (error: any) {
    if (error?.code === 'NO_BANK_INTEGRATION_CONFIG') {
      return res.status(400).json({
        message:
          'No existe configuración de integración bancaria activa para este banco y servicio. Configure una integración antes de usar este endpoint.',
        code: 'NO_BANK_INTEGRATION_CONFIG',
        meta: error.meta,
      });
    }

    logError('account/vpos-simple', error);
    return res.status(500).json({
      message: 'No se pudo ejecutar la transacción VPOS (simple) en el banco.',
    });
  }
},
);

// Proxy genérico para Crédito inmediato (Pagar) - espera envelope ya encriptado usando integración bancaria
router.post(
  '/immediate-credit',
  authTokenMiddleware,
  requirePermissions(['EXECUTE_IMMEDIATE_CREDIT_DEBIT']),
  async (req, res) => {
  try {
    const { bankId: bankIdFromBody } = req.body || {};

    const env =
      process.env.NODE_ENV === 'production'
        ? BankEnvironment.PRODUCTION
        : BankEnvironment.SANDBOX;

    let bankId: number;

    if (bankIdFromBody != null) {
      bankId = Number(bankIdFromBody);
    } else {
      const anyConfig = await prisma.bankIntegrationConfig.findFirst({
        where: {
          environment: env,
          isActive: true,
          services: {
            some: { service: BankIntegrationService.GENERAL },
          },
        },
      });

      if (!anyConfig) {
        return res.status(400).json({
          message:
            'No existe configuración de integración bancaria activa para el servicio de crédito inmediato. Configure una integración antes de usar este endpoint.',
          code: 'NO_BANK_INTEGRATION_CONFIG',
          meta: { environment: env, service: BankIntegrationService.GENERAL },
        });
      }

      bankId = anyConfig.bankId;
    }

    const client = await resolveBankClient({
      bankId,
      environment: env,
      service: BankIntegrationService.GENERAL,
    });

    if (client.provider !== BankIntegrationProvider.BNC) {
      return res.status(400).json({
        message:
          'La integración configurada para este banco no soporta aún el endpoint /account/immediate-credit.',
      });
    }

    const bncClient = client as BncClient;
    const baseUrl = bncClient.urlBase;
    const clientGuid = bncClient.clientGuid;

    if (!baseUrl || !clientGuid) {
      return res.status(500).json({
        message:
          'La configuración de integración bancaria para este banco no tiene urlBase o clientGuid definidos.',
      });
    }

    const bodyFromClient = req.body || {};

    const envelope = {
      ClientGUID: clientGuid,
      ...bodyFromClient,
    };

    const upstreamResponse = await fetch(
      `${baseUrl.replace(/\/+$/, '')}/ImmediateCredit/Send`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(envelope),
      },
    );

    const rawBody = await upstreamResponse.text();
    let data: any;
    try {
      data = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      data = { status: 'KO', message: rawBody };
    }

    if (!upstreamResponse.ok) {
      logError('account/immediate-credit', new Error('Bank status not OK'), {
        statusCode: upstreamResponse.status,
        body: data,
      });

      void auditEvent(req, {
        context: 'account/immediate-credit',
        action: 'PAYMENT_FAILED',
        entityType: 'ImmediateCredit',
        entityId: null,
        description: 'Intento de Crédito inmediato fallido en el banco',
        metadata: {
          bankStatus: data?.status ?? null,
          bankMessage: data?.message ?? null,
        },
      });

      return res.status(upstreamResponse.status).json({
        message: 'Error al ejecutar Crédito inmediato en el banco.',
        statusCode: upstreamResponse.status,
        body: data,
      });
    }

    void auditEvent(req, {
      context: 'account/immediate-credit',
      action: 'PAYMENT_EXECUTED',
      entityType: 'ImmediateCredit',
      entityId: null,
      description: 'Ejecutó Crédito inmediato (envelope completo)',
      metadata: {
        upstreamStatus: upstreamResponse.status,
        bankStatus: data?.status ?? null,
      },
    });

    return res.status(200).json({
      message: 'Crédito inmediato ejecutado en el banco.',
      rawResponse: data,
    });
  } catch (error: any) {
    if (error?.code === 'NO_BANK_INTEGRATION_CONFIG') {
      return res.status(400).json({
        message:
          'No existe configuración de integración bancaria activa para este banco y servicio. Configure una integración antes de usar este endpoint.',
        code: 'NO_BANK_INTEGRATION_CONFIG',
        meta: error.meta,
      });
    }
    logError('account/immediate-credit', error);
    return res.status(500).json({
      message: 'No se pudo ejecutar Crédito inmediato en el banco.',
    });
  }
},
);

// Endpoint "simple" para Crédito inmediato (Pagar): recibe payload legible + workingKey usando integración bancaria
router.post(
  '/immediate-credit-simple',
  authTokenMiddleware,
  requirePermissions(['EXECUTE_IMMEDIATE_CREDIT_DEBIT']),
  async (req, res) => {
  const { payload, workingKey, bankId: bankIdFromBody } = req.body || {};

  if (!payload || !workingKey) {
    return res.status(400).json({
      message: 'Debe enviar payload (JSON de la operación) y workingKey en el cuerpo.',
    });
  }

  try {
    const env =
      process.env.NODE_ENV === 'production'
        ? BankEnvironment.PRODUCTION
        : BankEnvironment.SANDBOX;

    let bankId: number;

    if (bankIdFromBody != null) {
      bankId = Number(bankIdFromBody);
    } else {
      const anyConfig = await prisma.bankIntegrationConfig.findFirst({
        where: {
          environment: env,
          isActive: true,
          services: {
            some: { service: BankIntegrationService.GENERAL },
          },
        },
      });

      if (!anyConfig) {
        return res.status(400).json({
          message:
            'No existe configuración de integración bancaria activa para el servicio de crédito inmediato. Configure una integración antes de usar este endpoint.',
          code: 'NO_BANK_INTEGRATION_CONFIG',
          meta: { environment: env, service: BankIntegrationService.GENERAL },
        });
      }

      bankId = anyConfig.bankId;
    }

    const client = await resolveBankClient({
      bankId,
      environment: env,
      service: BankIntegrationService.GENERAL,
    });

    if (client.provider !== BankIntegrationProvider.BNC) {
      return res.status(400).json({
        message:
          'La integración configurada para este banco no soporta aún el endpoint /account/immediate-credit-simple.',
      });
    }

    const bncClient = client as BncClient;
    const baseUrl = bncClient.urlBase;
    const clientGuid = bncClient.clientGuid;

    if (!baseUrl || !clientGuid) {
      return res.status(500).json({
        message:
          'La configuración de integración bancaria para este banco no tiene urlBase o clientGuid definidos.',
      });
    }

    const { value, validation } = encryptJson(payload, workingKey);

    const envelope = {
      ClientGUID: clientGuid,
      Value: value,
      Validation: validation,
      swTestOperation: false,
    };

    const upstreamResponse = await fetch(
      `${baseUrl.replace(/\/+$/, '')}/ImmediateCredit/Send`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(envelope),
      },
    );

    const rawBody = await upstreamResponse.text();
    let data: any;
    try {
      data = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      data = { status: 'KO', message: rawBody };
    }

    if (!upstreamResponse.ok) {
      logError('account/immediate-credit-simple', new Error('Bank status not OK'), {
        statusCode: upstreamResponse.status,
        body: data,
      });

      void auditEvent(req, {
        context: 'account/immediate-credit-simple',
        action: 'PAYMENT_FAILED',
        entityType: 'ImmediateCredit',
        entityId: null,
        description: 'Intento de Crédito inmediato (simple) fallido en el banco',
        metadata: {
          bankStatus: data?.status ?? null,
          bankMessage: data?.message ?? null,
        },
      });

      return res.status(upstreamResponse.status).json({
        message: 'Error al ejecutar Crédito inmediato (simple) en el banco.',
        statusCode: upstreamResponse.status,
        body: data,
      });
    }

    let decrypted: unknown = null;
    try {
      if (data.value) {
        decrypted = decryptJson(data.value, workingKey);
      }
    } catch {
      decrypted = null;
    }

    void auditEvent(req, {
      context: 'account/immediate-credit-simple',
      action: 'PAYMENT_EXECUTED',
      entityType: 'ImmediateCredit',
      entityId: null,
      description: 'Ejecutó Crédito inmediato (simple)',
      metadata: {
        upstreamStatus: upstreamResponse.status,
        bankStatus: data?.status ?? null,
      },
    });

    return res.status(200).json({
      message: 'Crédito inmediato ejecutado en el banco (immediate-credit-simple).',
      rawResponse: data,
      decrypted,
    });
  } catch (error: any) {
    if (error?.code === 'NO_BANK_INTEGRATION_CONFIG') {
      return res.status(400).json({
        message:
          'No existe configuración de integración bancaria activa para este banco y servicio. Configure una integración antes de usar este endpoint.',
        code: 'NO_BANK_INTEGRATION_CONFIG',
        meta: error.meta,
      });
    }
    logError('account/immediate-credit-simple', error);
    return res.status(500).json({
      message: 'No se pudo ejecutar Crédito inmediato (simple) en el banco.',
    });
  }
},
);

// Proxy genérico para Débito inmediato (Cobrar) - espera envelope ya encriptado usando integración bancaria
router.post(
  '/immediate-debit',
  authTokenMiddleware,
  requirePermissions(['EXECUTE_IMMEDIATE_CREDIT_DEBIT']),
  async (req, res) => {
  try {
    const { bankId: bankIdFromBody } = req.body || {};

    const env =
      process.env.NODE_ENV === 'production'
        ? BankEnvironment.PRODUCTION
        : BankEnvironment.SANDBOX;

    let bankId: number;

    if (bankIdFromBody != null) {
      bankId = Number(bankIdFromBody);
    } else {
      const anyConfig = await prisma.bankIntegrationConfig.findFirst({
        where: {
          environment: env,
          isActive: true,
          services: {
            some: { service: BankIntegrationService.GENERAL },
          },
        },
      });

      if (!anyConfig) {
        return res.status(400).json({
          message:
            'No existe configuración de integración bancaria activa para el servicio de débito inmediato. Configure una integración antes de usar este endpoint.',
          code: 'NO_BANK_INTEGRATION_CONFIG',
          meta: { environment: env, service: BankIntegrationService.GENERAL },
        });
      }

      bankId = anyConfig.bankId;
    }

    const client = await resolveBankClient({
      bankId,
      environment: env,
      service: BankIntegrationService.GENERAL,
    });

    if (client.provider !== BankIntegrationProvider.BNC) {
      return res.status(400).json({
        message:
          'La integración configurada para este banco no soporta aún el endpoint /account/immediate-debit.',
      });
    }

    const bncClient = client as BncClient;
    const baseUrl = bncClient.urlBase;
    const clientGuid = bncClient.clientGuid;

    if (!baseUrl || !clientGuid) {
      return res.status(500).json({
        message:
          'La configuración de integración bancaria para este banco no tiene urlBase o clientGuid definidos.',
      });
    }

    const bodyFromClient = req.body || {};

    const envelope = {
      ClientGUID: clientGuid,
      ...bodyFromClient,
    };

    const upstreamResponse = await fetch(
      `${baseUrl.replace(/\/+$/, '')}/ImmediateDebit/Send`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(envelope),
      },
    );

    const rawBody = await upstreamResponse.text();
    let data: any;
    try {
      data = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      data = { status: 'KO', message: rawBody };
    }

    if (!upstreamResponse.ok) {
      logError('account/immediate-debit', new Error('Bank status not OK'), {
        statusCode: upstreamResponse.status,
        body: data,
      });

      void auditEvent(req, {
        context: 'account/immediate-debit',
        action: 'DEBIT_FAILED',
        entityType: 'ImmediateDebit',
        entityId: null,
        description: 'Intento de Débito inmediato fallido en el banco',
        metadata: {
          bankStatus: data?.status ?? null,
          bankMessage: data?.message ?? null,
        },
      });

      return res.status(upstreamResponse.status).json({
        message: 'Error al ejecutar Débito inmediato en el banco.',
        statusCode: upstreamResponse.status,
        body: data,
      });
    }

    void auditEvent(req, {
      context: 'account/immediate-debit',
      action: 'DEBIT_EXECUTED',
      entityType: 'ImmediateDebit',
      entityId: null,
      description: 'Ejecutó Débito inmediato (envelope completo)',
      metadata: {
        upstreamStatus: upstreamResponse.status,
        bankStatus: data?.status ?? null,
      },
    });

    return res.status(200).json({
      message: 'Débito inmediato ejecutado en el banco.',
      rawResponse: data,
    });
  } catch (error: any) {
    if (error?.code === 'NO_BANK_INTEGRATION_CONFIG') {
      return res.status(400).json({
        message:
          'No existe configuración de integración bancaria activa para este banco y servicio. Configure una integración antes de usar este endpoint.',
        code: 'NO_BANK_INTEGRATION_CONFIG',
        meta: error.meta,
      });
    }
    logError('account/immediate-debit', error);
    return res.status(500).json({
      message: 'No se pudo ejecutar Débito inmediato en el banco.',
    });
  }
},
);

// Endpoint "simple" para Débito inmediato (Cobrar): recibe payload legible + workingKey usando integración bancaria
router.post(
  '/immediate-debit-simple',
  authTokenMiddleware,
  requirePermissions(['EXECUTE_IMMEDIATE_CREDIT_DEBIT']),
  async (req, res) => {
  const { payload, workingKey, bankId: bankIdFromBody } = req.body || {};

  if (!payload || !workingKey) {
    return res.status(400).json({
      message: 'Debe enviar payload (JSON de la operación) y workingKey en el cuerpo.',
    });
  }

  try {
    const env =
      process.env.NODE_ENV === 'production'
        ? BankEnvironment.PRODUCTION
        : BankEnvironment.SANDBOX;

    let bankId: number;

    if (bankIdFromBody != null) {
      bankId = Number(bankIdFromBody);
    } else {
      const anyConfig = await prisma.bankIntegrationConfig.findFirst({
        where: {
          environment: env,
          isActive: true,
          services: {
            some: { service: BankIntegrationService.GENERAL },
          },
        },
      });

      if (!anyConfig) {
        return res.status(400).json({
          message:
            'No existe configuración de integración bancaria activa para el servicio de débito inmediato. Configure una integración antes de usar este endpoint.',
          code: 'NO_BANK_INTEGRATION_CONFIG',
          meta: { environment: env, service: BankIntegrationService.GENERAL },
        });
      }

      bankId = anyConfig.bankId;
    }

    const client = await resolveBankClient({
      bankId,
      environment: env,
      service: BankIntegrationService.GENERAL,
    });

    if (client.provider !== BankIntegrationProvider.BNC) {
      return res.status(400).json({
        message:
          'La integración configurada para este banco no soporta aún el endpoint /account/immediate-debit-simple.',
      });
    }

    const bncClient = client as BncClient;
    const baseUrl = bncClient.urlBase;
    const clientGuid = bncClient.clientGuid;

    if (!baseUrl || !clientGuid) {
      return res.status(500).json({
        message:
          'La configuración de integración bancaria para este banco no tiene urlBase o clientGuid definidos.',
      });
    }

    const { value, validation } = encryptJson(payload, workingKey);

    const envelope = {
      ClientGUID: clientGuid,
      Value: value,
      Validation: validation,
      swTestOperation: false,
    };

    const upstreamResponse = await fetch(
      `${baseUrl.replace(/\/+$/, '')}/ImmediateDebit/Send`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(envelope),
      },
    );

    const rawBody = await upstreamResponse.text();
    let data: any;
    try {
      data = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      data = { status: 'KO', message: rawBody };
    }

    if (!upstreamResponse.ok) {
      logError('account/immediate-debit-simple', new Error('Bank status not OK'), {
        statusCode: upstreamResponse.status,
        body: data,
      });

      void auditEvent(req, {
        context: 'account/immediate-debit-simple',
        action: 'DEBIT_FAILED',
        entityType: 'ImmediateDebit',
        entityId: null,
        description: 'Intento de Débito inmediato (simple) fallido en el banco',
        metadata: {
          bankStatus: data?.status ?? null,
          bankMessage: data?.message ?? null,
        },
      });

      return res.status(upstreamResponse.status).json({
        message: 'Error al ejecutar Débito inmediato (simple) en el banco.',
        statusCode: upstreamResponse.status,
        body: data,
      });
    }

    let decrypted: unknown = null;
    try {
      if (data.value) {
        decrypted = decryptJson(data.value, workingKey);
      }
    } catch {
      decrypted = null;
    }

    void auditEvent(req, {
      context: 'account/immediate-debit-simple',
      action: 'DEBIT_EXECUTED',
      entityType: 'ImmediateDebit',
      entityId: null,
      description: 'Ejecutó Débito inmediato (simple)',
      metadata: {
        upstreamStatus: upstreamResponse.status,
        bankStatus: data?.status ?? null,
      },
    });

    return res.status(200).json({
      message: 'Débito inmediato ejecutado en el banco (immediate-debit-simple).',
      rawResponse: data,
      decrypted,
    });
  } catch (error: any) {
    if (error?.code === 'NO_BANK_INTEGRATION_CONFIG') {
      return res.status(400).json({
        message:
          'No existe configuración de integración bancaria activa para este banco y servicio. Configure una integración antes de usar este endpoint.',
        code: 'NO_BANK_INTEGRATION_CONFIG',
        meta: error.meta,
      });
    }
    logError('account/immediate-debit-simple', error);
    return res.status(500).json({
      message: 'No se pudo ejecutar Débito inmediato (simple) en el banco.',
    });
  }
},
);

// Proxy para consultar estado de operaciones de Crédito/Débito inmediato usando integración bancaria
router.post(
  '/immediate-status',
  authTokenMiddleware,
  requirePermissions(['EXECUTE_IMMEDIATE_CREDIT_DEBIT']),
  async (req, res) => {
  try {
    const { bankId: bankIdFromBody } = req.body || {};

    const env =
      process.env.NODE_ENV === 'production'
        ? BankEnvironment.PRODUCTION
        : BankEnvironment.SANDBOX;

    let bankId: number;

    if (bankIdFromBody != null) {
      bankId = Number(bankIdFromBody);
    } else {
      const anyConfig = await prisma.bankIntegrationConfig.findFirst({
        where: {
          environment: env,
          isActive: true,
          services: {
            some: { service: BankIntegrationService.GENERAL },
          },
        },
      });

      if (!anyConfig) {
        return res.status(400).json({
          message:
            'No existe configuración de integración bancaria activa para el servicio de estado de pagos inmediatos. Configure una integración antes de usar este endpoint.',
          code: 'NO_BANK_INTEGRATION_CONFIG',
          meta: { environment: env, service: BankIntegrationService.GENERAL },
        });
      }

      bankId = anyConfig.bankId;
    }

    const client = await resolveBankClient({
      bankId,
      environment: env,
      service: BankIntegrationService.GENERAL,
    });

    if (client.provider !== BankIntegrationProvider.BNC) {
      return res.status(400).json({
        message:
          'La integración configurada para este banco no soporta aún el endpoint /account/immediate-status.',
      });
    }

    const bncClient = client as BncClient;
    const baseUrl = bncClient.urlBase;
    const clientGuid = bncClient.clientGuid;

    if (!baseUrl || !clientGuid) {
      return res.status(500).json({
        message:
          'La configuración de integración bancaria para este banco no tiene urlBase o clientGuid definidos.',
      });
    }

    const bodyFromClient = req.body || {};

    const envelope = {
      ClientGUID: clientGuid,
      ...bodyFromClient,
    };

    const upstreamResponse = await fetch(
      `${baseUrl.replace(/\/+$/, '')}/ImmediatePayments/Status`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(envelope),
      },
    );

    const rawBody = await upstreamResponse.text();
    let data: any;
    try {
      data = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      data = { status: 'KO', message: rawBody };
    }

    if (!upstreamResponse.ok) {
      logError('account/immediate-status', new Error('Bank status not OK'), {
        statusCode: upstreamResponse.status,
        body: data,
      });
      return res.status(upstreamResponse.status).json({
        message: 'Error al consultar estado de Crédito/Débito inmediato en el banco.',
        statusCode: upstreamResponse.status,
        body: data,
      });
    }

    void auditEvent(req, {
      context: 'account/immediate-status',
      action: 'STATUS_QUERY',
      entityType: 'ImmediatePayment',
      entityId: null,
      description: 'Consultó estado de Crédito/Débito inmediato (envelope completo)',
      metadata: {
        upstreamStatus: upstreamResponse.status,
        bankStatus: data?.status ?? null,
      },
    });

    return res.status(200).json({
      message: 'Estado de operación de Crédito/Débito inmediato obtenido del banco.',
      rawResponse: data,
    });
  } catch (error: any) {
    if (error?.code === 'NO_BANK_INTEGRATION_CONFIG') {
      return res.status(400).json({
        message:
          'No existe configuración de integración bancaria activa para este banco y servicio. Configure una integración antes de usar este endpoint.',
        code: 'NO_BANK_INTEGRATION_CONFIG',
        meta: error.meta,
      });
    }
    logError('account/immediate-status', error);
    return res.status(500).json({
      message:
        'No se pudo consultar el estado de la operación de Crédito/Débito inmediato en el banco.',
    });
  }
},
);

// Endpoint "simple" para consultar estado de Crédito/Débito inmediato
// Recibe payload legible (según doc de ImmediatePayments/Status) + workingKey usando integración bancaria
router.post(
  '/immediate-status-simple',
  authTokenMiddleware,
  requirePermissions(['EXECUTE_IMMEDIATE_CREDIT_DEBIT']),
  async (req, res) => {
  const { payload, workingKey, bankId: bankIdFromBody } = req.body || {};

  if (!payload || !workingKey) {
    return res.status(400).json({
      message: 'Debe enviar payload (JSON de la consulta) y workingKey en el cuerpo.',
    });
  }

  try {
    const env =
      process.env.NODE_ENV === 'production'
        ? BankEnvironment.PRODUCTION
        : BankEnvironment.SANDBOX;

    let bankId: number;

    if (bankIdFromBody != null) {
      bankId = Number(bankIdFromBody);
    } else {
    const anyConfig = await prisma.bankIntegrationConfig.findFirst({
      where: {
        environment: env,
        isActive: true,
        services: {
          some: { service: BankIntegrationService.GENERAL },
        },
      },
    });

      if (!anyConfig) {
        return res.status(400).json({
          message:
            'No existe configuración de integración bancaria activa para el servicio de estado de pagos inmediatos. Configure una integración antes de usar este endpoint.',
          code: 'NO_BANK_INTEGRATION_CONFIG',
          meta: { environment: env, service: BankIntegrationService.GENERAL },
        });
      }

      bankId = anyConfig.bankId;
    }

    const client = await resolveBankClient({
      bankId,
      environment: env,
      service: BankIntegrationService.GENERAL,
    });

    if (client.provider !== BankIntegrationProvider.BNC) {
      return res.status(400).json({
        message:
          'La integración configurada para este banco no soporta aún el endpoint /account/immediate-status-simple.',
      });
    }

    const bncClient = client as BncClient;
    const baseUrl = bncClient.urlBase;
    const clientGuid = bncClient.clientGuid;

    if (!baseUrl || !clientGuid) {
      return res.status(500).json({
        message:
          'La configuración de integración bancaria para este banco no tiene urlBase o clientGuid definidos.',
      });
    }

    const { value, validation } = encryptJson(payload, workingKey);

    const envelope = {
      ClientGUID: clientGuid,
      Value: value,
      Validation: validation,
      swTestOperation: false,
    };

    const upstreamResponse = await fetch(
      `${baseUrl.replace(/\/+$/, '')}/ImmediatePayments/Status`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(envelope),
      },
    );

    const rawBody = await upstreamResponse.text();
    let data: any;
    try {
      data = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      data = { status: 'KO', message: rawBody };
    }

    if (!upstreamResponse.ok) {
      logError('account/immediate-status-simple', new Error('Bank status not OK'), {
        statusCode: upstreamResponse.status,
        body: data,
      });
      return res.status(upstreamResponse.status).json({
        message:
          'Error al consultar estado de Crédito/Débito inmediato (simple) en el banco.',
        statusCode: upstreamResponse.status,
        body: data,
      });
    }

    let decrypted: unknown = null;
    try {
      if (data.value) {
        decrypted = decryptJson(data.value, workingKey);
      }
    } catch {
      decrypted = null;
    }

    void auditEvent(req, {
      context: 'account/immediate-status-simple',
      action: 'STATUS_QUERY',
      entityType: 'ImmediatePayment',
      entityId: null,
      description: 'Consultó estado de Crédito/Débito inmediato (simple)',
      metadata: {
        upstreamStatus: upstreamResponse.status,
        bankStatus: data?.status ?? null,
      },
    });

    return res.status(200).json({
      message:
        'Estado de Crédito/Débito inmediato obtenido en el banco (immediate-status-simple).',
      rawResponse: data,
      decrypted,
    });
  } catch (error: any) {
    if (error?.code === 'NO_BANK_INTEGRATION_CONFIG') {
      return res.status(400).json({
        message:
          'No existe configuración de integración bancaria activa para este banco y servicio. Configure una integración antes de usar este endpoint.',
        code: 'NO_BANK_INTEGRATION_CONFIG',
        meta: error.meta,
      });
    }
    logError('account/immediate-status-simple', error);
    return res.status(500).json({
      message:
        'No se pudo consultar el estado de la operación de Crédito/Débito inmediato (simple) en el banco.',
    });
  }
},
);

export default router;

