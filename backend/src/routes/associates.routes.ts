import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { logError } from '../utils/logger';
import { decryptJson } from '../utils/bncCrypto';
import { auditEvent } from '../utils/audit';
import { resolveBankClient, BncClient } from '../services/bankClients';
import {
  BankEnvironment,
  BankIntegrationProvider,
  BankIntegrationService,
} from '../generated/prisma/enums';

const router = Router();

// Asociados (ChildClientID)

// Crear asociado (solo BD)
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

    void auditEvent(req, {
      context: 'associates/create',
      action: 'CREATE',
      entityType: 'AssociatedClient',
      entityId: created.id,
      description: `Creó asociado ${created.childClientId}`,
      metadata: {
        id: created.id,
        childClientId: created.childClientId,
        name: created.name,
        isActive: created.isActive,
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

// Listar asociados (solo BD)
router.get('/', async (req, res) => {
  try {
    const associates = await prisma.associatedClient.findMany({
      orderBy: { createdAt: 'desc' },
    });
    void auditEvent(req, {
      context: 'associates/list',
      action: 'VIEW',
      entityType: 'AssociatedClient',
      entityId: null,
      description: 'Listado de asociados',
      metadata: {
        count: associates.length,
      },
    });
    return res.json(associates);
  } catch (error) {
    logError('associates/list', error);
    return res.status(500).json({ message: 'Error listando asociados.' });
  }
});

// Obtener asociado por id (solo BD)
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
    void auditEvent(req, {
      context: 'associates/detail',
      action: 'VIEW',
      entityType: 'AssociatedClient',
      entityId: id,
      description: `Detalle de asociado ${associate.childClientId}`,
      metadata: {
        id: associate.id,
        childClientId: associate.childClientId,
        name: associate.name,
        isActive: associate.isActive,
        branchesCount: associate.branches.length,
      },
    });

    return res.json(associate);
  } catch (error) {
    logError('associates/get', error, { params: req.params });
    return res.status(500).json({ message: 'Error obteniendo asociado.' });
  }
});

