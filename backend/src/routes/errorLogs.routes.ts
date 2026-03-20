import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { logError } from '../utils/logger';
import { auditEvent } from '../utils/audit';
import { authTokenMiddleware } from '../middleware/authToken';
import { requirePermissions } from '../middleware/authorize';

const router = Router();

router.get(
  '/',
  authTokenMiddleware,
  requirePermissions(['VIEW_API_ERROR_LOGS']),
  async (req, res) => {
  try {
    const page = Math.max(parseInt(String(req.query.page ?? '1'), 10) || 1, 1);
    const rawPageSize = parseInt(String(req.query.pageSize ?? '20'), 10) || 20;
    const pageSize = Math.min(Math.max(rawPageSize, 1), 100);
    const skip = (page - 1) * pageSize;

    const contextFilter = req.query.context
      ? String(req.query.context).trim()
      : undefined;

    const where: { context?: { contains: string; mode: 'insensitive' } } = {};

    if (contextFilter) {
      where.context = {
        contains: contextFilter,
        mode: 'insensitive',
      };
    }

    const [rows, total] = await Promise.all([
      prisma.apiErrorLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      prisma.apiErrorLog.count({ where }),
    ]);

    const totalPages = Math.ceil(total / pageSize) || 1;

    void auditEvent(req, {
      context: 'error-logs/list',
      action: 'VIEW',
      entityType: 'ApiErrorLog',
      entityId: null,
      description: 'Listado de registros de error',
      metadata: {
        page,
        pageSize,
        context: contextFilter ?? null,
      },
    });

    return res.json({
      page,
      pageSize,
      total,
      totalPages,
      items: rows,
    });
  } catch (error) {
    logError('error-logs/list', error, { query: req.query });
    return res.status(500).json({
      message: 'Error listando los registros de errores.',
    });
  }
},
);

/**
 * GET /api/error-logs/:id
 * Detalle de un registro específico de ApiErrorLog.
 */
router.get(
  '/:id',
  authTokenMiddleware,
  requirePermissions(['VIEW_API_ERROR_LOGS']),
  async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        message: 'El id debe ser un número entero positivo.',
      });
    }

    const log = await prisma.apiErrorLog.findUnique({
      where: { id },
    });

    if (!log) {
      return res.status(404).json({
        message: 'Registro de error no encontrado.',
      });
    }

    void auditEvent(req, {
      context: 'error-logs/detail',
      action: 'VIEW',
      entityType: 'ApiErrorLog',
      entityId: id,
      description: 'Detalle de registro de error',
      metadata: {
        id,
      },
    });

    return res.json(log);
  } catch (error) {
    logError('error-logs/detail', error, { params: req.params });
    return res.status(500).json({
      message: 'Error obteniendo el detalle del registro de error.',
    });
  }
},
);

export default router;

