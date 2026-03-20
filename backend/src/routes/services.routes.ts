import { Router } from 'express';
import { logError } from '../utils/logger';
import { prisma } from '../lib/prisma';
import { BankEnvironment, BankIntegrationProvider, BankIntegrationService } from '../generated/prisma/enums';

const router = Router();

// Lista de bancos disponibles (proxy al BNC) usando configuración de integración
router.post('/banks', async (_req, res) => {
  const env = process.env.NODE_ENV === 'production' ? BankEnvironment.PRODUCTION : BankEnvironment.SANDBOX;

  try {
    const config = await prisma.bankIntegrationConfig.findFirst({
      where: {
        provider: BankIntegrationProvider.BNC,
        environment: env,
        isActive: true,
        services: {
          some: { service: BankIntegrationService.GENERAL },
        },
      },
    });

    if (!config || !config.urlBase) {
      return res.status(500).json({
        message:
          'No se encontró configuración activa de integración para BNC (GENERAL). Verifique BankIntegrationConfig.',
      });
    }

    const upstreamResponse = await fetch(`${config.urlBase}/Services/Banks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: '{}', // El endpoint espera un objeto vacío
    });

    const data = await upstreamResponse.json().catch(() => null);

    if (!upstreamResponse.ok) {
      return res.status(upstreamResponse.status).json({
        message: 'Error al consultar la lista de bancos en el BNC.',
        statusCode: upstreamResponse.status,
        body: data,
      });
    }

    return res.status(200).json({
      message: 'Lista de bancos obtenida desde el BNC.',
      rawResponse: data,
    });
  } catch (error) {
    logError('services/banks', error);
    return res.status(500).json({
      message: 'No se pudo obtener la lista de bancos desde el BNC.',
    });
  }
});

export default router;

