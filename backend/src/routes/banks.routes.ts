import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { auditEvent } from '../utils/audit';
import { logError } from '../utils/logger';
import { authTokenMiddleware } from '../middleware/authToken';
import { requirePermissions } from '../middleware/authorize';

const router = Router();

// Crear banco
router.post(
  '/',
  authTokenMiddleware,
  requirePermissions(['MANAGE_BANKS']),
  async (req, res) => {
  try {
    const { code, name, isActive } = req.body || {};

    if (code === undefined || code === null || !name) {
      return res.status(400).json({
        message: 'Debe enviar code (number) y name (string).',
      });
    }

    const created = await prisma.bank.create({
      data: {
        code: Number(code),
        name: String(name),
        isActive: typeof isActive === 'boolean' ? isActive : true,
      },
    });

    void auditEvent(req as any, {
      context: 'banks/create',
      action: 'CREATE',
      entityType: 'Bank',
      entityId: created.id,
      description: `Creó banco ${created.code} - ${created.name}`,
      metadata: created,
    });

    return res.status(201).json(created);
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return res.status(409).json({ message: 'Ya existe un banco con ese code.' });
    }
    logError('banks/create', error, { body: req.body });
    return res.status(500).json({ message: 'Error creando banco.' });
  }
},
);

// Listar bancos
router.get(
  '/',
  authTokenMiddleware,
  requirePermissions(['VIEW_BANKS']),
  async (req, res) => {
  try {
    const isActiveParam = req.query.isActive;
    const includeInactive =
      typeof isActiveParam === 'string' ? isActiveParam.toLowerCase() === 'all' : false;

    const banks = await prisma.bank.findMany({
      where: includeInactive ? undefined : { isActive: true },
      orderBy: [{ code: 'asc' }],
    });

    void auditEvent(req as any, {
      context: 'banks/list',
      action: 'VIEW',
      entityType: 'Bank',
      entityId: null,
      description: 'Listado de bancos',
      metadata: {
        includeInactive,
        count: banks.length,
      },
    });

    return res.json(banks);
  } catch (error) {
    logError('banks/list', error, { query: req.query });
    return res.status(500).json({ message: 'Error listando bancos.' });
  }
},
);

// Obtener banco por id
router.get(
  '/:id',
  authTokenMiddleware,
  requirePermissions(['VIEW_BANKS']),
  async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ message: 'ID inválido.' });
    }

    const bank = await prisma.bank.findUnique({ where: { id } });
    if (!bank) {
      return res.status(404).json({ message: 'Banco no encontrado.' });
    }

    void auditEvent(req as any, {
      context: 'banks/detail',
      action: 'VIEW',
      entityType: 'Bank',
      entityId: id,
      description: `Detalle de banco ${bank.code} - ${bank.name}`,
      metadata: { id },
    });

    return res.json(bank);
  } catch (error) {
    logError('banks/detail', error, { params: req.params });
    return res.status(500).json({ message: 'Error obteniendo banco.' });
  }
},
);

// Actualizar banco
router.put(
  '/:id',
  authTokenMiddleware,
  requirePermissions(['MANAGE_BANKS']),
  async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ message: 'ID inválido.' });
    }

    const { code, name, isActive } = req.body || {};
    const data: any = {};
    if (code !== undefined) data.code = Number(code);
    if (name !== undefined) data.name = String(name);
    if (isActive !== undefined) data.isActive = Boolean(isActive);

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ message: 'No hay campos para actualizar.' });
    }

    const updated = await prisma.bank.update({ where: { id }, data });

    void auditEvent(req as any, {
      context: 'banks/update',
      action: 'UPDATE',
      entityType: 'Bank',
      entityId: id,
      description: `Actualizó banco ${updated.code} - ${updated.name}`,
      metadata: updated,
    });

    return res.json(updated);
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return res.status(409).json({ message: 'Ya existe un banco con ese code.' });
    }
    if (error?.code === 'P2025') {
      return res.status(404).json({ message: 'Banco no encontrado.' });
    }
    logError('banks/update', error, { params: req.params, body: req.body });
    return res.status(500).json({ message: 'Error actualizando banco.' });
  }
},
);

// Eliminar banco
router.delete(
  '/:id',
  authTokenMiddleware,
  requirePermissions(['MANAGE_BANKS']),
  async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ message: 'ID inválido.' });
    }

    const existing = await prisma.bank.findUnique({
      where: { id },
      select: { code: true, name: true },
    });

    await prisma.bank.delete({ where: { id } });

    void auditEvent(req as any, {
      context: 'banks/delete',
      action: 'DELETE',
      entityType: 'Bank',
      entityId: id,
      description: existing
        ? `Eliminó banco ${existing.code} - ${existing.name}`
        : 'Eliminó banco',
      metadata: { id, code: existing?.code ?? null, name: existing?.name ?? null },
    });

    return res.status(204).send();
  } catch (error: any) {
    if (error?.code === 'P2025') {
      return res.status(404).json({ message: 'Banco no encontrado.' });
    }
    logError('banks/delete', error, { params: req.params });
    return res.status(500).json({ message: 'Error eliminando banco.' });
  }
},
);

export default router;

