import { Router } from 'express';
import { decryptJson, encryptJson } from '../utils/bncCrypto';

const router = Router();

// Login contra el BNC (proxy). Espera el "envelope" ya encriptado.
router.post('/login', async (req, res) => {
  const baseUrl = process.env.BNC_URL_BASE;
  const clientGuid = process.env.BNC_CLIENT_GUID;
  const masterKey = process.env.BNC_MASTER_KEY;
  const authPath = '/Auth/LogOn';

  if (!baseUrl || !clientGuid || !masterKey) {
    return res.status(500).json({
      message:
        'Faltan variables de entorno BNC_URL_BASE, BNC_CLIENT_GUID o BNC_MASTER_KEY.',
    });
  }

  try {
    const bodyFromClient = req.body || {};

    const envelope = {
      ClientGUID: clientGuid,
      ...bodyFromClient,
    };

    const upstreamResponse = await fetch(`${baseUrl}${authPath}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(envelope),
    });

    const data = await upstreamResponse.json().catch(() => null);

    if (!upstreamResponse.ok) {
      return res.status(upstreamResponse.status).json({
        message: 'Error en el login contra el BNC.',
        statusCode: upstreamResponse.status,
        body: data,
      });
    }

    return res.status(200).json({
      message: 'Login ejecutado contra el BNC.',
      rawResponse: data,
    });
  } catch (error) {
    console.error('Error llamando al endpoint de login del BNC', error);
    return res.status(500).json({
      message: 'No se pudo ejecutar el login contra el BNC.',
    });
  }
});

// Login "simple": el backend arma Value y Validation con MasterKey.
router.post('/login-simple', async (_req, res) => {
  const baseUrl = process.env.BNC_URL_BASE;
  const clientGuid = process.env.BNC_CLIENT_GUID;
  const masterKey = process.env.BNC_MASTER_KEY;
  const authPath = '/Auth/LogOn';

  if (!baseUrl || !clientGuid || !masterKey) {
    return res.status(500).json({
      message:
        'Faltan variables de entorno BNC_URL_BASE, BNC_CLIENT_GUID o BNC_MASTER_KEY.',
    });
  }

  try {
    const originalBody = {
      ClientGUID: clientGuid,
    };

    const { value, validation } = encryptJson(originalBody, masterKey);

    const envelope = {
      ClientGUID: clientGuid,
      Value: value,
      Validation: validation,
      swTestOperation: false,
    };

    const upstreamResponse = await fetch(`${baseUrl}${authPath}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(envelope),
    });

    const data = await upstreamResponse.json();

    if (!upstreamResponse.ok || data.status !== 'OK') {
      return res.status(upstreamResponse.status).json({
        message: 'Error en el login-simple contra el BNC.',
        statusCode: upstreamResponse.status,
        body: data,
      });
    }

    let decrypted: unknown = null;
    try {
      decrypted = decryptJson(data.value, masterKey);
    } catch {
      decrypted = null;
    }

    return res.status(200).json({
      message: 'Login-simple ejecutado contra el BNC.',
      rawResponse: data,
      decrypted,
    });
  } catch (error) {
    console.error('Error llamando al endpoint de login-simple del BNC', error);
    return res.status(500).json({
      message: 'No se pudo ejecutar el login-simple contra el BNC.',
    });
  }
});

export default router;

