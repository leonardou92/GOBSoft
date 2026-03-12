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
import { authTokenMiddleware } from './middleware/authToken';
import { prisma } from './lib/prisma';
import { logError } from './utils/logger';

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
      },
    });
  } catch (error) {
    logError('auth/seed-admin', error);
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

  return app;
};

