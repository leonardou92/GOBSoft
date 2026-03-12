import { Router } from 'express';
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

export default router;

