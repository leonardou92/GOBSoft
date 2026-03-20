import express, { Application } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import docsRouter from './routes/docs.routes';
import accountRouter from './routes/account.routes';
import authRouter from './routes/auth.routes';
import bankAccountsRouter from './routes/bankAccounts.routes';
import transactionsRouter from './routes/transactions.routes';
import associatesRouter from './routes/associates.routes';
import servicesRouter from './routes/services.routes';
import usersRouter from './routes/users.routes';
import errorLogsRouter from './routes/errorLogs.routes';
import auditRouter from './routes/audit.routes';
import dashboardRouter from './routes/dashboard.routes';
import banksRouter from './routes/banks.routes';
import bankIntegrationConfigsRouter from './routes/bankIntegrationConfigs.routes';
import rolesRouter from './routes/roles.routes';
import { authTokenMiddleware } from './middleware/authToken';
import { prisma } from './lib/prisma';
import { logError } from './utils/logger';
import { ROLE_PERMISSIONS, type UserRole } from './security/permissions';

dotenv.config();

async function ensureDefaultAdminUser() {
  try {
    const existing = await prisma.user.findUnique({
      where: { username: 'admin' },
    });

    if (existing) {
      return;
    }

    const passwordHash = await bcrypt.hash('Kiri**4545**', 10);

    await prisma.user.create({
      data: {
        username: 'admin',
        passwordHash,
        isActive: true,
        legacyRole: 'ADMIN',
      },
    });
  } catch (error) {
    logError('auth/seed-admin', error);
  }
}

async function ensureDefaultRolesAndPermissions() {
  try {
    const allCodes = Array.from(
      new Set(Object.values(ROLE_PERMISSIONS).flat()),
    );

    for (const code of allCodes) {
      // eslint-disable-next-line no-await-in-loop
      await prisma.permission.upsert({
        where: { code },
        update: {},
        create: {
          code,
          description: code,
        },
      });
    }

    const standardRoles: UserRole[] = ['ADMIN', 'OPERADOR', 'AUDITOR'];

    for (const roleName of standardRoles) {
      // eslint-disable-next-line no-await-in-loop
      const role = await prisma.role.upsert({
        where: { name: roleName },
        update: {},
        create: {
          name: roleName,
          description: roleName,
        },
      });

      const desiredPermissions = ROLE_PERMISSIONS[roleName] ?? [];

      // eslint-disable-next-line no-await-in-loop
      await prisma.rolePermission.deleteMany({
        where: { roleId: role.id },
      });

      if (desiredPermissions.length > 0) {
        // eslint-disable-next-line no-await-in-loop
        const perms = await prisma.permission.findMany({
          where: { code: { in: desiredPermissions } },
        });

        if (perms.length > 0) {
          // eslint-disable-next-line no-await-in-loop
          await prisma.rolePermission.createMany({
            data: perms.map((p) => ({
              roleId: role.id,
              permissionId: p.id,
            })),
            skipDuplicates: true,
          });
        }
      }
    }

    const adminRole = await prisma.role.findUnique({
      where: { name: 'ADMIN' },
    });

    if (adminRole) {
      await prisma.user.updateMany({
        where: {
          username: 'admin',
        },
        data: {
          roleId: adminRole.id,
        },
      });
    }
  } catch (error) {
    logError('auth/seed-roles-permissions', error);
  }
}

export const createApp = (): Application => {
  const app = express();

  const env = process.env.NODE_ENV || 'development';

  if (env === 'production') {
    // Confiar en el proxy (para que req.secure funcione detrás de Nginx/Load Balancer)
    app.set('trust proxy', 1);
  }

  // Seed de usuario admin por defecto (no bloquea el arranque)
  void ensureDefaultAdminUser();
  // Seed de roles y permisos estándar (no bloquea el arranque)
  void ensureDefaultRolesAndPermissions();

  // Configuración de CORS
  const corsOriginEnv = process.env.CORS_ORIGIN;
  const corsOptions =
    env === 'production' && corsOriginEnv
      ? {
          origin: corsOriginEnv.split(',').map((o) => o.trim()),
        }
      : {};

  app.use(cors(corsOptions));
  app.use(express.json());

  // Rate limiting global básico
  const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 1000, // máximo de requests por IP en la ventana
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.use(globalLimiter);

  // Endpoint público de salud
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'api-bnc' });
  });

  // Forzar HTTPS en producción
  if (env === 'production') {
    app.use((req, res, next) => {
      const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https';

      if (!isSecure) {
        return res.status(400).json({
          message: 'Las conexiones HTTP no están permitidas en producción. Use HTTPS.',
        });
      }

      return next();
    });
  }

  // Endpoints públicos de autenticación local y documentos
  app.use('/api/auth', authRouter);

  // Rate limiting específico para login (mitigar fuerza bruta)
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 20, // 20 intentos de login por IP en la ventana
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.use('/api/auth/login-token', authLimiter);
  app.use('/api/docs', docsRouter);

  // A partir de aquí, todos los endpoints requieren JWT Bearer
  app.use(authTokenMiddleware);

  app.use('/api/account', accountRouter);
  app.use('/api/bank-accounts', bankAccountsRouter);
  app.use('/api/transactions', transactionsRouter);
  app.use('/api/associates', associatesRouter);
  app.use('/api/services', servicesRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/error-logs', errorLogsRouter);
  app.use('/api/dashboard', dashboardRouter);
  app.use('/api/audit', auditRouter);
  app.use('/api/banks', banksRouter);
  app.use('/api/bank-integrations', bankIntegrationConfigsRouter);
  app.use('/api/roles', rolesRouter);

  return app;
};

