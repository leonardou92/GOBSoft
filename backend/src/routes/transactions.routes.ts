import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { logError } from '../utils/logger';
import { auditEvent } from '../utils/audit';
import {
  getCodesForOperationType,
  getOperationTypeFromCode,
  getTransactionTypeLabel,
} from '../utils/transactionTypes';

const router = Router();

/**
 * GET /api/transactions
 * Transacciones desde la BD, con posible usuario asociado (TransactionLog).
 * Match por (amount, referenceA) entre BankTransaction y TransactionLog.
 */
router.get('/', async (req, res) => {
  try {
    const page = Number(req.query.page ?? '1');
    const pageSize = Number(req.query.pageSize ?? '20');
    const accountNumber = req.query.accountNumber
      ? String(req.query.accountNumber)
      : undefined;
    const clientId = req.query.clientId ? String(req.query.clientId) : undefined;
    const operationType = req.query.operationType
      ? String(req.query.operationType)
      : undefined;
    const startDate = req.query.startDate ? String(req.query.startDate) : undefined;
    const endDate = req.query.endDate ? String(req.query.endDate) : undefined;

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
      accountNumber?: string;
      bankAccount?: { clientId: string };
      code?: { in: string[] };
      movementDate?: { gte?: Date; lt?: Date };
    } = {};
    if (accountNumber) where.accountNumber = accountNumber;
    if (clientId) where.bankAccount = { clientId };
    if (operationType) {
      const codes = getCodesForOperationType(operationType);
      if (codes.length > 0) where.code = { in: codes };
    }

    if (startDate || endDate) {
      const parseDateOnly = (raw: string): Date | null => {
        const s = raw.trim();
        if (!s) return null;

        // Formato MM/DD/YYYY
        if (s.includes('/')) {
          const [month, day, year] = s.split('/');
          if (!day || !month || !year) return null;
          return new Date(Number(year), Number(month) - 1, Number(day), 0, 0, 0, 0);
        }

        // Formato YYYY-MM-DD (tratarlo sin zona horaria)
        const isoDateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
        if (isoDateMatch) {
          const [, yearStr, monthStr, dayStr] = isoDateMatch;
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

        // Cualquier otro formato, intentar con Date y luego normalizar al inicio del día
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
        where.movementDate = {};
        if (gte) where.movementDate.gte = gte;
        if (lt) where.movementDate.lt = lt;
      }
    }

    const withTotalParam = req.query.withTotal;
    const withTotal =
      typeof withTotalParam === 'string'
        ? withTotalParam.toLowerCase() !== 'false'
        : true;

    const auditParam = req.query.audit;
    const auditEnabled =
      typeof auditParam === 'string'
        ? auditParam.toLowerCase() !== 'false'
        : true;

    const rowsPromise = prisma.bankTransaction.findMany({
      where,
      orderBy: [
        { movementDate: 'desc' as const },
        { id: 'desc' as const },
      ],
      skip,
      take: pageSize,
    });

    const [rows, total] = await Promise.all([
      rowsPromise,
      withTotal ? prisma.bankTransaction.count({ where }) : Promise.resolve(0),
    ]);

    // --- Match con TransactionLog por (referenceA, amount) ---
    const pairKeys = rows
      .filter((r) => r.referenceA && r.amount != null)
      .map((r) => `${r.referenceA}::${r.amount}`);

    const logIndex = new Map<
      string,
      {
        id: number;
        username: string;
        firstName: string | null;
        lastName: string | null;
        email: string | null;
      } | null
    >();

    if (pairKeys.length > 0) {
      const distinctPairs = Array.from(new Set(pairKeys));
      const orClauses = distinctPairs.map((k) => {
        const [ref, amtStr] = k.split('::');
        return {
          reference: ref,
          amount: Number(amtStr),
        };
      });

      const logs = await prisma.transactionLog.findMany({
        where: { OR: orClauses },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      });

      for (const log of logs) {
        const key = `${log.reference ?? ''}::${log.amount ?? 0}`;
        if (!logIndex.has(key)) {
          logIndex.set(key, log.user ?? null);
        }
      }
    }

    const codeNum = (c: string) => {
      const n = parseInt(c, 10);
      return Number.isNaN(n) ? null : n;
    };

    const items = rows.map((row) => {
      const fromDbLabel = row.transactionTypeLabel ?? null;
      const computedLabel = getTransactionTypeLabel(row.code);

      const key = `${row.referenceA ?? ''}::${row.amount ?? 0}`;
      const user = logIndex.get(key) ?? null;

      return {
        ...row,
        transactionTypeCode: codeNum(row.code),
        operationType: getOperationTypeFromCode(row.code),
        transactionTypeLabel: fromDbLabel ?? computedLabel,
        user, // objeto de usuario o null
      };
    });

    const totalPages = withTotal ? Math.ceil(total / pageSize) || 1 : null;

    // Auditoría de vista de transacciones (solo primera página lógica)
    // - page === 1
    // - withTotal === true
    // - audit !== false (permite desactivar auditoría en llamadas internas)
    if (page === 1 && withTotal && auditEnabled) {
      void auditEvent(req, {
        context: 'transactions/list',
        action: 'VIEW',
        entityType: 'Transaction',
        entityId: null,
        description: 'Listado de transacciones',
        metadata: {
          page,
          pageSize,
          accountNumber: accountNumber ?? null,
          clientId: clientId ?? null,
          operationType: operationType ?? null,
          startDate: startDate ?? null,
          endDate: endDate ?? null,
          withTotal,
        },
      });
    }

    return res.json({
      page,
      pageSize,
      total: withTotal ? total : undefined,
      totalPages,
      items,
    });
  } catch (error) {
    logError('transactions/list', error, { query: req.query });
    return res.status(500).json({ message: 'Error listando transacciones.' });
  }
});

export default router;