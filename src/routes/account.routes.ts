import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { decryptJson, encryptJson } from '../utils/bncCrypto';

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
    console.error('Error llamando al endpoint de estado de cuenta del BNC', error);
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
    console.error('Error llamando al endpoint de estado de cuenta (simple) del BNC', error);
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
    console.error(
      'Error llamando al endpoint de historial por rango de fechas (simple) del BNC',
      error,
    );
    return res.status(500).json({
      message:
        'No se pudo obtener el historial por rango de fechas (simple) desde el BNC.',
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
    console.error(
      'Error sincronizando historial por rango de fechas con la base de datos',
      error,
    );
    return res.status(500).json({
      message:
        'No se pudo sincronizar el historial por rango de fechas con la base de datos.',
    });
  }
});

export default router;

