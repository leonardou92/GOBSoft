import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { logError } from '../utils/logger';

const router = Router();

// Crear cuenta bancaria
router.post('/', async (req, res) => {
  try {
    const {
      clientId,
      accountNumber,
      alias,
      bankCode,
      mobPaymentPhone,
      isActive,
    } = req.body || {};

    if (!clientId || !accountNumber || typeof bankCode !== 'number') {
      return res.status(400).json({
        message: 'Debe enviar clientId, accountNumber y bankCode (number).',
      });
    }

    const created = await prisma.bankAccount.create({
      data: {
        clientId,
        accountNumber,
        alias: alias ?? null,
        bankCode,
        mobPaymentPhone: mobPaymentPhone ?? null,
        isActive: typeof isActive === 'boolean' ? isActive : true,
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
});

// Listar cuentas (opcionalmente filtradas por clientId)
router.get('/', async (req, res) => {
  try {
    const { clientId } = req.query;

    const accounts = await prisma.bankAccount.findMany({
      where: clientId ? { clientId: String(clientId) } : undefined,
      orderBy: { createdAt: 'desc' },
    });

    return res.json(accounts);
  } catch (error) {
    logError('bank-accounts/list', error);
    return res.status(500).json({ message: 'Error listando cuentas bancarias.' });
  }
});

// Obtener una cuenta por id
router.get('/:id', async (req, res) => {
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

    return res.json(account);
  } catch (error) {
    logError('bank-accounts/get', error, { params: req.params });
    return res.status(500).json({ message: 'Error obteniendo cuenta bancaria.' });
  }
});

// Actualizar una cuenta
router.put('/:id', async (req, res) => {
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
      mobPaymentPhone,
      isActive,
    } = req.body || {};

    const data: any = {};
    if (clientId !== undefined) data.clientId = clientId;
    if (accountNumber !== undefined) data.accountNumber = accountNumber;
    if (alias !== undefined) data.alias = alias;
    if (bankCode !== undefined) data.bankCode = bankCode;
    if (mobPaymentPhone !== undefined) data.mobPaymentPhone = mobPaymentPhone;
    if (isActive !== undefined) data.isActive = isActive;

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ message: 'No hay campos para actualizar.' });
    }

    const updated = await prisma.bankAccount.update({
      where: { id },
      data,
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
});

// Eliminar una cuenta
router.delete('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      return res.status(400).json({ message: 'ID inválido.' });
    }

    await prisma.bankAccount.delete({
      where: { id },
    });

    return res.status(204).send();
  } catch (error: any) {
    if (error?.code === 'P2025') {
      return res.status(404).json({ message: 'Cuenta no encontrada.' });
    }

    logError('bank-accounts/delete', error, { params: req.params });
    return res.status(500).json({ message: 'Error eliminando cuenta bancaria.' });
  }
});

export default router;

