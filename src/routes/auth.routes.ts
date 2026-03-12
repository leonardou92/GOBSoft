import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';
import { decryptJson, encryptJson } from '../utils/bncCrypto';
import { logError } from '../utils/logger';

const router = Router();

function validatePasswordStrength(password: string): string | null {
  const errors: string[] = [];

  if (password.length < 8) {
    errors.push('al menos 8 caracteres');
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('al menos una letra mayúscula');
  }
  if (!/[a-z]/.test(password)) {
    errors.push('al menos una letra minúscula');
  }
  if (!/[0-9]/.test(password)) {
    errors.push('al menos un número');
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    errors.push('al menos un carácter especial');
  }

  if (errors.length === 0) {
    return null;
  }

  return `La contraseña debe tener ${errors.join(', ')}.`;
}

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
    logError('auth/login', error);
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
    logError('auth/login-simple', error);
    return res.status(500).json({
      message: 'No se pudo ejecutar el login-simple contra el BNC.',
    });
  }
});

// Registro de usuario local para emitir JWT
router.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body || {};

    if (!username || !password) {
      return res.status(400).json({
        message: 'Debe enviar username y password.',
      });
    }

    const passwordStr = String(password);
    const passwordError = validatePasswordStrength(passwordStr);

    if (passwordError) {
      return res.status(400).json({
        message: passwordError,
      });
    }

    const existing = await prisma.user.findUnique({
      where: { username: String(username) },
    });

    if (existing) {
      return res.status(409).json({
        message: 'Ya existe un usuario con ese username.',
      });
    }

    const passwordHash = await bcrypt.hash(passwordStr, 10);

    const created = await prisma.user.create({
      data: {
        username: String(username),
        passwordHash,
        isActive: true,
      },
    });

    return res.status(201).json({
      id: created.id,
      username: created.username,
      isActive: created.isActive,
      createdAt: created.createdAt,
    });
  } catch (error) {
    logError('auth/register', error, { body: req.body });
    return res.status(500).json({
      message: 'No se pudo registrar el usuario.',
    });
  }
});

// Login local para obtener JWT
router.post('/login-token', async (req, res) => {
  const jwtSecret = process.env.JWT_SECRET;
  const jwtExpiresIn = process.env.JWT_EXPIRES_IN || '15m';

  if (!jwtSecret) {
    logError('auth/login-token', new Error('JWT_SECRET not configured'));
    return res.status(500).json({
      message: 'JWT_SECRET no está configurado en el servidor.',
    });
  }

  if (process.env.NODE_ENV === 'production' && jwtSecret.length < 32) {
    logError('auth/login-token', new Error('JWT_SECRET too weak (length < 32)'));
    return res.status(500).json({
      message: 'Configuración insegura de JWT_SECRET en producción. Consulte al administrador.',
    });
  }

  try {
    const { username, password } = req.body || {};

    if (!username || !password) {
      return res.status(400).json({
        message: 'Debe enviar username y password.',
      });
    }

    const user = await prisma.user.findUnique({
      where: { username: String(username) },
    });

    if (!user || !user.isActive) {
      return res.status(401).json({
        message: 'Credenciales inválidas.',
      });
    }

    const valid = await bcrypt.compare(String(password), user.passwordHash);

    if (!valid) {
      return res.status(401).json({
        message: 'Credenciales inválidas.',
      });
    }

    const payload = {
      sub: user.id,
      username: user.username,
    };

    const token = jwt.sign(payload, jwtSecret, { expiresIn: jwtExpiresIn });

    return res.status(200).json({
      token,
      tokenType: 'Bearer',
      expiresIn: jwtExpiresIn,
    });
  } catch (error) {
    logError('auth/login-token', error, { body: req.body });
    return res.status(500).json({
      message: 'No se pudo iniciar sesión para obtener el token.',
    });
  }
});

export default router;

