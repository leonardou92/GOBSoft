import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { decryptJson, encryptJson } from '../utils/bncCrypto';
import { logError } from '../utils/logger';

const router = Router();

// Proxy directo: espera envelope ya encriptado (Value + Validation)
router.post('/statement', async (req, res) => {
  const baseUrl = process.env.BNC_URL_BASE;
  const clientGuid = process.env.BNC_CLIENT_GUID;

  if (!baseUrl || !clientGuid) {
    return res.status(500).json({
      message: 'Faltan variables de entorno BNC_URL_BASE o BNC_CLIENT_GUID.',
    });
  }

  try {
    const bodyFromClient = req.body || {};

    const envelope = {
      ClientGUID: clientGuid,
      ...bodyFromClient,
    };

    const upstreamResponse = await fetch(`${baseUrl}/Position/History`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(envelope),
    });

    const data = await upstreamResponse.json().catch(() => null);

    if (!upstreamResponse.ok) {
      return res.status(upstreamResponse.status).json({
        message: 'Error al consultar el estado de cuenta en el BNC.',
        statusCode: upstreamResponse.status,
        body: data,
      });
    }

    return res.status(200).json({
      message: 'Estado de cuenta obtenido desde el BNC.',
      rawResponse: data,
    });
  } catch (error) {
    logError('account/statement', error);
    return res.status(500).json({
      message: 'No se pudo obtener el estado de cuenta desde el BNC.',
    });
  }
});

// Endpoint "simple": recibe datos legibles y WorkingKey y arma el envelope.
router.post('/statement-simple', async (req, res) => {
  const baseUrl = process.env.BNC_URL_BASE;
  const clientGuid = process.env.BNC_CLIENT_GUID;
  const clientIdFromEnv = process.env.BNC_CLIENT_ID;

  if (!baseUrl || !clientGuid || !clientIdFromEnv) {
    return res.status(500).json({
      message:
        'Faltan variables de entorno BNC_URL_BASE, BNC_CLIENT_GUID o BNC_CLIENT_ID.',
    });
  }

  const { accountNumber, workingKey } = req.body || {};

  if (!accountNumber || !workingKey) {
    return res.status(400).json({
      message: 'Debe enviar accountNumber y workingKey en el cuerpo.',
    });
  }

  try {
    const originalBody = {
      AccountNumber: accountNumber,
      ClientID: clientIdFromEnv,
    };

    const { value, validation } = encryptJson(originalBody, workingKey);

    const envelope = {
      ClientGUID: clientGuid,
      Value: value,
      Validation: validation,
      swTestOperation: false,
    };

    const upstreamResponse = await fetch(`${baseUrl}/Position/History`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(envelope),
    });

    const data = await upstreamResponse.json();

    if (!upstreamResponse.ok || data.status !== 'OK') {
      logError('account/statement-simple', new Error('BNC status not OK'), {
        statusCode: upstreamResponse.status,
        body: data,
      });
      return res.status(upstreamResponse.status).json({
        message: 'Error al consultar el estado de cuenta (simple) en el BNC.',
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
      message: 'Estado de cuenta obtenido desde el BNC (simple).',
      rawResponse: data,
      decrypted,
    });
  } catch (error) {
    logError('account/statement-simple', error);
    return res.status(500).json({
      message: 'No se pudo obtener el estado de cuenta (simple) desde el BNC.',
    });
  }
});

