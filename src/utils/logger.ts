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

export function logError(context: string, error: unknown, extra?: LogExtra) {
  ensureLogDir();

  const base = {
    timestamp: new Date().toISOString(),
    context,
    extra: extra ?? undefined,
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
        extra: extra ?? undefined,
      },
    })
    .catch(() => {
      // Si falla el log en BD, no afectamos el flujo de la API.
    });

  // También dejamos el error en consola para desarrollo.
  // eslint-disable-next-line no-console
  console.error(context, error);
}

