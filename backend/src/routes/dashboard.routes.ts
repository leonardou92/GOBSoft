import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { logError } from '../utils/logger';
import { authTokenMiddleware } from '../middleware/authToken';
import { requirePermissions } from '../middleware/authorize';

const router = Router();

function parseIsoDateOr400(value: unknown, fieldName: string): { start: Date; end: Date } {
  if (typeof value !== 'string') {
    throw new Error(`${fieldName} debe ser un string YYYY-MM-DD.`);
  }

  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) {
    throw new Error(`${fieldName} debe tener formato YYYY-MM-DD.`);
  }

  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);

  const start = new Date(year, month - 1, day, 0, 0, 0, 0);
  // Inclusive (final del día) usando hora local del servidor.
  const end = new Date(year, month - 1, day, 23, 59, 59, 999);

  // Validación básica (evita overflow silencioso por fechas inválidas).
  if (
    start.getFullYear() !== year ||
    start.getMonth() !== month - 1 ||
    start.getDate() !== day
  ) {
    throw new Error(`${fieldName} contiene una fecha inválida.`);
  }

  return { start, end };
}

function dayRangeIntersect(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
): { start: Date; end: Date } | null {
  const start = aStart > bStart ? aStart : bStart;
  const end = aEnd < bEnd ? aEnd : bEnd;
  if (start.getTime() > end.getTime()) return null;
  return { start, end };
}

function toIsoOrNull(d: Date | null): string | null {
  return d ? d.toISOString() : null;
}

/**
 * GET /api/dashboard/heartbeat
 *
 * Endpoint muy ligero para que el frontend sepa si hay cambios relevantes
 * desde la última vez que refrescó el Dashboard.
 *
 * Contrato esperado por el frontend:
 * - lastTransactionsUpdateAt
 * - lastErrorLogsUpdateAt
 * - watermark (MAX(updatedAt) en DB)
 * - updated (comparando watermark actual contra `since`)
 * - recentTx / hoy / ayer / txStats
 */