// Endpoint "simple" para Historial por rango de fechas (máx 31 días).
router.post('/history-by-date-simple', async (req, res) => {
  const baseUrl = process.env.BNC_URL_BASE;
  const clientGuid = process.env.BNC_CLIENT_GUID;
  const clientIdFromEnv = process.env.BNC_CLIENT_ID;

  if (!baseUrl || !clientGuid || !clientIdFromEnv) {
    return res.status(500).json({
      message:
        'Faltan variables de entorno BNC_URL_BASE, BNC_CLIENT_GUID o BNC_CLIENT_ID.',
    });
  }

  const { accountNumber, startDate, endDate, workingKey, childClientId, branchId } =
    req.body || {};

  if (!accountNumber || !startDate || !endDate || !workingKey) {
    return res.status(400).json({
      message:
        'Debe enviar accountNumber, startDate, endDate y workingKey en el cuerpo.',
    });
  }

  try {
    const originalBody: Record<string, unknown> = {
      ClientID: clientIdFromEnv,
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

    const upstreamResponse = await fetch(`${baseUrl}/Position/HistoryByDate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(envelope),
    });

    const data = await upstreamResponse.json();

    if (!upstreamResponse.ok || data.status !== 'OK') {
      logError('account/history-by-date-simple', new Error('BNC status not OK'), {
        statusCode: upstreamResponse.status,
        body: data,
      });
      return res.status(upstreamResponse.status).json({
        message:
          'Error al consultar el historial por rango de fechas (simple) en el BNC.',
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
        'Historial por rango de fechas obtenido desde el BNC (history-by-date-simple).',
      rawResponse: data,
      decrypted,
    });
  } catch (error) {
    logError('account/history-by-date-simple', error);
    return res.status(500).json({
      message:
        'No se pudo obtener el historial por rango de fechas (simple) desde el BNC.',
    });
  }
});

// Endpoint "simple" para consultar saldo actual (Position/Current)
router.post('/balance-simple', async (req, res) => {
  const baseUrl = process.env.BNC_URL_BASE;
  const clientGuid = process.env.BNC_CLIENT_GUID;
  const clientIdFromEnv = process.env.BNC_CLIENT_ID;

  if (!baseUrl || !clientGuid || !clientIdFromEnv) {
    return res.status(500).json({
      message:
        'Faltan variables de entorno BNC_URL_BASE, BNC_CLIENT_GUID o BNC_CLIENT_ID.',
    });
  }

  const { workingKey, clientId } = req.body || {};

  if (!workingKey) {
    return res.status(400).json({
      message: 'Debe enviar workingKey en el cuerpo.',
    });
  }

  const effectiveClientId = String(clientId || clientIdFromEnv);

  try {
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

    const upstreamResponse = await fetch(`${baseUrl}/Position/Current`, {
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
  } catch (error) {
    logError('account/balance-simple', error);
    return res.status(500).json({
      message: 'No se pudo consultar el saldo actual (simple) en el BNC.',
    });
  }
});

// Endpoint "simple" para Validar P2P (Position/ValidateP2P)
router.post('/validate-p2p-simple', async (req, res) => {
  const baseUrl = process.env.BNC_URL_BASE;
  const clientGuid = process.env.BNC_CLIENT_GUID;
  const clientIdFromEnv = process.env.BNC_CLIENT_ID;
  const defaultBankCode = process.env.BNC_DEFAULT_BANK_CODE;
  const childClientIdEnv = process.env.BNC_CHILD_CLIENT_ID;
  const branchIdEnv = process.env.BNC_BRANCH_ID;

  if (!baseUrl || !clientGuid || !clientIdFromEnv || !defaultBankCode) {
    return res.status(500).json({
      message:
        'Faltan variables de entorno BNC_URL_BASE, BNC_CLIENT_GUID, BNC_CLIENT_ID o BNC_DEFAULT_BANK_CODE.',
    });
  }

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

  const effectiveBankCode = Number(bankCode ?? defaultBankCode);
  const effectiveClientId = String(clientId ?? clientIdFromEnv);
  const effectiveChildClientId =
    (childClientId && String(childClientId).trim()) ||
    (childClientIdEnv && String(childClientIdEnv).trim()) ||
    undefined;
  const effectiveBranchId =
    (branchId && String(branchId).trim()) ||
    (branchIdEnv && String(branchIdEnv).trim()) ||
    undefined;

  try {
    const originalBody: Record<string, unknown> = {
      AccountNumber: String(accountNumber),
      Amount: Number(amount),
      BankCode: effectiveBankCode,
      ClientID: effectiveClientId,
      PhoneNumber: String(phoneNumber),
      Reference: String(reference),
      RequestDate: String(requestDate),
    };

    if (effectiveChildClientId) {
      originalBody.ChildClientID = effectiveChildClientId;
    }

    if (effectiveBranchId) {
      originalBody.BranchID = effectiveBranchId;
    }

    const { value, validation } = encryptJson(originalBody, workingKey);

    const envelope = {
      ClientGUID: clientGuid,
      Value: value,
      Validation: validation,
      swTestOperation: false,
    };

    const upstreamResponse = await fetch(`${baseUrl}/Position/ValidateP2P`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(envelope),
    });

    const data = await upstreamResponse.json();

    if (!upstreamResponse.ok || data.status !== 'OK') {
      logError('account/validate-p2p-simple', new Error('BNC status not OK'), {
        statusCode: upstreamResponse.status,
        body: data,
      });
      return res.status(upstreamResponse.status).json({
        message: 'Error al validar P2P (simple) en el BNC.',
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
      message: 'Validación P2P ejecutada en el BNC (validate-p2p-simple).',
      rawResponse: data,
      decrypted,
    });
  } catch (error) {
    logError('account/validate-p2p-simple', error);
    return res.status(500).json({
      message: 'No se pudo validar P2P (simple) en el BNC.',
    });
  }
});

// Endpoint para sincronizar historial por rango de fechas y guardar en base de datos.
router.post('/history-by-date-sync', async (req, res) => {
  const baseUrl = process.env.BNC_URL_BASE;
  const clientGuid = process.env.BNC_CLIENT_GUID;
  const clientIdFromEnv = process.env.BNC_CLIENT_ID;

  if (!baseUrl || !clientGuid || !clientIdFromEnv) {
    return res.status(500).json({
      message:
        'Faltan variables de entorno BNC_URL_BASE, BNC_CLIENT_GUID o BNC_CLIENT_ID.',
    });
  }

  const { accountNumber, startDate, endDate, workingKey } = req.body || {};

  if (!accountNumber || !startDate || !endDate || !workingKey) {
    return res.status(400).json({
      message:
        'Debe enviar accountNumber, startDate, endDate y workingKey en el cuerpo.',
    });
  }

  try {
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

    // 2) Armar el body para HistoryByDate
    const originalBody = {
      ClientID: clientIdFromEnv,
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

    // 3) Llamar al BNC
    const upstreamResponse = await fetch(`${baseUrl}/Position/HistoryByDate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(envelope),
    });

    const data = await upstreamResponse.json();

    if (!upstreamResponse.ok || data.status !== 'OK') {
      logError('account/history-by-date-sync', new Error('BNC status not OK'), {
        statusCode: upstreamResponse.status,
        body: data,
      });
      return res.status(upstreamResponse.status).json({
        message:
          'Error al consultar el historial por rango de fechas (sync) en el BNC.',
        statusCode: upstreamResponse.status,
        body: data,
      });
    }

    // 4) Desencriptar la respuesta
    let decrypted: any = null;
    try {
      decrypted = decryptJson(data.value, workingKey);
    } catch {
      decrypted = null;
    }

    if (!decrypted) {
      return res.status(500).json({
        message:
          'No se pudo desencriptar el historial por rango de fechas devuelto por el BNC.',
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
          'Historial por rango de fechas obtenido desde el BNC, pero no hay movimientos para sincronizar.',
        syncedCount: 0,
        totalFromBnc: 0,
      });
    }

    // 5) Preparar datos para inserción masiva (evitando duplicados por índice único)
    const parseDate = (raw: unknown): Date | null => {
      if (!raw) return null;
      const dateStr = String(raw);

      // Formato dd/MM/yyyy
      if (dateStr.includes('/')) {
        const [day, month, year] = dateStr.split('/');
        if (!day || !month || !year) return null;
        return new Date(
          Number(year),
          Number(month) - 1,
          Number(day),
          0,
          0,
          0,
          0,
        );
      }

      // Formato ISO u otros compatibles con Date
      const d = new Date(dateStr);
      return Number.isNaN(d.getTime()) ? null : d;
    };

    const dataToInsert = movements
      .map((m) => {
        const movementDate = parseDate(m.Date);
        const amount = m.Amount !== undefined && m.Amount !== null ? Number(m.Amount) : null;
        const type = m.Type !== undefined && m.Type !== null ? String(m.Type) : null;

        // Si faltan campos clave para identificar el movimiento, lo ignoramos
        if (!movementDate || amount === null || !type) {
          return null;
        }

        const upperType = String(type).toUpperCase();
        const upperConcept = String(m.Concept ?? '').toUpperCase();
        const upperBalanceDelta = String(m.BalanceDelta ?? '').toUpperCase();

        let kind: 'TRF' | 'DEP' | 'P2P' = 'TRF';

        if (upperType.includes('PAGO MOVIL') || upperConcept.includes('PAGO MOVIL')) {
          kind = 'P2P';
        } else if (upperBalanceDelta === 'INGRESO') {
          kind = 'DEP';
        } else {
          kind = 'TRF';
        }

        return {
          bankAccountId: bankAccount.id,
          accountNumber,
          movementDate,
          controlNumber: String(m.ControlNumber ?? ''),
          amount,
          code: String(m.Code ?? ''),
          bankCode: String(m.BankCode ?? ''),
          debtorInstrument:
            m.DebtorInstrument !== undefined && m.DebtorInstrument !== null
              ? String(m.DebtorInstrument)
              : null,
          concept: String(m.Concept ?? ''),
          type,
          balanceDelta: String(m.BalanceDelta ?? ''),
          referenceA:
            m.ReferenceA !== undefined && m.ReferenceA !== null
              ? String(m.ReferenceA)
              : null,
          referenceB:
            m.ReferenceB !== undefined && m.ReferenceB !== null
              ? String(m.ReferenceB)
              : null,
          referenceC:
            m.ReferenceC !== undefined && m.ReferenceC !== null
              ? String(m.ReferenceC)
              : null,
          referenceD:
            m.ReferenceD !== undefined && m.ReferenceD !== null
              ? String(m.ReferenceD)
              : null,
          kind,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    if (dataToInsert.length === 0) {
      return res.status(200).json({
        message:
          'Historial obtenido desde el BNC, pero ningún movimiento tenía datos suficientes para ser sincronizado.',
        syncedCount: 0,
        totalFromBnc: movements.length,
      });
    }

    const result = await prisma.bankTransaction.createMany({
      data: dataToInsert,
      skipDuplicates: true,
    });

    return res.status(200).json({
      message:
        'Historial por rango de fechas sincronizado y almacenado en base de datos.',
      syncedCount: result.count,
      totalFromBnc: movements.length,
    });
  } catch (error) {
    logError('account/history-by-date-sync', error);
    return res.status(500).json({
      message:
        'No se pudo sincronizar el historial por rango de fechas con la base de datos.',
    });
  }
});

// Endpoint "simple" para Pago Móvil P2P
router.post('/p2p-simple', async (req, res) => {
  const baseUrl = process.env.BNC_URL_BASE;
  const clientGuid = process.env.BNC_CLIENT_GUID;

  if (!baseUrl || !clientGuid) {
    return res.status(500).json({
      message: 'Faltan variables de entorno BNC_URL_BASE o BNC_CLIENT_GUID.',
    });
  }

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
    childClientId,
    branchId,
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
    !workingKey
  ) {
    return res.status(400).json({
      message:
        'Debe enviar amount, beneficiaryBankCode, beneficiaryCellPhone, beneficiaryId, beneficiaryName, description, operationRef y workingKey.',
    });
  }

  try {
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

    const upstreamResponse = await fetch(`${baseUrl}/MobPayment/SendP2P`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(envelope),
    });

    const data = await upstreamResponse.json();

    if (!upstreamResponse.ok || data.status !== 'OK') {
      logError('account/p2p-simple', new Error('BNC status not OK'), {
        statusCode: upstreamResponse.status,
        body: data,
      });
      return res.status(upstreamResponse.status).json({
        message: 'Error al ejecutar Pago Móvil P2P (simple) en el BNC.',
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
      message: 'Pago Móvil P2P ejecutado en el BNC (simple).',
      rawResponse: data,
      decrypted,
    });
  } catch (error) {
    logError('account/p2p-simple', error);
    return res.status(500).json({
      message: 'No se pudo ejecutar el Pago Móvil P2P (simple) en el BNC.',
    });
  }
});

// Endpoint "simple" para Pago Móvil C2P (transferencia comercio → persona por token)
router.post('/c2p-simple', async (req, res) => {
  const baseUrl = process.env.BNC_URL_BASE;
  const clientGuid = process.env.BNC_CLIENT_GUID;
  const terminalFromEnv = process.env.BNC_TERMINAL_ID;

  if (!baseUrl || !clientGuid) {
    return res.status(500).json({
      message: 'Faltan variables de entorno BNC_URL_BASE o BNC_CLIENT_GUID.',
    });
  }

  const {
    amount,
    debtorBankCode,
    debtorCellPhone,
    debtorId,
    token,
    workingKey,
  } = req.body || {};

  const terminal =
    (terminalFromEnv && String(terminalFromEnv).trim()) || '';

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

  if (!terminal) {
    return res.status(500).json({
      message:
        'El terminal es requerido. Configure BNC_TERMINAL_ID en las variables de entorno.',
    });
  }

  try {
    const originalBody = {
      Amount: Number(amount),
      DebtorBankCode: Number(debtorBankCode),
      DebtorCellPhone: String(debtorCellPhone),
      DebtorID: String(debtorId),
      Token: String(token),
      Terminal: String(terminal),
    };

    const { value, validation } = encryptJson(originalBody, workingKey);

    const envelope = {
      ClientGUID: clientGuid,
      Value: value,
      Validation: validation,
      swTestOperation: false,
    };

    const upstreamResponse = await fetch(`${baseUrl}/MobPayment/SendC2P`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(envelope),
    });

    const data = await upstreamResponse.json();

    if (!upstreamResponse.ok || data.status !== 'OK') {
      logError('account/c2p-simple', new Error('BNC status not OK'), {
        statusCode: upstreamResponse.status,
        body: data,
      });
      return res.status(upstreamResponse.status).json({
        message: 'Error al ejecutar transferencia C2P (simple) en el BNC.',
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
      message: 'Transferencia C2P ejecutada en el BNC (simple).',
      rawResponse: data,
      decrypted,
    });
  } catch (error) {
    logError('account/c2p-simple', error);
    return res.status(500).json({
      message: 'No se pudo ejecutar la transferencia C2P (simple) en el BNC.',
    });
  }
});

// Endpoint "simple" para VPOS / Punto de Venta Virtual (Transaction/Send)
router.post('/vpos-simple', async (req, res) => {
  const baseUrl = process.env.BNC_URL_BASE;
  const clientGuid = process.env.BNC_CLIENT_GUID;
  const affiliationFromEnv = process.env.BNC_AFFILIATION_NUMBER;

  if (!baseUrl || !clientGuid || !affiliationFromEnv) {
    return res.status(500).json({
      message:
        'Faltan variables de entorno BNC_URL_BASE, BNC_CLIENT_GUID o BNC_AFFILIATION_NUMBER.',
    });
  }

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
        'Debe enviar accountType, amount, cardHolderID, cardHolderName, cardNumber, cvv, expirationDate, cardType, transactionID y workingKey. El número de afiliación se toma de BNC_AFFILIATION_NUMBER y el PIN es opcional.',
    });
  }

  try {
    const originalBody = {
      AccountType: Number(accountType),                // 00, 10, 20
      AffiliationNumber: Number(affiliationFromEnv),   // VPOS del comercio
      Amount: Number(amount),
      CardHolderID: Number(cardHolderID),
      CardHolderName: String(cardHolderName),
      CardNumber: String(cardNumber),
      CVV: Number(cvv),
      dtExpiration: Number(expirationDate),            // ej: 122024
      idCardType: Number(cardType),                    // 1=VISA, 2=MC, 3=Débito
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

    const upstreamResponse = await fetch(`${baseUrl}/Transaction/Send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(envelope),
    });

    const rawBody = await upstreamResponse.text();

    let data: any;
    try {
      data = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      data = { status: 'KO', message: rawBody };
    }

    if (!upstreamResponse.ok || data.status !== 'OK') {
      logError('account/vpos-simple', new Error('BNC status not OK'), {
        statusCode: upstreamResponse.status,
        body: data,
      });
      return res
        .status(
          Number.isFinite(upstreamResponse.status) ? upstreamResponse.status : 502,
        )
        .json({
          message: 'Error al ejecutar transacción VPOS (simple) en el BNC.',
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
      message: 'Transacción VPOS ejecutada en el BNC (vpos-simple).',
      rawResponse: data,
      decrypted,
    });
  } catch (error) {
    logError('account/vpos-simple', error);
    return res.status(500).json({
      message: 'No se pudo ejecutar la transacción VPOS (simple) en el BNC.',
    });
  }
});

// Proxy genérico para Crédito inmediato (Pagar) - espera envelope ya encriptado
router.post('/immediate-credit', async (req, res) => {
  const baseUrl = process.env.BNC_URL_BASE;
  const clientGuid = process.env.BNC_CLIENT_GUID;

  if (!baseUrl || !clientGuid) {
    return res.status(500).json({
      message:
        'Faltan variables de entorno BNC_URL_BASE, BNC_CLIENT_GUID o BNC_CREDIT_IMMEDIATE_PATH.',
    });
  }

  try {
    const bodyFromClient = req.body || {};

    const envelope = {
      ClientGUID: clientGuid,
      ...bodyFromClient,
    };

    const upstreamResponse = await fetch(`${baseUrl}/ImmediateCredit/Send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(envelope),
    });

    const rawBody = await upstreamResponse.text();
    let data: any;
    try {
      data = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      data = { status: 'KO', message: rawBody };
    }

    if (!upstreamResponse.ok) {
      logError('account/immediate-credit', new Error('BNC status not OK'), {
        statusCode: upstreamResponse.status,
        body: data,
      });
      return res.status(upstreamResponse.status).json({
        message: 'Error al ejecutar Crédito inmediato en el BNC.',
        statusCode: upstreamResponse.status,
        body: data,
      });
    }

    return res.status(200).json({
      message: 'Crédito inmediato ejecutado en el BNC.',
      rawResponse: data,
    });
  } catch (error) {
    logError('account/immediate-credit', error);
    return res.status(500).json({
      message: 'No se pudo ejecutar Crédito inmediato en el BNC.',
    });
  }
});

