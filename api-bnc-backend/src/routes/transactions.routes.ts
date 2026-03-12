import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { logError } from '../utils/logger';

const router = Router();

// Obtener transacciones paginadas desde la base de datos
router.get('/', async (req, res) => {
  try {
    const page = Number(req.query.page ?? '1');
    const pageSize = Number(req.query.pageSize ?? '20');
    const accountNumber = req.query.accountNumber
      ? String(req.query.accountNumber)
      : undefined;
    const clientId = req.query.clientId ? String(req.query.clientId) : undefined;

    if (Number.isNaN(page) || page < 1) {
      return res.status(400).json({ message: 'page debe ser un número >= 1.' });
    }

    if (Number.isNaN(pageSize) || pageSize < 1 || pageSize > 200) {
      return res
        .status(400)
        .json({ message: 'pageSize debe estar entre 1 y 200.' });
    }

    const skip = (page - 1) * pageSize;

    const where: any = {};

    if (accountNumber) {
      where.accountNumber = accountNumber;
    }

    if (clientId) {
      where.bankAccount = { clientId };
    }

    const [items, total] = await Promise.all([
      prisma.bankTransaction.findMany({
        where,
        orderBy: { movementDate: 'desc' },
        skip,
        take: pageSize,
      }),
      prisma.bankTransaction.count({ where }),
    ]);

    const totalPages = Math.ceil(total / pageSize) || 1;

    return res.json({
      page,
      pageSize,
      total,
      totalPages,
      items,
    });
  } catch (error) {
    logError('transactions/list', error, { query: req.query });
    return res.status(500).json({ message: 'Error listando transacciones.' });
  }
});

export default router;

