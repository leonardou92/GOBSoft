import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { logError } from '../utils/logger';
import { auditEvent } from '../utils/audit';
import { authTokenMiddleware } from '../middleware/authToken';
import { requirePermissions } from '../middleware/authorize';

const router = Router();

// Crear cuenta bancaria
router.post(
  '/',
  authTokenMiddleware,
  requirePermissions(['MANAGE_BANK_ACCOUNTS']),
  async (req, res) => {
  try {
    const {
      clientId,
      accountNumber,
      alias,
      bankCode,
      currency,
      mobPaymentPhone,
      isActive,
    } = req.body || {};

    if (!clientId || !accountNumber || typeof bankCode !== 'number') {
      return res.status(400).json({
        message: 'Debe enviar clientId, accountNumber y bankCode (number).',
      });
    }

    const bank = await prisma.bank.findUnique({
      where: { code: bankCode },
    });

    if (!bank) {
      return res.status(400).json({
        message: `No existe un banco registrado con code=${bankCode}. Debe crear primero el banco antes de asociar cuentas.`,
      });
    }

    const created = await prisma.bankAccount.create({
      data: {
        clientId: String(clientId),
        accountNumber,
        alias: alias ?? null,
        bankCode,
        currency: currency ?? undefined,
        bankId: bank.id,
        mobPaymentPhone: mobPaymentPhone ?? null,
        isActive: typeof isActive === 'boolean' ? isActive : true,
      },
    });

    void auditEvent(req, {
      context: 'bank-accounts/create',
      action: 'CREATE',
      entityType: 'BankAccount',
      entityId: created.id,
      description: `Creó cuenta bancaria ${created.accountNumber}`,
      metadata: {
        id: created.id,
        clientId: created.clientId,
        accountNumber: created.accountNumber,
        bankCode: created.bankCode,
        alias: created.alias,
        mobPaymentPhone: created.mobPaymentPhone,
        isActive: created.isActive,
      },
    });

    return res.status(201).json(created);
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return res.status(409).json({
        message: 'Ya existe una cuenta con ese accountNumber.',
      });
    }

    logError('bank-accounts/create', error, { body: req.body });
    return res.status(500).json({ message: 'Error creando cuenta bancaria.' });
  }
  },
);

// Listar cuentas (opcionalmente filtradas por clientId)
router.get('/', authTokenMiddleware, requirePermissions(['VIEW_BANK_ACCOUNTS']), async (req, res) => {
  try {
    const { clientId } = req.query;

    const accounts = await prisma.bankAccount.findMany({
      where: clientId ? { clientId: String(clientId) } : undefined,
      orderBy: { createdAt: 'desc' },
    });
    void auditEvent(req, {
      context: 'bank-accounts/list',
      action: 'VIEW',
      entityType: 'BankAccount',
      entityId: null,
      description: 'Listado de cuentas bancarias',
      metadata: {
        clientId: clientId ? String(clientId) : null,
        count: accounts.length,
      },
    });

    return res.json(accounts);
  } catch (error) {
    logError('bank-accounts/list', error);
    return res.status(500).json({ message: 'Error listando cuentas bancarias.' });
  }
});

// Obtener una cuenta por id
router.get(
  '/:id',
  authTokenMiddleware,
  requirePermissions(['VIEW_BANK_ACCOUNTS']),
  async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      return res.status(400).json({ message: 'ID inválido.' });
    }

    const account = await prisma.bankAccount.findUnique({
      where: { id },
    });

    if (!account) {
      return res.status(404).json({ message: 'Cuenta no encontrada.' });
    }
    void auditEvent(req, {
      context: 'bank-accounts/detail',
      action: 'VIEW',
      entityType: 'BankAccount',
      entityId: id,
      description: `Detalle de cuenta bancaria ${account.accountNumber}`,
      metadata: {
        id: account.id,
        clientId: account.clientId,
        accountNumber: account.accountNumber,
        bankCode: account.bankCode,
        alias: account.alias,
        mobPaymentPhone: account.mobPaymentPhone,
        isActive: account.isActive,
      },
    });

    return res.json(account);
  } catch (error) {
    logError('bank-accounts/get', error, { params: req.params });
    return res.status(500).json({ message: 'Error obteniendo cuenta bancaria.' });
  }
},
);