// Endpoint "simple" para Crédito inmediato (Pagar): recibe payload legible + workingKey
router.post('/immediate-credit-simple', async (req, res) => {
  const baseUrl = process.env.BNC_URL_BASE;
  const clientGuid = process.env.BNC_CLIENT_GUID;

  if (!baseUrl || !clientGuid) {
    return res.status(500).json({
      message: 'Faltan variables de entorno BNC_URL_BASE o BNC_CLIENT_GUID.',
    });
  }

  const { payload, workingKey } = req.body || {};

  if (!payload || !workingKey) {
    return res.status(400).json({
      message: 'Debe enviar payload (JSON de la operación) y workingKey en el cuerpo.',
    });
  }

  try {
    const { value, validation } = encryptJson(payload, workingKey);

    const envelope = {
      ClientGUID: clientGuid,
      Value: value,
      Validation: validation,
      swTestOperation: false,
    };

    const upstreamResponse = await fetch(`${baseUrl}/ImmediateCredit/Send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(envelope),
    });

    const rawBody = await upstreamResponse.text();
    let data: any;
    try {
      data = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      data = { status: 'KO', message: rawBody };
    }

    if (!upstreamResponse.ok) {
      logError('account/immediate-credit-simple', new Error('BNC status not OK'), {
        statusCode: upstreamResponse.status,
        body: data,
      });
      return res.status(upstreamResponse.status).json({
        message: 'Error al ejecutar Crédito inmediato (simple) en el BNC.',
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

    return res.status(200).json({
      message: 'Crédito inmediato ejecutado en el BNC (immediate-credit-simple).',
      rawResponse: data,
      decrypted,
    });
  } catch (error) {
    logError('account/immediate-credit-simple', error);
    return res.status(500).json({
      message: 'No se pudo ejecutar Crédito inmediato (simple) en el BNC.',
    });
  }
});

// Proxy genérico para Débito inmediato (Cobrar) - espera envelope ya encriptado
router.post('/immediate-debit', async (req, res) => {
  const baseUrl = process.env.BNC_URL_BASE;
  const clientGuid = process.env.BNC_CLIENT_GUID;

  if (!baseUrl || !clientGuid) {
    return res.status(500).json({
      message:
        'Faltan variables de entorno BNC_URL_BASE, BNC_CLIENT_GUID o BNC_DEBIT_IMMEDIATE_PATH.',
    });
  }

  try {
    const bodyFromClient = req.body || {};

    const envelope = {
      ClientGUID: clientGuid,
      ...bodyFromClient,
    };

    const upstreamResponse = await fetch(`${baseUrl}/ImmediateDebit/Send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(envelope),
    });

    const rawBody = await upstreamResponse.text();
    let data: any;
    try {
      data = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      data = { status: 'KO', message: rawBody };
    }

    if (!upstreamResponse.ok) {
      logError('account/immediate-debit', new Error('BNC status not OK'), {
        statusCode: upstreamResponse.status,
        body: data,
      });
      return res.status(upstreamResponse.status).json({
        message: 'Error al ejecutar Débito inmediato en el BNC.',
        statusCode: upstreamResponse.status,
        body: data,
      });
    }

    return res.status(200).json({
      message: 'Débito inmediato ejecutado en el BNC.',
      rawResponse: data,
    });
  } catch (error) {
    logError('account/immediate-debit', error);
    return res.status(500).json({
      message: 'No se pudo ejecutar Débito inmediato en el BNC.',
    });
  }
});

