import fs from 'fs';
import path from 'path';
import { prisma } from '../lib/prisma';
import type { Prisma } from '../generated/prisma/client';

const LOG_DIR = path.resolve(process.cwd(), 'logs');
const ERROR_LOG_PATH = path.join(LOG_DIR, 'errors.log');

type LogExtra = Prisma.InputJsonValue | undefined;

function ensureLogDir() {
  try {
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
    }
  } catch {
    // Si falla la creación del directorio, no detenemos la app.
  }
}

function sanitizeExtra(extra: LogExtra): LogExtra {
  if (!extra || typeof extra !== 'object') {
    return extra;
  }

  const sensitiveKeys = [
    'masterkey',
    'workingkey',
    'value',
    'validation',
    'token',
    'authorization',
    'password',
    'secret',
  ];

  const clone = JSON.parse(JSON.stringify(extra));

  const walk = (obj: unknown): void => {
    if (!obj || typeof obj !== 'object') {
      return;
    }

    // eslint-disable-next-line no-restricted-syntax
    for (const key of Object.keys(obj as Record<string, unknown>)) {
      const lowerKey = key.toLowerCase();
      const target = (obj as Record<string, unknown>)[key];

      if (sensitiveKeys.includes(lowerKey)) {
        // eslint-disable-next-line no-param-reassign
        (obj as Record<string, unknown>)[key] = '[REDACTED]';
      } else {
        walk(target);
      }
    }
  };

  walk(clone);
  return clone as LogExtra;
}

export function logError(context: string, error: unknown, extra?: LogExtra) {
  ensureLogDir();

  const safeExtra = sanitizeExtra(extra);

  const base = {
    timestamp: new Date().toISOString(),
    context,
    extra: safeExtra ?? undefined,
  };

  const errorPayload =
    error instanceof Error
      ? {
          name: error.name,
          message: error.message,
          stack: error.stack,
        }
      : error;

  const filePayload = {
    ...base,
    error: errorPayload,
  };

  const line = JSON.stringify(filePayload) + '\n';

  try {
    fs.appendFile(ERROR_LOG_PATH, line, () => {
      // noop
    });
  } catch {
    // Si falla la escritura en archivo, no detenemos la app.
  }

  // Intentar registrar también en base de datos (fire-and-forget)
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : JSON.stringify(error);

  const name = error instanceof Error ? error.name : undefined;
  const stack = error instanceof Error ? error.stack : undefined;

  prisma.apiErrorLog
    .create({
      data: {
        context,
        message,
        name,
        stack,
        extra: safeExtra ?? undefined,
      },
    })
    .catch(() => {
      // Si falla el log en BD, no afectamos el flujo de la API.
    });

  // También dejamos el error en consola para desarrollo.
  // eslint-disable-next-line no-console
  console.error(context, error);
}