// Actualizar una cuenta
router.put(
  '/:id',
  authTokenMiddleware,
  requirePermissions(['MANAGE_BANK_ACCOUNTS']),
  async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      return res.status(400).json({ message: 'ID inválido.' });
    }

    const {
      clientId,
      accountNumber,
      alias,
      bankCode,
      currency,
      mobPaymentPhone,
      isActive,
    } = req.body || {};

    const data: any = {};
    if (clientId !== undefined) data.clientId = String(clientId);
    if (accountNumber !== undefined) data.accountNumber = accountNumber;
    if (alias !== undefined) data.alias = alias;
    if (bankCode !== undefined) {
      data.bankCode = bankCode;
      const bank = await prisma.bank.findUnique({
        where: { code: Number(bankCode) },
      });
      if (!bank) {
        return res.status(400).json({
          message: `No existe un banco registrado con code=${bankCode}. Debe crear primero el banco antes de asociar cuentas.`,
        });
      }
      data.bankId = bank.id;
    }
    if (currency !== undefined) data.currency = currency;
    if (mobPaymentPhone !== undefined) data.mobPaymentPhone = mobPaymentPhone;
    if (isActive !== undefined) data.isActive = isActive;

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ message: 'No hay campos para actualizar.' });
    }

    const updated = await prisma.bankAccount.update({
      where: { id },
      data,
    });
    void auditEvent(req, {
      context: 'bank-accounts/update',
      action: 'UPDATE',
      entityType: 'BankAccount',
      entityId: id,
      description: `Actualizó cuenta bancaria ${updated.accountNumber}`,
      metadata: {
        id: updated.id,
        clientId: updated.clientId,
        accountNumber: updated.accountNumber,
        bankCode: updated.bankCode,
        alias: updated.alias,
        mobPaymentPhone: updated.mobPaymentPhone,
        isActive: updated.isActive,
      },
    });

    return res.json(updated);
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return res.status(409).json({
        message: 'Ya existe una cuenta con ese accountNumber.',
      });
    }

    logError('bank-accounts/update', error, { params: req.params, body: req.body });
    return res.status(500).json({ message: 'Error actualizando cuenta bancaria.' });
  }
},
);

// Eliminar una cuenta
router.delete(
  '/:id',
  authTokenMiddleware,
  requirePermissions(['MANAGE_BANK_ACCOUNTS']),
  async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      return res.status(400).json({ message: 'ID inválido.' });
    }

    let deletedAccountNumber: string | null = null;
    let deletedClientId: string | null = null;

    try {
      const existing = await prisma.bankAccount.findUnique({
        where: { id },
        select: { accountNumber: true, clientId: true },
      });
      deletedAccountNumber = existing?.accountNumber ?? null;
      deletedClientId = existing?.clientId ?? null;
    } catch {
      // ignore
    }

    await prisma.bankAccount.delete({
      where: { id },
    });

    void auditEvent(req, {
      context: 'bank-accounts/delete',
      action: 'DELETE',
      entityType: 'BankAccount',
      entityId: id,
      description: deletedAccountNumber
        ? `Eliminó cuenta bancaria ${deletedAccountNumber}`
        : 'Eliminó cuenta bancaria',
      metadata: {
        id,
        clientId: deletedClientId,
        accountNumber: deletedAccountNumber,
      },
    });

    return res.status(204).send();
  } catch (error: any) {
    if (error?.code === 'P2025') {
      return res.status(404).json({ message: 'Cuenta no encontrada.' });
    }

    logError('bank-accounts/delete', error, { params: req.params });
    return res.status(500).json({ message: 'Error eliminando cuenta bancaria.' });
  }
},
);

export default router;