// Endpoint "simple" para Débito inmediato (Cobrar): recibe payload legible + workingKey
router.post('/immediate-debit-simple', async (req, res) => {
  const baseUrl = process.env.BNC_URL_BASE;
  const clientGuid = process.env.BNC_CLIENT_GUID;

  if (!baseUrl || !clientGuid) {
    return res.status(500).json({
      message: 'Faltan variables de entorno BNC_URL_BASE o BNC_CLIENT_GUID.',
    });
  }

  const { payload, workingKey } = req.body || {};

  if (!payload || !workingKey) {
    return res.status(400).json({
      message: 'Debe enviar payload (JSON de la operación) y workingKey en el cuerpo.',
    });
  }

  try {
    const { value, validation } = encryptJson(payload, workingKey);

    const envelope = {
      ClientGUID: clientGuid,
      Value: value,
      Validation: validation,
      swTestOperation: false,
    };

    const upstreamResponse = await fetch(`${baseUrl}/ImmediateDebit/Send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(envelope),
    });

    const rawBody = await upstreamResponse.text();
    let data: any;
    try {
      data = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      data = { status: 'KO', message: rawBody };
    }

    if (!upstreamResponse.ok) {
      logError('account/immediate-debit-simple', new Error('BNC status not OK'), {
        statusCode: upstreamResponse.status,
        body: data,
      });
      return res.status(upstreamResponse.status).json({
        message: 'Error al ejecutar Débito inmediato (simple) en el BNC.',
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

    return res.status(200).json({
      message: 'Débito inmediato ejecutado en el BNC (immediate-debit-simple).',
      rawResponse: data,
      decrypted,
    });
  } catch (error) {
    logError('account/immediate-debit-simple', error);
    return res.status(500).json({
      message: 'No se pudo ejecutar Débito inmediato (simple) en el BNC.',
    });
  }
});

// Proxy para consultar estado de operaciones de Crédito/Débito inmediato
router.post('/immediate-status', async (req, res) => {
  const baseUrl = process.env.BNC_URL_BASE;
  const clientGuid = process.env.BNC_CLIENT_GUID;

  if (!baseUrl || !clientGuid) {
    return res.status(500).json({
      message:
        'Faltan variables de entorno BNC_URL_BASE, BNC_CLIENT_GUID o BNC_IMMEDIATE_STATUS_PATH.',
    });
  }

  try {
    const bodyFromClient = req.body || {};

    const envelope = {
      ClientGUID: clientGuid,
      ...bodyFromClient,
    };

    const upstreamResponse = await fetch(`${baseUrl}/ImmediatePayments/Status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(envelope),
    });

    const rawBody = await upstreamResponse.text();
    let data: any;
    try {
      data = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      data = { status: 'KO', message: rawBody };
    }

    if (!upstreamResponse.ok) {
      logError('account/immediate-status', new Error('BNC status not OK'), {
        statusCode: upstreamResponse.status,
        body: data,
      });
      return res.status(upstreamResponse.status).json({
        message: 'Error al consultar estado de Crédito/Débito inmediato en el BNC.',
        statusCode: upstreamResponse.status,
        body: data,
      });
    }

    return res.status(200).json({
      message: 'Estado de operación de Crédito/Débito inmediato obtenido del BNC.',
      rawResponse: data,
    });
  } catch (error) {
    logError('account/immediate-status', error);
    return res.status(500).json({
      message:
        'No se pudo consultar el estado de la operación de Crédito/Débito inmediato en el BNC.',
    });
  }
});