router.get(
  '/heartbeat',
  authTokenMiddleware,
  requirePermissions(['VIEW_DASHBOARD']),
  async (req, res) => {
  try {
    const {
      startDate: startDateRaw,
      endDate: endDateRaw,
      recentPageSize: recentPageSizeRaw,
      since: sinceRaw,
    } = req.query || {};

    const recentPageSize =
      recentPageSizeRaw != null
        ? Number(recentPageSizeRaw)
        : 5; // elegido para mantener respuesta liviana

    if (!Number.isFinite(recentPageSize) || recentPageSize < 1 || recentPageSize > 200) {
      return res.status(400).json({ message: 'recentPageSize debe estar entre 1 y 200.' });
    }

    // Si el frontend no manda startDate/endDate, calculamos “hoy/ayer” en base
    // a la zona horaria local del servidor (para coincidir con los cálculos actuales).
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    const yesterdayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() - 1,
      0,
      0,
      0,
      0,
    );
    const yesterdayEnd = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() - 1,
      23,
      59,
      59,
      999,
    );

    let rangeStart: Date;
    let rangeEnd: Date;
    if (startDateRaw || endDateRaw) {
      // Si viene uno, debe venir el otro.
      if (!startDateRaw || !endDateRaw) {
        return res.status(400).json({ message: 'Debe enviar ambos startDate y endDate o ninguno.' });
      }

      try {
        const parsedStart = parseIsoDateOr400(startDateRaw, 'startDate');
        const parsedEnd = parseIsoDateOr400(endDateRaw, 'endDate');

        rangeStart = parsedStart.start;
        rangeEnd = parsedEnd.end;
      } catch (e: any) {
        return res.status(400).json({ message: e?.message ?? 'Parámetros inválidos.' });
      }

      if (rangeStart.getTime() > rangeEnd.getTime()) {
        return res.status(400).json({ message: 'startDate no puede ser mayor que endDate.' });
      }
    } else {
      // Rango por defecto: ayer + hoy.
      rangeStart = yesterdayStart;
      rangeEnd = todayEnd;
    }

    let sinceDate: Date | null = null;
    if (sinceRaw != null) {
      if (typeof sinceRaw !== 'string') {
        return res.status(400).json({ message: 'since debe ser un timestamp ISO-8601 válido.' });
      }
      const d = new Date(sinceRaw);
      if (Number.isNaN(d.getTime())) {
        return res.status(400).json({ message: 'since debe ser un timestamp ISO-8601 válido.' });
      }
      sinceDate = d;
    }

    const [txMaxAgg, errAgg] = await Promise.all([
      prisma.bankTransaction.aggregate({
        _max: { updatedAt: true },
        where: {
          movementDate: {
            gte: rangeStart,
            lte: rangeEnd,
          },
        },
      }),
      prisma.apiErrorLog.aggregate({
        _max: { createdAt: true },
      }),
    ]);

    const watermark = txMaxAgg._max.updatedAt ?? null;
    const updated = sinceDate ? watermark?.getTime() !== sinceDate.getTime() : true;

    // Si no cambió nada, no recalculamos recentTx / counts / stats.
    if (!updated) {
      return res.json({
        watermark: toIsoOrNull(watermark),
        lastTransactionsUpdateAt: toIsoOrNull(watermark),
        lastErrorLogsUpdateAt: errAgg._max.createdAt ? errAgg._max.createdAt.toISOString() : null,
        updated: false,
        recentTx: [],
        todayTxCount: 0,
        yesterdayTxCount: 0,
        txStats: {
          p2pCount: 0,
          c2pCount: 0,
          vposCount: 0,
          immediateCreditCount: 0,
        },
      });
    }

    // updated=true: recalcular el contrato completo para el rango.
    const [recentTx, todayTxCount, yesterdayTxCount, txStats] = await Promise.all([
      prisma.bankTransaction.findMany({
        where: {
          movementDate: {
            gte: rangeStart,
            lte: rangeEnd,
          },
        },
        orderBy: [{ movementDate: 'desc' }, { externalOrder: 'desc' }, { id: 'desc' }],
        take: recentPageSize,
        select: {
          id: true,
          movementDate: true,
          transactionTypeLabel: true,
          type: true,
          amount: true,
          balanceDelta: true,
          accountNumber: true,
        },
      }),
      (() => {
        const intersectionToday = dayRangeIntersect(
          rangeStart,
          rangeEnd,
          todayStart,
          todayEnd,
        );
        if (!intersectionToday) return Promise.resolve(0);
        return prisma.bankTransaction.count({
          where: {
            movementDate: {
              gte: intersectionToday.start,
              lte: intersectionToday.end,
            },
          },
        });
      })(),
      (() => {
        const intersectionYesterday = dayRangeIntersect(
          rangeStart,
          rangeEnd,
          yesterdayStart,
          yesterdayEnd,
        );
        if (!intersectionYesterday) return Promise.resolve(0);
        return prisma.bankTransaction.count({
          where: {
            movementDate: {
              gte: intersectionYesterday.start,
              lte: intersectionYesterday.end,
            },
          },
        });
      })(),
      (async () => {
        const baseWhere = {
          movementDate: {
            gte: rangeStart,
            lte: rangeEnd,
          },
        } as const;

        const [
          p2pCount,
          c2pCount,
          vposCount,
          immediateCreditCount,
        ] = await Promise.all([
          prisma.bankTransaction.count({
            where: {
              ...baseWhere,
              OR: [
                { transactionTypeLabel: { contains: 'P2P' } },
                { transactionTypeLabel: { contains: 'p2p' } },
                { type: { contains: 'P2P' } },
                { type: { contains: 'p2p' } },
              ],
            },
          }),
          prisma.bankTransaction.count({
            where: {
              ...baseWhere,
              OR: [
                { transactionTypeLabel: { contains: 'C2P' } },
                { transactionTypeLabel: { contains: 'c2p' } },
                { type: { contains: 'C2P' } },
                { type: { contains: 'c2p' } },
              ],
            },
          }),
          prisma.bankTransaction.count({
            where: {
              ...baseWhere,
              OR: [
                { transactionTypeLabel: { contains: 'VPOS' } },
                { transactionTypeLabel: { contains: 'vpos' } },
                { type: { contains: 'VPOS' } },
                { type: { contains: 'vpos' } },
              ],
            },
          }),
          prisma.bankTransaction.count({
            where: {
              ...baseWhere,
              OR: [
                { transactionTypeLabel: { contains: 'CRÉDITO INMEDIATO' } },
                { transactionTypeLabel: { contains: 'Crédito Inmediato' } },
                { transactionTypeLabel: { contains: 'crédito inmediato' } },
                { transactionTypeLabel: { contains: 'CREDITO INMEDIATO' } },
                { transactionTypeLabel: { contains: 'Credito Inmediato' } },
                { transactionTypeLabel: { contains: 'credito inmediato' } },
                { type: { contains: 'CRÉDITO INMEDIATO' } },
                { type: { contains: 'Crédito Inmediato' } },
                { type: { contains: 'crédito inmediato' } },
                { type: { contains: 'CREDITO INMEDIATO' } },
                { type: { contains: 'Credito Inmediato' } },
                { type: { contains: 'credito inmediato' } },
              ],
            },
          }),
        ]);

        return {
          p2pCount,
          c2pCount,
          vposCount,
          immediateCreditCount,
        };
      })(),
    ]);

    return res.json({
      watermark: toIsoOrNull(watermark),
      lastTransactionsUpdateAt: toIsoOrNull(watermark),
      lastErrorLogsUpdateAt: errAgg._max.createdAt ? errAgg._max.createdAt.toISOString() : null,
      updated: true,
      recentTx: recentTx.map((tx) => ({
        id: tx.id,
        movementDate: tx.movementDate.toISOString(),
        transactionTypeLabel: tx.transactionTypeLabel ?? tx.type ?? null,
        type: tx.type,
        amount: tx.amount,
        balanceDelta: tx.balanceDelta,
        accountNumber: tx.accountNumber,
      })),
      todayTxCount,
      yesterdayTxCount,
      txStats,
    });
  } catch (error) {
    logError('dashboard/heartbeat', error);
    return res.status(500).json({
      message: 'No se pudo obtener el estado del Dashboard.',
    });
  }
},
);

export default router;

