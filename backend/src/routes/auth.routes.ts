import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt, { Secret, SignOptions } from 'jsonwebtoken';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import { prisma } from '../lib/prisma';
import { decryptJson, encryptJson } from '../utils/bncCrypto';
import { logError } from '../utils/logger';
import { auditEvent } from '../utils/audit';
import { authTokenMiddleware } from '../middleware/authToken';
import { requirePermissions } from '../middleware/authorize';
import { getPermissionsForRole, type UserRole } from '../security/permissions';
import { decryptTwoFactorSecret, encryptTwoFactorSecret, verifyTotpCode } from '../utils/twoFactor';
import { resolveBankClient, BncClient } from '../services/bankClients';
import {
  BankEnvironment,
  BankIntegrationProvider,
  BankIntegrationService,
} from '../generated/prisma/enums';

const router = Router();
const TOTP_CODE_REGEX = /^\d{6}$/;

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

// Login contra banco (Auth/LogOn). Espera el "envelope" ya encriptado y usa BankIntegrationConfig.
router.post('/login', async (req, res) => {
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
      // Primero buscamos una integración marcada explícitamente con AUTH.
      let anyConfig = await prisma.bankIntegrationConfig.findFirst({
        where: {
          environment: env,
          isActive: true,
          services: {
            some: { service: BankIntegrationService.AUTH },
          },
        },
      });

      // Si no existe, aceptamos una integración con QUERIES para reutilizar credenciales.
      if (!anyConfig) {
        anyConfig = await prisma.bankIntegrationConfig.findFirst({
          where: {
            environment: env,
            isActive: true,
            services: {
              some: { service: BankIntegrationService.QUERIES },
            },
          },
        });
      }

      if (!anyConfig) {
        return res.status(400).json({
          message:
            'No existe configuración de integración bancaria activa para el servicio de autenticación. Configure una integración antes de usar este endpoint.',
          code: 'NO_BANK_INTEGRATION_CONFIG',
          meta: { environment: env, service: BankIntegrationService.AUTH },
        });
      }

      bankId = anyConfig.bankId;
    }

    const client = await resolveBankClient({
      bankId,
      environment: env,
      service: BankIntegrationService.AUTH,
    });

    if (client.provider !== BankIntegrationProvider.BNC) {
      return res.status(400).json({
        message:
          'La integración configurada para este banco no soporta aún el endpoint /auth/login.',
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
      `${baseUrl.replace(/\/+$/, '')}/Auth/LogOn`,
      {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(envelope),
      },
    );

    const data = await upstreamResponse.json().catch(() => null);

    if (!upstreamResponse.ok) {
      return res.status(upstreamResponse.status).json({
        message: 'Error en el login contra el banco.',
        statusCode: upstreamResponse.status,
        body: data,
      });
    }

    return res.status(200).json({
      message: 'Login ejecutado contra el banco.',
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
    logError('auth/login', error);
    return res.status(500).json({
      message: 'No se pudo ejecutar el login contra el banco.',
    });
  }
});

// Login "simple": el backend arma Value y Validation con MasterKey desde BankIntegrationConfig.
router.post('/login-simple', async (req, res) => {
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
      // Primero buscamos una integración marcada explícitamente con AUTH.
      let anyConfig = await prisma.bankIntegrationConfig.findFirst({
        where: {
          environment: env,
          isActive: true,
          services: {
            some: { service: BankIntegrationService.AUTH },
          },
        },
      });

      // Si no existe, aceptamos una integración con QUERIES para reutilizar credenciales.
      if (!anyConfig) {
        anyConfig = await prisma.bankIntegrationConfig.findFirst({
          where: {
            environment: env,
            isActive: true,
            services: {
              some: { service: BankIntegrationService.QUERIES },
            },
          },
        });
      }

      if (!anyConfig) {
        return res.status(400).json({
          message:
            'No existe configuración de integración bancaria activa para el servicio de autenticación. Configure una integración antes de usar este endpoint.',
          code: 'NO_BANK_INTEGRATION_CONFIG',
          meta: { environment: env, service: BankIntegrationService.AUTH },
        });
      }

      bankId = anyConfig.bankId;
    }

    const client = await resolveBankClient({
      bankId,
      environment: env,
      service: BankIntegrationService.AUTH,
    });

    if (client.provider !== BankIntegrationProvider.BNC) {
      return res.status(400).json({
        message:
          'La integración configurada para este banco no soporta aún el endpoint /auth/login-simple.',
      });
    }

    const bncClient = client as BncClient;
    const baseUrl = bncClient.urlBase;
    const clientGuid = bncClient.clientGuid;
    const masterKey = bncClient.masterKey;

    if (!baseUrl || !clientGuid || !masterKey) {
      return res.status(500).json({
        message:
          'La configuración de integración bancaria para este banco no tiene urlBase, clientGuid o masterKey definidos.',
      });
    }

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

    const upstreamResponse = await fetch(
      `${baseUrl.replace(/\/+$/, '')}/Auth/LogOn`,
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
      return res.status(upstreamResponse.status).json({
        message: 'Error en el login-simple contra el banco.',
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
      message: 'Login-simple ejecutado contra el banco.',
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
    logError('auth/login-simple', error);
    return res.status(500).json({
      message: 'No se pudo ejecutar el login-simple contra el banco.',
    });
  }
});

// Registro de usuario local para emitir JWT
router.post('/register', async (req, res) => {
  try {
    const { username, password, firstName, lastName, email } = req.body || {};

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

    if (email) {
      const existingEmail = await prisma.user.findUnique({
        where: { email: String(email) },
      });
      if (existingEmail) {
        return res.status(409).json({
          message: 'Ya existe un usuario con ese correo.',
        });
      }
    }

    const passwordHash = await bcrypt.hash(passwordStr, 10);

    const created = await prisma.user.create({
      data: {
        username: String(username),
        passwordHash,
        isActive: true,
        firstName: firstName ? String(firstName) : null,
        lastName: lastName ? String(lastName) : null,
        email: email ? String(email) : null,
      },
    });

    return res.status(201).json({
      id: created.id,
      username: created.username,
      firstName: created.firstName,
      lastName: created.lastName,
      email: created.email,
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
  const jwtSecretEnv = process.env.JWT_SECRET;
  const jwtExpiresIn: SignOptions['expiresIn'] =
    (process.env.JWT_EXPIRES_IN || '15m') as SignOptions['expiresIn'];

  if (!jwtSecretEnv) {
    logError('auth/login-token', new Error('JWT_SECRET not configured'));
    return res.status(500).json({
      message: 'JWT_SECRET no está configurado en el servidor.',
    });
  }

  if (process.env.NODE_ENV === 'production' && jwtSecretEnv.length < 32) {
    logError('auth/login-token', new Error('JWT_SECRET too weak (length < 32)'));
    return res.status(500).json({
      message: 'Configuración insegura de JWT_SECRET en producción. Consulte al administrador.',
    });
  }

  const jwtSecret: Secret = jwtSecretEnv;

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
      void auditEvent(req as any, {
        context: 'auth/login-token',
        action: 'LOGIN_FAILED',
        entityType: 'User',
        entityId: username ? String(username) : null,
        userIdOverride: null,
        usernameOverride: username ? String(username) : null,
        description: 'Intento de inicio de sesión con usuario inactivo o inexistente',
        metadata: {
          username: username ? String(username) : null,
          reason: !user ? 'USER_NOT_FOUND' : 'USER_INACTIVE',
        },
      });

      if (!user) {
        return res.status(401).json({
          message: 'Credenciales inválidas.',
        });
      }

      return res.status(403).json({
        message: 'Usuario inactivo. Consulte al administrador del sistema.',
      });
    }

    const valid = await bcrypt.compare(String(password), user.passwordHash);

    if (!valid) {
      void auditEvent(req as any, {
        context: 'auth/login-token',
        action: 'LOGIN_FAILED',
        entityType: 'User',
        entityId: String(user.id),
        userIdOverride: user.id,
        usernameOverride: user.username,
        description: 'Intento de inicio de sesión con contraseña incorrecta',
        metadata: {
          username: user.username,
          reason: 'WRONG_PASSWORD',
        },
      });
      return res.status(401).json({
        message: 'Credenciales inválidas.',
      });
    }

    const dbUserWithRole: any = await prisma.user.findUnique({
      where: { id: user.id },
      include: {
        role: {
          include: {
            rolePermissions: {
              include: {
                permission: true,
              },
            },
          },
        },
      },
    });

    let jwtRole: string;
    let jwtPermissions: string[];

    if (dbUserWithRole?.role) {
      jwtRole = String(dbUserWithRole.role.name);
      jwtPermissions =
        (dbUserWithRole.role.rolePermissions as any[]).map(
          (rp) => String(rp.permission.code),
        ) ?? [];
    } else {
      const legacyRole = (user.legacyRole as UserRole) ?? 'OPERADOR';
      jwtRole = legacyRole;
      jwtPermissions = getPermissionsForRole(legacyRole);
    }

    const payload = {
      sub: user.id,
      username: user.username,
      role: jwtRole,
      permissions: jwtPermissions,
    };

    const signOptions: SignOptions = { expiresIn: jwtExpiresIn };

    const token = jwt.sign(payload, jwtSecret, signOptions);

    void auditEvent(req as any, {
      context: 'auth/login-token',
      action: 'LOGIN_SUCCESS',
      entityType: 'User',
      entityId: String(user.id),
      userIdOverride: user.id,
      usernameOverride: user.username,
      description: 'Inicio de sesión exitoso',
      metadata: {
        username: user.username,
      },
    });

    return res.status(200).json({
      token,
      tokenType: 'Bearer',
      expiresIn: jwtExpiresIn,
      user: {
        id: user.id,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        isActive: user.isActive,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    });
  } catch (error) {
    logError('auth/login-token', error, { body: req.body });
    return res.status(500).json({
      message: 'No se pudo iniciar sesión para obtener el token.',
    });
  }
});

// Refresh "sliding session":
// - No hay refresh token separado.
// - El frontend debe llamar a este endpoint ANTES de que el JWT expire.
// - Se re-emite un JWT nuevo con el mismo rol/permisos del usuario.
router.post('/refresh-token', authTokenMiddleware as any, async (req, res) => {
  try {
    const jwtSecretEnv = process.env.JWT_SECRET;
    const jwtExpiresIn: SignOptions['expiresIn'] =
      (process.env.JWT_EXPIRES_IN || '15m') as SignOptions['expiresIn'];

    if (!jwtSecretEnv) {
      logError('auth/refresh-token-missing-env', new Error('JWT_SECRET not configured'));
      return res.status(500).json({ message: 'JWT_SECRET no está configurado en el servidor.' });
    }

    const jwtSecret: Secret = jwtSecretEnv;

    const authUser = (req as any).user as { sub?: number } | undefined;
    const sub = authUser?.sub;

    if (typeof sub !== 'number' || sub <= 0) {
      return res.status(401).json({ message: 'Autorización requerida.' });
    }

    const dbUserWithRole: any = await prisma.user.findUnique({
      where: { id: sub },
      include: {
        role: {
          include: {
            rolePermissions: {
              include: {
                permission: true,
              },
            },
          },
        },
      },
    });

    if (!dbUserWithRole || !dbUserWithRole.isActive) {
      return res.status(403).json({
        message: 'Usuario inactivo. Consulte al administrador del sistema.',
      });
    }

    let jwtRole: string;
    let jwtPermissions: string[];
    if (dbUserWithRole?.role) {
      jwtRole = String(dbUserWithRole.role.name);
      jwtPermissions =
        (dbUserWithRole.role.rolePermissions as any[]).map(
          (rp) => String(rp.permission.code),
        ) ?? [];
    } else {
      const legacyRole = (dbUserWithRole.legacyRole as UserRole) ?? 'OPERADOR';
      jwtRole = legacyRole;
      jwtPermissions = getPermissionsForRole(legacyRole);
    }

    const payload = {
      sub: dbUserWithRole.id,
      username: dbUserWithRole.username,
      role: jwtRole,
      permissions: jwtPermissions,
    };

    const signOptions: SignOptions = { expiresIn: jwtExpiresIn };
    const token = jwt.sign(payload, jwtSecret, signOptions);

    return res.status(200).json({
      token,
      tokenType: 'Bearer',
      expiresIn: jwtExpiresIn,
      user: {
        id: dbUserWithRole.id,
        username: dbUserWithRole.username,
        firstName: dbUserWithRole.firstName,
        lastName: dbUserWithRole.lastName,
        email: dbUserWithRole.email,
        isActive: dbUserWithRole.isActive,
        createdAt: dbUserWithRole.createdAt,
        updatedAt: dbUserWithRole.updatedAt,
      },
    });
  } catch (error: any) {
    logError('auth/refresh-token', error);
    return res.status(500).json({
      message: 'No se pudo refrescar la sesión.',
    });
  }
});

// 2FA GLOBAL: setup inicial (genera secreto y QR, sin habilitar aún).
router.post(
  '/2fa/setup',
  authTokenMiddleware as any,
  requirePermissions(['MANAGE_SECURITY']),
  async (req, res) => {
  try {
    let base32Secret: string;
    const existingConfig = await prisma.securityConfig.findUnique({
      where: { id: 1 },
    });

    if (existingConfig?.globalTwoFactorSecretEncrypted) {
      // Reutilizar secreto pendiente/actual.
      base32Secret = decryptTwoFactorSecret(
        existingConfig.globalTwoFactorSecretEncrypted,
      );
    } else {
      const generated = speakeasy.generateSecret({
        length: 20,
        name: 'GOB:GLOBAL',
        issuer: 'GOB',
      });
      base32Secret = String(generated.base32);

      await prisma.securityConfig.upsert({
        where: { id: 1 },
        update: {
          globalTwoFactorSecretEncrypted: encryptTwoFactorSecret(base32Secret),
        },
        create: {
          id: 1,
          globalTwoFactorSecretEncrypted: encryptTwoFactorSecret(base32Secret),
          globalTwoFactorEnabled: false,
        },
      });
    }

    const otpAuthUrl = speakeasy.otpauthURL({
      secret: base32Secret,
      label: 'GOB:GLOBAL',
      issuer: 'GOB',
      encoding: 'base32',
    });

    const qrCodeDataUrl = await QRCode.toDataURL(otpAuthUrl);

    return res.status(200).json({
      message: 'Configuración 2FA global generada.',
      otpAuthUrl,
      qrCodeDataUrl,
      manualEntryKey: base32Secret,
    });
  } catch (error) {
    logError('auth/2fa/setup', error);
    return res.status(500).json({
      message: 'No se pudo generar la configuración 2FA.',
    });
  }
},
);

// 2FA GLOBAL: estado actual (para frontend).
router.get(
  '/2fa/status',
  authTokenMiddleware as any,
  requirePermissions(['MANAGE_SECURITY']),
  async (_req, res) => {
  try {
    const config = await prisma.securityConfig.findUnique({
      where: { id: 1 },
    });

    const hasSecret = Boolean(config?.globalTwoFactorSecretEncrypted);
    const enabled = Boolean(config?.globalTwoFactorEnabled);

    return res.status(200).json({
      enabled,
      hasSecret,
      configured: hasSecret || enabled,
      enabledAt: config?.globalTwoFactorEnabledAt ?? null,
    });
  } catch (error) {
    logError('auth/2fa/status', error);
    return res.status(500).json({
      message: 'No se pudo consultar el estado de 2FA.',
    });
  }
},
);

// 2FA GLOBAL: confirmar setup (habilita 2FA global).
router.post(
  '/2fa/verify-setup',
  authTokenMiddleware as any,
  requirePermissions(['MANAGE_SECURITY']),
  async (req, res) => {
  try {
    const { code } = req.body || {};
    if (!code || !TOTP_CODE_REGEX.test(String(code))) {
      return res.status(400).json({
        message: 'Código 2FA inválido. Debe tener 6 dígitos.',
      });
    }

    const config = await prisma.securityConfig.findUnique({
      where: { id: 1 },
    });

    if (!config || !config.globalTwoFactorSecretEncrypted) {
      return res.status(400).json({
        message: 'Debe generar primero la configuración 2FA global.',
      });
    }

    const secret = decryptTwoFactorSecret(config.globalTwoFactorSecretEncrypted);
    const valid = verifyTotpCode(secret, String(code));
    if (!valid) {
      return res.status(401).json({
        message: 'Código 2FA inválido o expirado.',
      });
    }

    await prisma.securityConfig.upsert({
      where: { id: 1 },
      update: {
        globalTwoFactorEnabled: true,
        globalTwoFactorEnabledAt: new Date(),
      },
      create: {
        id: 1,
        globalTwoFactorEnabled: true,
        globalTwoFactorEnabledAt: new Date(),
      },
    });

    return res.status(200).json({
      message: '2FA global habilitado correctamente.',
      twoFactorEnabled: true, // mantenemos el campo por compatibilidad de respuesta
    });
  } catch (error) {
    logError('auth/2fa/verify-setup', error);
    return res.status(500).json({
      message: 'No se pudo verificar la configuración 2FA.',
    });
  }
},
);

// 2FA GLOBAL: eliminar configuración (solo permitido si está deshabilitado).
router.delete(
  '/2fa',
  authTokenMiddleware as any,
  requirePermissions(['MANAGE_SECURITY']),
  async (_req, res) => {
  try {
    const config = await prisma.securityConfig.findUnique({
      where: { id: 1 },
    });

    if (!config || !config.globalTwoFactorSecretEncrypted) {
      return res.status(404).json({
        message: 'No existe configuración 2FA global para eliminar.',
      });
    }

    if (config.globalTwoFactorEnabled) {
      return res.status(409).json({
        message:
          'No se puede eliminar la configuración 2FA mientras esté habilitada. Debe deshabilitarla primero.',
      });
    }

    await prisma.securityConfig.upsert({
      where: { id: 1 },
      update: {
        globalTwoFactorSecretEncrypted: null,
        globalTwoFactorEnabledAt: null,
      },
      create: {
        id: 1,
        globalTwoFactorEnabled: false,
        globalTwoFactorEnabledAt: null,
        globalTwoFactorSecretEncrypted: null,
      },
    });

    return res.status(200).json({
      message: 'Configuración 2FA global eliminada correctamente.',
      deleted: true,
    });
  } catch (error) {
    logError('auth/2fa/delete', error);
    return res.status(500).json({
      message: 'No se pudo eliminar la configuración 2FA.',
    });
  }
},
);

// 2FA GLOBAL: deshabilitar (requiere código válido).
router.post(
  '/2fa/disable',
  authTokenMiddleware as any,
  requirePermissions(['MANAGE_SECURITY']),
  async (req, res) => {
  try {
    const { code } = req.body || {};
    if (!code || !TOTP_CODE_REGEX.test(String(code))) {
      return res.status(400).json({
        message: 'Código 2FA inválido. Debe tener 6 dígitos.',
      });
    }

    const config = await prisma.securityConfig.findUnique({
      where: { id: 1 },
    });

    if (!config || !config.globalTwoFactorEnabled || !config.globalTwoFactorSecretEncrypted) {
      return res.status(400).json({
        message: 'No hay 2FA global habilitado.',
      });
    }

    const secret = decryptTwoFactorSecret(config.globalTwoFactorSecretEncrypted);
    const valid = verifyTotpCode(secret, String(code));
    if (!valid) {
      return res.status(401).json({
        message: 'Código 2FA inválido o expirado.',
      });
    }

    await prisma.securityConfig.upsert({
      where: { id: 1 },
      update: {
        globalTwoFactorEnabled: false,
        globalTwoFactorEnabledAt: null,
        globalTwoFactorSecretEncrypted: null,
      },
      create: {
        id: 1,
        globalTwoFactorEnabled: false,
        globalTwoFactorEnabledAt: null,
        globalTwoFactorSecretEncrypted: null,
      },
    });

    return res.status(200).json({
      message: '2FA global deshabilitado correctamente.',
      twoFactorEnabled: false,
    });
  } catch (error) {
    logError('auth/2fa/disable', error);
    return res.status(500).json({
      message: 'No se pudo deshabilitar 2FA.',
    });
  }
},
);

// Cerrar sesión (solo auditoría; el frontend descarta el token)
// Requiere JWT para saber qué usuario cierra sesión.
router.post('/logout', authTokenMiddleware as any, async (req, res) => {
  try {
    // Si viene usuario autenticado, lo tomamos de req.user (middleware JWT)
    const user = (req as any).user as { sub?: number; username?: string } | undefined;
    const { reason, source } = (req.body || {}) as {
      reason?: string;
      source?: string;
    };

    void auditEvent(req as any, {
      context: 'auth/logout',
      action: 'LOGOUT',
      entityType: 'User',
      entityId: user?.sub != null ? String(user.sub) : null,
      userIdOverride: user?.sub != null ? Number(user.sub) : null,
      usernameOverride: user?.username ?? null,
      description: 'Cierre de sesión',
      metadata: {
        username: user?.username ?? null,
        reason: typeof reason === 'string' ? reason : null,
        source: typeof source === 'string' ? source : 'frontend',
      },
    });

    return res.status(200).json({
      message: 'Sesión cerrada. El frontend debe descartar el token.',
    });
  } catch (error) {
    logError('auth/logout', error);
    return res.status(500).json({
      message: 'No se pudo registrar el cierre de sesión.',
    });
  }
});

export default router;