// Endpoint "simple" para consultar estado de Crédito/Débito inmediato
// Recibe payload legible (según doc de ImmediatePayments/Status) + workingKey
router.post('/immediate-status-simple', async (req, res) => {
  const baseUrl = process.env.BNC_URL_BASE;
  const clientGuid = process.env.BNC_CLIENT_GUID;

  if (!baseUrl || !clientGuid) {
    return res.status(500).json({
      message: 'Faltan variables de entorno BNC_URL_BASE o BNC_CLIENT_GUID.',
    });
  }

  const { payload, workingKey } = req.body || {};

  if (!payload || !workingKey) {
    return res.status(400).json({
      message: 'Debe enviar payload (JSON de la consulta) y workingKey en el cuerpo.',
    });
  }

  try {
    const { value, validation } = encryptJson(payload, workingKey);

    const envelope = {
      ClientGUID: clientGuid,
      Value: value,
      Validation: validation,
      swTestOperation: false,
    };

    const upstreamResponse = await fetch(`${baseUrl}/ImmediatePayments/Status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(envelope),
    });

    const rawBody = await upstreamResponse.text();
    let data: any;
    try {
      data = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      data = { status: 'KO', message: rawBody };
    }

    if (!upstreamResponse.ok) {
      logError('account/immediate-status-simple', new Error('BNC status not OK'), {
        statusCode: upstreamResponse.status,
        body: data,
      });
      return res.status(upstreamResponse.status).json({
        message:
          'Error al consultar estado de Crédito/Débito inmediato (simple) en el BNC.',
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

    return res.status(200).json({
      message:
        'Estado de Crédito/Débito inmediato obtenido en el BNC (immediate-status-simple).',
      rawResponse: data,
      decrypted,
    });
  } catch (error) {
    logError('account/immediate-status-simple', error);
    return res.status(500).json({
      message:
        'No se pudo consultar el estado de la operación de Crédito/Débito inmediato (simple) en el BNC.',
    });
  }
});

export default router;

