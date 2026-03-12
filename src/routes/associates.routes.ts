import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { logError } from '../utils/logger';

const router = Router();

// Asociados (ChildClientID)

// Crear asociado
router.post('/', async (req, res) => {
  try {
    const { childClientId, name, description, isActive } = req.body || {};

    if (!childClientId || !name) {
      return res.status(400).json({
        message: 'Debe enviar childClientId y name.',
      });
    }

    const created = await prisma.associatedClient.create({
      data: {
        childClientId: String(childClientId),
        name: String(name),
        description: description ?? null,
        isActive: typeof isActive === 'boolean' ? isActive : true,
      },
    });

    return res.status(201).json(created);
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return res.status(409).json({
        message: 'Ya existe un asociado con ese childClientId.',
      });
    }

    logError('associates/create', error, { body: req.body });
    return res.status(500).json({ message: 'Error creando asociado.' });
  }
});

// Listar asociados
router.get('/', async (_req, res) => {
  try {
    const associates = await prisma.associatedClient.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return res.json(associates);
  } catch (error) {
    logError('associates/list', error);
    return res.status(500).json({ message: 'Error listando asociados.' });
  }
});

// Obtener asociado por id
router.get('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      return res.status(400).json({ message: 'ID inválido.' });
    }

    const associate = await prisma.associatedClient.findUnique({
      where: { id },
      include: { branches: true },
    });

    if (!associate) {
      return res.status(404).json({ message: 'Asociado no encontrado.' });
    }

    return res.json(associate);
  } catch (error) {
    logError('associates/get', error, { params: req.params });
    return res.status(500).json({ message: 'Error obteniendo asociado.' });
  }
});

// Actualizar asociado
router.put('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      return res.status(400).json({ message: 'ID inválido.' });
    }

    const { childClientId, name, description, isActive } = req.body || {};

    const data: any = {};
    if (childClientId !== undefined) data.childClientId = String(childClientId);
    if (name !== undefined) data.name = String(name);
    if (description !== undefined) data.description = description;
    if (isActive !== undefined) data.isActive = Boolean(isActive);

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ message: 'No hay campos para actualizar.' });
    }

    const updated = await prisma.associatedClient.update({
      where: { id },
      data,
    });

    return res.json(updated);
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return res.status(409).json({
        message: 'Ya existe un asociado con ese childClientId.',
      });
    }

    logError('associates/update', error, { params: req.params, body: req.body });
    return res.status(500).json({ message: 'Error actualizando asociado.' });
  }
});

// Eliminar asociado
router.delete('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      return res.status(400).json({ message: 'ID inválido.' });
    }

    await prisma.associatedClient.delete({
      where: { id },
    });

    return res.status(204).send();
  } catch (error: any) {
    if (error?.code === 'P2025') {
      return res.status(404).json({ message: 'Asociado no encontrado.' });
    }

    logError('associates/delete', error, { params: req.params });
    return res.status(500).json({ message: 'Error eliminando asociado.' });
  }
});

// Sucursales (BranchID) asociadas a un asociado

// Crear sucursal para un asociado
router.post('/:associateId/branches', async (req, res) => {
  try {
    const associateId = Number(req.params.associateId);
    if (Number.isNaN(associateId)) {
      return res.status(400).json({ message: 'associateId inválido.' });
    }

    const { code, name, isActive } = req.body || {};

    if (!code || !name) {
      return res.status(400).json({
        message: 'Debe enviar code (BranchID) y name.',
      });
    }

    const created = await prisma.branch.create({
      data: {
        code: String(code),
        name: String(name),
        associatedClientId: associateId,
        isActive: typeof isActive === 'boolean' ? isActive : true,
      },
    });

    return res.status(201).json(created);
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return res.status(409).json({
        message: 'Ya existe una sucursal con ese code para este asociado.',
      });
    }

    logError('associates/branches/create', error, { params: req.params, body: req.body });
    return res.status(500).json({ message: 'Error creando sucursal.' });
  }
});

// Listar sucursales de un asociado
router.get('/:associateId/branches', async (req, res) => {
  try {
    const associateId = Number(req.params.associateId);
    if (Number.isNaN(associateId)) {
      return res.status(400).json({ message: 'associateId inválido.' });
    }

    const branches = await prisma.branch.findMany({
      where: { associatedClientId: associateId },
      orderBy: { createdAt: 'desc' },
    });

    return res.json(branches);
  } catch (error) {
    logError('associates/branches/list', error, { params: req.params });
    return res.status(500).json({ message: 'Error listando sucursales.' });
  }
});

// Actualizar sucursal
router.put('/:associateId/branches/:branchId', async (req, res) => {
  try {
    const associateId = Number(req.params.associateId);
    const branchId = Number(req.params.branchId);

    if (Number.isNaN(associateId) || Number.isNaN(branchId)) {
      return res.status(400).json({ message: 'IDs inválidos.' });
    }

    const { code, name, isActive } = req.body || {};

    const data: any = {};
    if (code !== undefined) data.code = String(code);
    if (name !== undefined) data.name = String(name);
    if (isActive !== undefined) data.isActive = Boolean(isActive);

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ message: 'No hay campos para actualizar.' });
    }

    const updated = await prisma.branch.update({
      where: { id: branchId },
      data,
    });

    // Opcionalmente validar que pertenece al asociado; aquí asumimos integridad por diseño.
    return res.json(updated);
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return res.status(409).json({
        message: 'Ya existe una sucursal con ese code para este asociado.',
      });
    }

    logError('associates/branches/update', error, { params: req.params, body: req.body });
    return res.status(500).json({ message: 'Error actualizando sucursal.' });
  }
});

// Eliminar sucursal
router.delete('/:associateId/branches/:branchId', async (req, res) => {
  try {
    const associateId = Number(req.params.associateId);
    const branchId = Number(req.params.branchId);

    if (Number.isNaN(associateId) || Number.isNaN(branchId)) {
      return res.status(400).json({ message: 'IDs inválidos.' });
    }

    await prisma.branch.delete({
      where: { id: branchId },
    });

    return res.status(204).send();
  } catch (error: any) {
    if (error?.code === 'P2025') {
      return res.status(404).json({ message: 'Sucursal no encontrada.' });
    }

    logError('associates/branches/delete', error, { params: req.params });
    return res.status(500).json({ message: 'Error eliminando sucursal.' });
  }
});

export default router;