// Actualizar asociado (solo BD)
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
    void auditEvent(req, {
      context: 'associates/update',
      action: 'UPDATE',
      entityType: 'AssociatedClient',
      entityId: id,
      description: `Actualizó asociado ${updated.childClientId}`,
      metadata: {
        id: updated.id,
        childClientId: updated.childClientId,
        name: updated.name,
        isActive: updated.isActive,
      },
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

// Eliminar asociado (solo BD)
router.delete('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      return res.status(400).json({ message: 'ID inválido.' });
    }

    let deletedChildClientId: string | null = null;
    let deletedName: string | null = null;

    try {
      const existing = await prisma.associatedClient.findUnique({
        where: { id },
        select: { childClientId: true, name: true },
      });
      deletedChildClientId = existing?.childClientId ?? null;
      deletedName = existing?.name ?? null;
    } catch {
      // ignore
    }

    await prisma.associatedClient.delete({
      where: { id },
    });

    void auditEvent(req, {
      context: 'associates/delete',
      action: 'DELETE',
      entityType: 'AssociatedClient',
      entityId: id,
      description: deletedChildClientId
        ? `Eliminó asociado ${deletedChildClientId}`
        : 'Eliminó asociado',
      metadata: {
        id,
        childClientId: deletedChildClientId,
        name: deletedName,
      },
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

// --- Integración bancaria: detalle de asociado + sync BD ---
// POST /api/associates/detail-simple
router.post('/detail-simple', async (req, res) => {
  const { childClientId, bankId: bankIdFromBody } = req.body || {};

  if (!childClientId) {
    return res.status(400).json({
      message: 'Debe enviar childClientId en el cuerpo.',
    });
  }

  try {
    const env =
      process.env.NODE_ENV === 'production'
        ? BankEnvironment.PRODUCTION
        : BankEnvironment.SANDBOX;

    let bankId: number;

    if (bankIdFromBody != null) {
      bankId = Number(bankIdFromBody);
    } else {
      const anyConfig = await prisma.bankIntegrationConfig.findFirst({
        where: {
          environment: env,
          isActive: true,
          services: {
            some: { service: BankIntegrationService.QUERIES },
          },
        },
      });

      if (!anyConfig) {
        return res.status(400).json({
          message:
            'No existe configuración de integración bancaria activa para el servicio de consultas. Configure una integración antes de usar este endpoint.',
          code: 'NO_BANK_INTEGRATION_CONFIG',
          meta: { environment: env, service: BankIntegrationService.QUERIES },
        });
      }

      bankId = anyConfig.bankId;
    }

    const client = await resolveBankClient({
      bankId,
      environment: env,
      service: BankIntegrationService.QUERIES,
    });

    if (client.provider !== BankIntegrationProvider.BNC) {
      return res.status(400).json({
        message:
          'La integración configurada para este banco no soporta aún el endpoint /associates/detail-simple.',
      });
    }

    const bncClient = client as BncClient;
    const baseUrl = bncClient.urlBase;
    const masterKey = bncClient.masterKey;

    if (!baseUrl || !masterKey) {
      return res.status(500).json({
        message:
          'La configuración de integración bancaria para este banco no tiene urlBase o masterKey definidos.',
      });
    }

    const upstreamResponse = await fetch(
      `${baseUrl.replace(/\/+$/, '')}/Childs/ChildClientDetail`,
      {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ Id: String(childClientId) }),
      },
    );

    const data = await upstreamResponse.json().catch(() => null);

    if (!upstreamResponse.ok && data && data.Id) {
      return res.status(400).json({
        message: Array.isArray(data.Id) ? data.Id.join('. ') : String(data.Id),
        errors: data,
      });
    }

    if (!upstreamResponse.ok || !data || data.status !== 'OK') {
      logError('associates/detail-simple', new Error('Bank status not OK'), {
        statusCode: upstreamResponse.status,
        body: data,
      });
      return res.status(upstreamResponse.status || 500).json({
        message: 'Error al consultar detalle de asociado en el banco.',
        statusCode: upstreamResponse.status,
        body: data,
      });
    }

    if (
      typeof data.message === 'string' &&
      data.message.includes('No existe un ChildClient con la ID ingresada')
    ) {
      return res.status(200).json({
        message: 'No existe un ChildClient con la ID ingresada',
        existsInBnc: false,
      });
    }

    let decrypted: any = null;
    try {
      decrypted = decryptJson(data.value, masterKey);
    } catch {
      decrypted = null;
    }

    if (!decrypted || !decrypted.Child) {
      return res.status(500).json({
        message: 'No se pudo desencriptar el detalle del asociado devuelto por el BNC.',
      });
    }

    const child = decrypted.Child;
    const childId = String(child.ChildID);
    const name = String(child.ChildName ?? '');
    const description = `ClientNumber: ${child.ClientNumber ?? ''}, AccountNumber: ${
      child.AccountNumber ?? ''
    }`;

    await prisma.associatedClient.upsert({
      where: { childClientId: childId },
      update: {
        name,
        description,
        isActive: Boolean(child.IsActive),
      },
      create: {
        childClientId: childId,
        name,
        description,
        isActive: Boolean(child.IsActive),
      },
    });

    void auditEvent(req, {
      context: 'associates/detail-simple',
      action: 'SYNC_EXECUTED',
      entityType: 'AssociatedClient',
      entityId: childId,
      description: `Sincronizó asociado ${childId} desde el banco`,
      metadata: {
        childClientId: childId,
        name,
        isActive: Boolean(child.IsActive),
      },
    });

    return res.status(200).json({
      message: 'Detalle de asociado obtenido y sincronizado.',
      existsInBnc: true,
      rawResponse: data,
      child,
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
    logError('associates/detail-simple', error, { body: req.body });
    return res.status(500).json({
      message: 'No se pudo obtener el detalle de asociado desde el banco.',
    });
  }
});

// --- Integración bancaria: deshabilitar asociado + marcar inactivo en BD ---
// POST /api/associates/disable-simple
router.post('/disable-simple', async (req, res) => {
  const { childClientId, bankId: bankIdFromBody } = req.body || {};

  if (!childClientId) {
    return res.status(400).json({
      message: 'Debe enviar childClientId en el cuerpo.',
    });
  }

  try {
    const env =
      process.env.NODE_ENV === 'production'
        ? BankEnvironment.PRODUCTION
        : BankEnvironment.SANDBOX;

    let bankId: number;

    if (bankIdFromBody != null) {
      bankId = Number(bankIdFromBody);
    } else {
      const anyConfig = await prisma.bankIntegrationConfig.findFirst({
        where: {
          environment: env,
          isActive: true,
          services: {
            some: { service: BankIntegrationService.QUERIES },
          },
        },
      });

      if (!anyConfig) {
        return res.status(400).json({
          message:
            'No existe configuración de integración bancaria activa para el servicio de consultas. Configure una integración antes de usar este endpoint.',
          code: 'NO_BANK_INTEGRATION_CONFIG',
          meta: { environment: env, service: BankIntegrationService.QUERIES },
        });
      }

      bankId = anyConfig.bankId;
    }

    const client = await resolveBankClient({
      bankId,
      environment: env,
      service: BankIntegrationService.QUERIES,
    });

    if (client.provider !== BankIntegrationProvider.BNC) {
      return res.status(400).json({
        message:
          'La integración configurada para este banco no soporta aún el endpoint /associates/disable-simple.',
      });
    }

    const bncClient = client as BncClient;
    const baseUrl = bncClient.urlBase;

    if (!baseUrl) {
      return res.status(500).json({
        message:
          'La configuración de integración bancaria para este banco no tiene urlBase definida.',
      });
    }

    const upstreamResponse = await fetch(
      `${baseUrl.replace(/\/+$/, '')}/Childs/ChildClientDisable`,
      {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ Id: String(childClientId) }),
      },
    );

    const data = await upstreamResponse.json().catch(() => null);

    if (!upstreamResponse.ok || !data || data.status !== 'OK') {
      logError('associates/disable-simple', new Error('Bank status not OK'), {
        statusCode: upstreamResponse.status,
        body: data,
      });
      return res.status(upstreamResponse.status || 500).json({
        message: 'Error al deshabilitar el asociado en el banco.',
        statusCode: upstreamResponse.status,
        bncStatus: data?.status ?? null,
        bncMessage: data?.message ?? null,
        body: data,
      });
    }

    await prisma.associatedClient.updateMany({
      where: { childClientId: String(childClientId) },
      data: { isActive: false },
    });
    void auditEvent(req, {
      context: 'associates/disable-simple',
      action: 'DISABLE',
      entityType: 'AssociatedClient',
      entityId: String(childClientId),
      description: `Deshabilitó asociado ${String(childClientId)} en banco y BD`,
      metadata: {
        childClientId: String(childClientId),
      },
    });

    return res.status(200).json({
      message: 'Asociado deshabilitado en el banco y marcado inactivo en la base de datos.',
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
    logError('associates/disable-simple', error, { body: req.body });
    return res.status(500).json({
      message: 'No se pudo deshabilitar el asociado en el banco.',
    });
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

    void auditEvent(req, {
      context: 'associates/branches/create',
      action: 'CREATE',
      entityType: 'Branch',
      entityId: created.id,
      description: `Creó sucursal ${created.code} para asociado ${associateId}`,
      metadata: {
        id: created.id,
        associateId,
        code: created.code,
        name: created.name,
        isActive: created.isActive,
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
    void auditEvent(req, {
      context: 'associates/branches/list',
      action: 'VIEW',
      entityType: 'Branch',
      entityId: null,
      description: `Listado de sucursales para asociado ${associateId}`,
      metadata: {
        associateId,
        count: branches.length,
      },
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
    void auditEvent(req, {
      context: 'associates/branches/update',
      action: 'UPDATE',
      entityType: 'Branch',
      entityId: branchId,
      description: `Actualizó sucursal ${updated.code} para asociado ${associateId}`,
      metadata: {
        id: updated.id,
        associateId,
        code: updated.code,
        name: updated.name,
        isActive: updated.isActive,
      },
    });

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

    let deletedCode: string | null = null;

    try {
      const existing = await prisma.branch.findUnique({
        where: { id: branchId },
        select: { code: true },
      });
      deletedCode = existing?.code ?? null;
    } catch {
      // ignore
    }

    await prisma.branch.delete({
      where: { id: branchId },
    });

    void auditEvent(req, {
      context: 'associates/branches/delete',
      action: 'DELETE',
      entityType: 'Branch',
      entityId: branchId,
      description: deletedCode
        ? `Eliminó sucursal ${deletedCode} para asociado ${associateId}`
        : `Eliminó sucursal para asociado ${associateId}`,
      metadata: {
        associateId,
        branchId,
        code: deletedCode,
      },
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