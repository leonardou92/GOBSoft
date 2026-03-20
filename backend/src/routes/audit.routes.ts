import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { logError } from '../utils/logger';
import { authTokenMiddleware } from '../middleware/authToken';
import { requirePermissions } from '../middleware/authorize';

const router = Router();

function getAuthUser(req: any): { userId: number | null; username: string | null } {
  const sub = req.user?.sub;
  const username = req.user?.username;
  return {
    userId: typeof sub === 'number' ? sub : null,
    username: typeof username === 'string' ? username : null,
  };
}

function getRequestClientInfo(req: any): { ipAddress: string | null; userAgent: string | null } {
  const ip =
    (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ??
    req.ip ??
    null;
  const userAgent = (req.headers['user-agent'] as string | undefined) ?? null;
  return {
    ipAddress: ip,
    userAgent,
  };
}

/**
 * POST /api/audit/navigation
 *
 * Registra navegación de frontend (cambio de ruta).
 *
 * Body:
 * {
 *   "path": "/dashboard",
 *   "fromPath": "/login",          // opcional
 *   "description": "Entró al Dashboard",
 *   "metadata": {...}              // opcional
 * }
 */
router.post(
  '/navigation',
  authTokenMiddleware,
  requirePermissions(['VIEW_AUDIT_LOGS']),
  async (req, res) => {
  try {
    const { path, fromPath, description, metadata } = req.body || {};

    if (!path || typeof path !== 'string') {
      return res.status(400).json({
        message: 'Debe enviar "path" (string) en el cuerpo.',
      });
    }

    const { userId, username } = getAuthUser(req);
    const { ipAddress, userAgent } = getRequestClientInfo(req);

    await prisma.auditLog.create({
      data: {
        userId,
        username,
        context: 'frontend/navigation',
        action: 'NAVIGATE',
        entityType: 'Route',
        entityId: path,
        description:
          typeof description === 'string' && description.trim().length > 0
            ? description
            : `Navegó a ${path}`,
        metadata: {
          path,
          fromPath: typeof fromPath === 'string' ? fromPath : null,
          ...(metadata && typeof metadata === 'object' ? metadata : {}),
        },
        ipAddress,
        userAgent,
      },
    });

    return res.status(201).json({ message: 'Evento de navegación auditado.' });
  } catch (error) {
    logError('audit/navigation', error, { body: req.body });
    return res.status(500).json({ message: 'No se pudo registrar el evento de navegación.' });
  }
},
);

/**
 * POST /api/audit/event
 *
 * Evento genérico de auditoría enviado desde el frontend.
 *
 * Body:
 * {
 *   "context": "frontend",
 *   "action": "CLICK",
 *   "entityType": "Modal",
 *   "entityId": "SyncTransactionsModal",
 *   "description": "Usuario abrió modal de sincronización",
 *   "metadata": {...}
 * }
 */
router.post(
  '/event',
  authTokenMiddleware,
  requirePermissions(['VIEW_AUDIT_LOGS']),
  async (req, res) => {
  try {
    const { context, action, entityType, entityId, description, metadata } = req.body || {};

    if (!context || typeof context !== 'string') {
      return res.status(400).json({
        message: 'Debe enviar "context" (string) en el cuerpo.',
      });
    }

    if (!action || typeof action !== 'string') {
      return res.status(400).json({
        message: 'Debe enviar "action" (string) en el cuerpo.',
      });
    }

    const { userId, username } = getAuthUser(req);
    const { ipAddress, userAgent } = getRequestClientInfo(req);

    await prisma.auditLog.create({
      data: {
        userId,
        username,
        context,
        action,
        entityType: entityType && typeof entityType === 'string' ? entityType : null,
        entityId: entityId && typeof entityId === 'string' ? entityId : null,
        description: description && typeof description === 'string' ? description : null,
        metadata: metadata && typeof metadata === 'object' ? metadata : null,
        ipAddress,
        userAgent,
      },
    });

    return res.status(201).json({ message: 'Evento de auditoría registrado.' });
  } catch (error) {
    logError('audit/event', error, { body: req.body });
    return res.status(500).json({ message: 'No se pudo registrar el evento de auditoría.' });
  }
},
);

/**
 * GET /api/audit/logs
 *
 * Listado paginado de registros de auditoría.
 *
 * Query params:
 * - page?: número de página (1 por defecto)
 * - pageSize?: tamaño de página (20 por defecto, máx 200)
 * - userId?: filtrar por usuario
 * - username?: filtrar por username (contains, case-insensitive)
 * - context?: filtrar por contexto exacto
 * - action?: filtrar por acción exacta
 * - startDate?: fecha inicial (YYYY-MM-DD o MM/DD/YYYY)
 * - endDate?: fecha final (incluyente)
 * - withTotal?: true/false (por defecto true)
 */
router.get(
  '/logs',
  authTokenMiddleware,
  requirePermissions(['VIEW_AUDIT_LOGS']),
  async (req, res) => {
  try {
    const page = Number(req.query.page ?? '1');
    const pageSize = Number(req.query.pageSize ?? '20');

    if (Number.isNaN(page) || page < 1) {
      return res.status(400).json({ message: 'page debe ser un número >= 1.' });
    }

    if (Number.isNaN(pageSize) || pageSize < 1 || pageSize > 200) {
      return res
        .status(400)
        .json({ message: 'pageSize debe estar entre 1 y 200.' });
    }

    const skip = (page - 1) * pageSize;

    const where: {
      userId?: number;
      username?: { contains: string; mode: 'insensitive' };
      context?: string;
      action?: string;
      createdAt?: { gte?: Date; lt?: Date };
    } = {};

    if (req.query.userId) {
      const uid = Number(req.query.userId);
      if (!Number.isNaN(uid)) where.userId = uid;
    }

    if (req.query.username) {
      const uname = String(req.query.username).trim();
      if (uname) {
        where.username = {
          contains: uname,
          mode: 'insensitive',
        };
      }
    }

    if (req.query.context) {
      where.context = String(req.query.context);
    }

    if (req.query.action) {
      where.action = String(req.query.action);
    }

    const startDate = req.query.startDate ? String(req.query.startDate) : undefined;
    const endDate = req.query.endDate ? String(req.query.endDate) : undefined;

    if (startDate || endDate) {
      const parseDateOnly = (raw: string): Date | null => {
        const s = raw.trim();
        if (!s) return null;

        if (s.includes('/')) {
          const [month, day, year] = s.split('/');
          if (!day || !month || !year) return null;
          return new Date(Number(year), Number(month) - 1, Number(day), 0, 0, 0, 0);
        }

        const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
        if (isoMatch) {
          const [, yearStr, monthStr, dayStr] = isoMatch;
          return new Date(
            Number(yearStr),
            Number(monthStr) - 1,
            Number(dayStr),
            0,
            0,
            0,
            0,
          );
        }

        const d = new Date(s);
        return Number.isNaN(d.getTime())
          ? null
          : new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
      };

      const gte = startDate ? parseDateOnly(startDate) : null;
      const ltBase = endDate ? parseDateOnly(endDate) : null;
      const lt = ltBase
        ? new Date(ltBase.getFullYear(), ltBase.getMonth(), ltBase.getDate() + 1, 0, 0, 0, 0)
        : null;

      if (gte || lt) {
        where.createdAt = {};
        if (gte) where.createdAt.gte = gte;
        if (lt) where.createdAt.lt = lt;
      }
    }

    const withTotalParam = req.query.withTotal;
    const withTotal =
      typeof withTotalParam === 'string'
        ? withTotalParam.toLowerCase() !== 'false'
        : true;

    const rowsPromise = prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
    });

    const [rows, total] = await Promise.all([
      rowsPromise,
      withTotal ? prisma.auditLog.count({ where }) : Promise.resolve(0),
    ]);

    const totalPages = withTotal ? Math.ceil(total / pageSize) || 1 : null;

    return res.json({
      page,
      pageSize,
      total: withTotal ? total : undefined,
      totalPages,
      items: rows,
    });
  } catch (error) {
    logError('audit/logs', error, { query: req.query });
    return res.status(500).json({ message: 'Error listando auditoría.' });
  }
},
);

export default router;

