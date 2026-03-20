import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { logError } from '../utils/logger';
import { auditEvent } from '../utils/audit';
import { encryptJson, decryptJson } from '../utils/bncCrypto';
import { authTokenMiddleware } from '../middleware/authToken';
import { requirePermissions } from '../middleware/authorize';
import {
  BankEnvironment,
  BankIntegrationProvider,
  BankIntegrationService,
} from '../generated/prisma/enums';
// Importamos solo tipos/enums; la lógica de auto-registro usará directamente
// los datos de integración recién guardados en lugar de pasar por resolveBankClient.

const URL_BASE_REGEX = /^https?:\/\/.+/i;

const router = Router();

async function testBncLogon(params: {
  urlBase: string;
  clientGuid: string;
  masterKey: string;
}) {
  const { urlBase, clientGuid, masterKey } = params;

  const { value, validation } = encryptJson(
    {
      ClientGUID: clientGuid,
    },
    masterKey,
  );

  const envelope = {
    ClientGUID: clientGuid,
    Reference: `CFG-LOGON-${Date.now()}`,
    Value: value,
    Validation: validation,
    swTestOperation: false,
  };

  const response = await fetch(`${urlBase.replace(/\/+$/, '')}/Auth/LogOn`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(envelope),
  });

  const body = await response.json().catch(() => null);

  return {
    ok: response.ok && body && body.status === 'OK',
    statusCode: response.status,
    body,
  };
}

// Crear configuración de integración bancaria
router.post(
  '/',
  authTokenMiddleware,
  requirePermissions(['MANAGE_BANK_INTEGRATIONS']),
  async (req, res) => {
  try {
    const {
      bankId,
      provider,
      environment,
      services,
      urlBase,
      clientGuid,
      masterKey,
      clientId,
      affiliationNumber,
      terminalId,
      secret,
      apiKey,
      token,
      extra,
      isActive,
    } = req.body || {};

    if (!bankId || !provider || !environment || !services) {
      return res.status(400).json({
        message: 'Debe enviar bankId, provider, environment y services.',
      });
    }

    if (!Object.values(BankIntegrationProvider).includes(provider)) {
      return res.status(400).json({
        message: `provider inválido. Valores permitidos: ${Object.values(BankIntegrationProvider).join(
          ', ',
        )}.`,
      });
    }

    if (!Object.values(BankEnvironment).includes(environment)) {
      return res.status(400).json({
        message: `environment inválido. Valores permitidos: ${Object.values(BankEnvironment).join(
          ', ',
        )}.`,
      });
    }

    const servicesArray: BankIntegrationService[] = Array.isArray(services)
      ? services
      : [services];

    if (
      servicesArray.length === 0 ||
      !servicesArray.every((s) => Object.values(BankIntegrationService).includes(s))
    ) {
      return res.status(400).json({
        message: `services inválido(s). Valores permitidos: ${Object.values(
          BankIntegrationService,
        ).join(', ')}.`,
      });
    }

    // Validar banco soportado y provider esperado según código de banco
    const bank = await prisma.bank.findUnique({
      where: { id: Number(bankId) },
    });

    if (!bank) {
      return res.status(400).json({
        message: `Banco no encontrado para bankId=${bankId}.`,
      });
    }

    let expectedProvider: BankIntegrationProvider | null = null;
    if (bank.code === 191) {
      expectedProvider = BankIntegrationProvider.BNC;
    } else if (bank.code === 102) {
      expectedProvider = BankIntegrationProvider.BDV;
    }

    if (!expectedProvider) {
      return res.status(400).json({
        message:
          'Este banco no soporta integraciones configurables. Solo se permiten bancos con código 191 (BNC) o 102 (BDV).',
      });
    }

    if (provider !== expectedProvider) {
      return res.status(400).json({
        message: `provider inválido para este banco. Para banco código ${bank.code} el provider debe ser "${expectedProvider}".`,
      });
    }

    // Reglas de campos requeridos por proveedor / servicios (alineadas con frontend)
    const missingFields: string[] = [];

    const requireField = (name: string, value: unknown, validateUrl = false) => {
      if (value === undefined || value === null || value === '') {
        missingFields.push(name);
        return;
      }
      if (validateUrl && typeof value === 'string' && !URL_BASE_REGEX.test(value)) {
        missingFields.push(`${name} (formato inválido, debe iniciar con http:// o https://)`);
      }
    };

    if (provider === BankIntegrationProvider.BNC) {
      // Siempre requeridos para BNC
      requireField('urlBase', urlBase, true);
      requireField('clientGuid', clientGuid);
      requireField('masterKey', masterKey);
      requireField('clientId', clientId);

      // Servicios adicionales
      if (servicesArray.includes(BankIntegrationService.VPOS)) {
        requireField('affiliationNumber', affiliationNumber);
      }
      if (servicesArray.includes(BankIntegrationService.C2P)) {
        requireField('terminalId', terminalId);
      }
    }

    if (provider === BankIntegrationProvider.BDV) {
      const hasQueries = servicesArray.includes(BankIntegrationService.QUERIES);
      const hasPasarela =
        servicesArray.includes(BankIntegrationService.VPOS) ||
        servicesArray.includes(BankIntegrationService.C2P);

      if (hasQueries) {
        requireField('urlBase', urlBase, true);
        requireField('token', token);
      }

      if (hasPasarela) {
        requireField('secret', secret);
        requireField('apiKey', apiKey);
      }
    }

    if (missingFields.length > 0) {
      return res.status(400).json({
        message: `Faltan campos requeridos para la configuración de integración bancaria: ${missingFields.join(
          ', ',
        )}.`,
      });
    }

    // Validación remota: probar Logon contra BNC antes de guardar (solo BNC por ahora)
    if (provider === BankIntegrationProvider.BNC) {
      try {
        const logonResult = await testBncLogon({
          urlBase: String(urlBase),
          clientGuid: String(clientGuid),
          masterKey: String(masterKey),
        });

        if (!logonResult.ok) {
          logError('bank-integrations/logon-check-bnc', new Error('BNC Logon failed'), {
            urlBase,
            clientGuid,
            statusCode: logonResult.statusCode,
            body: logonResult.body,
          });

          return res.status(400).json({
            message:
              'No se pudo validar la configuración contra el BNC (Logon). Verifique ClientGUID, MasterKey y URL base.',
            statusCode: logonResult.statusCode,
            bncResponse: logonResult.body,
          });
        }
      } catch (error) {
        logError('bank-integrations/logon-check-bnc', error, {
          urlBase,
          clientGuid,
        });
        return res.status(502).json({
          message:
            'Error llamando al servicio de Logon del BNC al validar la configuración.',
        });
      }
    }

    const created = await prisma.bankIntegrationConfig.create({
      data: {
        bankId: Number(bankId),
        provider,
        environment,
        urlBase: urlBase ?? null,
        clientGuid: clientGuid ?? null,
        masterKey: masterKey ?? null,
        clientId: clientId ?? null,
        affiliationNumber: affiliationNumber ?? null,
        terminalId: terminalId ?? null,
        secret: secret ?? null,
        apiKey: apiKey ?? null,
        token: token ?? null,
        extra: extra ?? undefined,
        isActive: typeof isActive === 'boolean' ? isActive : true,
        services: {
          createMany: {
            data: servicesArray.map((s) => ({ service: s })),
            skipDuplicates: true,
          },
        },
      },
      include: {
        services: true,
      },
    });

    const createdForFrontend = {
      ...created,
      services: created.services.map((s) => s.service),
    };

    void auditEvent(req, {
      context: 'bank-integrations/create',
      action: 'CREATE',
      entityType: 'BankIntegrationConfig',
      entityId: created.id,
      description: `Creó configuración de integración bancaria para bancoId=${created.bankId}, provider=${created.provider}, environment=${created.environment}, services=${createdForFrontend.services.join(
        ',',
      )}`,
      metadata: createdForFrontend,
    });

    return res.status(201).json(createdForFrontend);
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return res.status(409).json({
        message:
          'Ya existe una configuración para este banco, entorno y servicio. Actualice la existente.',
      });
    }

    logError('bank-integrations/create', error, { body: req.body });
    return res.status(500).json({ message: 'Error creando configuración de integración bancaria.' });
  }
},
);

// Wizard transaccional: crear/actualizar banco + integración en un solo paso
router.post(
  '/wizard',
  authTokenMiddleware,
  requirePermissions(['MANAGE_BANK_INTEGRATIONS']),
  async (req, res) => {
  try {
    const { bank, integration } = req.body || {};

    if (!bank || !integration) {
      return res.status(400).json({
        message: 'Debe enviar los objetos bank e integration en el cuerpo.',
      });
    }

    const { code, name, isActive: bankIsActive } = bank as {
      code?: number | string;
      name?: string;
      isActive?: boolean;
    };

    if (code === undefined || code === null || !name) {
      return res.status(400).json({
        message: 'El objeto bank debe incluir code (number) y name (string).',
      });
    }

    const {
      environment,
      services,
      urlBase,
      clientGuid,
      masterKey,
      clientId,
      affiliationNumber,
      terminalId,
      secret,
      apiKey,
      token,
      extra,
      isActive: integrationIsActive,
    } = integration as any;

    if (!environment || !services) {
      return res.status(400).json({
        message: 'El objeto integration debe incluir environment y services.',
      });
    }

    if (!Object.values(BankEnvironment).includes(environment)) {
      return res.status(400).json({
        message: `environment inválido. Valores permitidos: ${Object.values(BankEnvironment).join(
          ', ',
        )}.`,
      });
    }

    const servicesArray: BankIntegrationService[] = Array.isArray(services)
      ? services
      : [services];

    if (
      servicesArray.length === 0 ||
      !servicesArray.every((s) => Object.values(BankIntegrationService).includes(s))
    ) {
      return res.status(400).json({
        message: `services inválido(s). Valores permitidos: ${Object.values(
          BankIntegrationService,
        ).join(', ')}.`,
      });
    }

    const bankCodeNum = Number(code);
    if (!Number.isFinite(bankCodeNum)) {
      return res.status(400).json({
        message: 'bank.code debe ser numérico.',
      });
    }

    let expectedProvider: BankIntegrationProvider | null = null;
    if (bankCodeNum === 191) {
      expectedProvider = BankIntegrationProvider.BNC;
    } else if (bankCodeNum === 102) {
      expectedProvider = BankIntegrationProvider.BDV;
    }

    if (!expectedProvider) {
      return res.status(400).json({
        message:
          'Este banco no soporta integraciones configurables. Solo se permiten bancos con código 191 (BNC) o 102 (BDV).',
      });
    }

    const missingFields: string[] = [];
    const requireField = (name: string, value: unknown, validateUrl = false) => {
      if (value === undefined || value === null || value === '') {
        missingFields.push(name);
        return;
      }
      if (validateUrl && typeof value === 'string' && !URL_BASE_REGEX.test(value)) {
        missingFields.push(
          `${name} (formato inválido, debe iniciar con http:// o https://)`,
        );
      }
    };

    if (expectedProvider === BankIntegrationProvider.BNC) {
      requireField('urlBase', urlBase, true);
      requireField('clientGuid', clientGuid);
      requireField('masterKey', masterKey);
      requireField('clientId', clientId);

      if (servicesArray.includes(BankIntegrationService.VPOS)) {
        requireField('affiliationNumber', affiliationNumber);
      }
      if (servicesArray.includes(BankIntegrationService.C2P)) {
        requireField('terminalId', terminalId);
      }
    }

    if (expectedProvider === BankIntegrationProvider.BDV) {
      const hasQueries = servicesArray.includes(BankIntegrationService.QUERIES);
      const hasPasarela =
        servicesArray.includes(BankIntegrationService.VPOS) ||
        servicesArray.includes(BankIntegrationService.C2P);

      if (hasQueries) {
        requireField('urlBase', urlBase, true);
        requireField('token', token);
      }

      if (hasPasarela) {
        requireField('secret', secret);
        requireField('apiKey', apiKey);
      }
    }

    if (missingFields.length > 0) {
      return res.status(400).json({
        message: `Faltan campos requeridos para la integración bancaria: ${missingFields.join(
          ', ',
        )}.`,
      });
    }

    // Validación remota: probar Logon contra BNC antes de guardar (solo para BNC, código 191)
    if (expectedProvider === BankIntegrationProvider.BNC) {
      try {
        const logonResult = await testBncLogon({
          urlBase: String(urlBase),
          clientGuid: String(clientGuid),
          masterKey: String(masterKey),
        });

        if (!logonResult.ok) {
          logError('bank-integrations/wizard-logon-check-bnc', new Error('BNC Logon failed'), {
            urlBase,
            clientGuid,
            statusCode: logonResult.statusCode,
            body: logonResult.body,
          });

          return res.status(400).json({
            message:
              'No se pudo validar la configuración contra el BNC (Logon). Verifique ClientGUID, MasterKey y URL base.',
            statusCode: logonResult.statusCode,
            bncResponse: logonResult.body,
          });
        }
      } catch (error) {
        logError('bank-integrations/wizard-logon-check-bnc', error, {
          urlBase,
          clientGuid,
        });
        return res.status(502).json({
          message:
            'Error llamando al servicio de Logon del BNC al validar la configuración en el wizard.',
        });
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1) Crear o actualizar banco por code
      const existingBank = await tx.bank.findUnique({
        where: { code: bankCodeNum },
      });

      const bankRecord = existingBank
        ? await tx.bank.update({
            where: { id: existingBank.id },
            data: {
              name: String(name),
              isActive:
                typeof bankIsActive === 'boolean'
                  ? bankIsActive
                  : existingBank.isActive,
            },
          })
        : await tx.bank.create({
            data: {
              code: bankCodeNum,
              name: String(name),
              isActive: typeof bankIsActive === 'boolean' ? bankIsActive : true,
            },
          });

      // 2) Crear o actualizar integración para ese banco (solo una por banco + entorno)
      const existingConfig = await tx.bankIntegrationConfig.findFirst({
        where: { bankId: bankRecord.id, environment },
        include: { services: true },
      });

      const data = {
        bankId: bankRecord.id,
        provider: expectedProvider!,
        environment,
        urlBase: urlBase ?? null,
        clientGuid: clientGuid ?? null,
        masterKey: masterKey ?? null,
        clientId: clientId ?? null,
        affiliationNumber: affiliationNumber ?? null,
        terminalId: terminalId ?? null,
        secret: secret ?? null,
        apiKey: apiKey ?? null,
        token: token ?? null,
        extra: extra ?? undefined,
        isActive:
          typeof integrationIsActive === 'boolean' ? integrationIsActive : true,
      };

      let integrationRecord;
      if (existingConfig) {
        integrationRecord = await tx.bankIntegrationConfig.update({
          where: { id: existingConfig.id },
          data: {
            ...data,
            services: {
              deleteMany: {},
              createMany: {
                data: servicesArray.map((s) => ({ service: s })),
                skipDuplicates: true,
              },
            },
          },
          include: { services: true },
        });
      } else {
        integrationRecord = await tx.bankIntegrationConfig.create({
          data: {
            ...data,
            services: {
              createMany: {
                data: servicesArray.map((s) => ({ service: s })),
                skipDuplicates: true,
              },
            },
          },
          include: { services: true },
        });
      }

      return { bank: bankRecord, integration: integrationRecord };
    });

    const { bank: bankResult, integration: integrationResult } = result as any;
    const integrationForFrontend = {
      ...integrationResult,
      services: integrationResult.services.map((s: any) => s.service),
    };

    return res.status(200).json({
      bank: bankResult,
      integration: integrationForFrontend,
    });
  } catch (error) {
    logError('bank-integrations/wizard', error, { body: req.body });
    return res.status(500).json({
      message:
        'Error ejecutando el wizard de banco + integración bancaria. Revise los datos e intente de nuevo.',
    });
  }
},
);

// Listar configuraciones (con filtros opcionales)
router.get(
  '/',
  authTokenMiddleware,
  requirePermissions(['VIEW_BANK_INTEGRATIONS']),
  async (req, res) => {
  try {
    const { bankId, provider, environment, service, isActive } = req.query || {};

    const configs = await prisma.bankIntegrationConfig.findMany({
      where: {
        bankId: bankId ? Number(bankId) : undefined,
        provider: provider
          ? (provider as unknown as BankIntegrationProvider)
          : undefined,
        environment: environment
          ? (environment as unknown as BankEnvironment)
          : undefined,
        isActive:
          typeof isActive === 'string'
            ? isActive.toLowerCase() === 'all'
              ? undefined
              : isActive.toLowerCase() === 'true'
            : undefined,
        services: service
          ? {
              some: {
                service: service as unknown as BankIntegrationService,
              },
            }
          : undefined,
      },
      include: {
        bank: true,
        services: true,
      },
      orderBy: [{ bankId: 'asc' }, { environment: 'asc' }],
    });

    const configsForFrontend = configs.map((c: any) => ({
      ...c,
      services: c.services.map((s: any) => s.service),
    }));

    void auditEvent(req, {
      context: 'bank-integrations/list',
      action: 'VIEW',
      entityType: 'BankIntegrationConfig',
      entityId: null,
      description: 'Listado de configuraciones de integración bancaria',
      metadata: {
        count: configsForFrontend.length,
        filters: {
          bankId: bankId ? Number(bankId) : null,
          provider: provider ? String(provider) : null,
          environment: environment ? String(environment) : null,
          service: service ? String(service) : null,
          isActive,
        },
      },
    });

    return res.json(configsForFrontend);
  } catch (error) {
    logError('bank-integrations/list', error, { query: req.query });
    return res.status(500).json({
      message: 'Error listando configuraciones de integración bancaria.',
    });
  }
},
);

// Obtener configuración por id
router.get(
  '/:id',
  authTokenMiddleware,
  requirePermissions(['VIEW_BANK_INTEGRATIONS']),
  async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ message: 'ID inválido.' });
    }

    const config = await prisma.bankIntegrationConfig.findUnique({
      where: { id },
      include: { bank: true, services: true },
    });

    if (!config) {
      return res.status(404).json({ message: 'Configuración no encontrada.' });
    }

    const configForFrontend = {
      ...config,
      services: config.services.map((s: any) => s.service),
    };

    void auditEvent(req, {
      context: 'bank-integrations/detail',
      action: 'VIEW',
      entityType: 'BankIntegrationConfig',
      entityId: id,
      description: `Detalle de configuración de integración bancaria ${id}`,
      metadata: { id },
    });

    return res.json(configForFrontend);
  } catch (error) {
    logError('bank-integrations/detail', error, { params: req.params });
    return res.status(500).json({ message: 'Error obteniendo configuración de integración bancaria.' });
  }
},
);

// Actualizar configuración
router.put(
  '/:id',
  authTokenMiddleware,
  requirePermissions(['MANAGE_BANK_INTEGRATIONS']),
  async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ message: 'ID inválido.' });
    }

    const existing = await prisma.bankIntegrationConfig.findUnique({
      where: { id },
      include: { services: true },
    });

    if (!existing) {
      return res.status(404).json({ message: 'Configuración no encontrada.' });
    }

    const {
      bankId,
      provider,
      environment,
      services,
      urlBase,
      clientGuid,
      masterKey,
      clientId,
      affiliationNumber,
      terminalId,
      secret,
      apiKey,
      token,
      extra,
      isActive,
    } = req.body || {};

    const data: any = {};

    if (bankId !== undefined) data.bankId = Number(bankId);
    if (provider !== undefined) {
      if (!Object.values(BankIntegrationProvider).includes(provider)) {
        return res.status(400).json({
          message: `provider inválido. Valores permitidos: ${Object.values(
            BankIntegrationProvider,
          ).join(', ')}.`,
        });
      }
      data.provider = provider;
    }
    if (environment !== undefined) {
      if (!Object.values(BankEnvironment).includes(environment)) {
        return res.status(400).json({
          message: `environment inválido. Valores permitidos: ${Object.values(
            BankEnvironment,
          ).join(', ')}.`,
        });
      }
      data.environment = environment;
    }

    let servicesArray: BankIntegrationService[] = existing.services.map(
      (s: any) => s.service as BankIntegrationService,
    );
    if (services !== undefined) {
      servicesArray = Array.isArray(services) ? services : [services];

      if (
        servicesArray.length === 0 ||
        !servicesArray.every((s) => Object.values(BankIntegrationService).includes(s))
      ) {
        return res.status(400).json({
          message: `services inválido(s). Valores permitidos: ${Object.values(
            BankIntegrationService,
          ).join(', ')}.`,
        });
      }
      // Los servicios se actualizan más abajo vía relación hija
    }

    if (urlBase !== undefined) data.urlBase = urlBase;
    if (clientGuid !== undefined) data.clientGuid = clientGuid;
    if (masterKey !== undefined) data.masterKey = masterKey;
    if (clientId !== undefined) data.clientId = clientId;
    if (affiliationNumber !== undefined) data.affiliationNumber = affiliationNumber;
    if (terminalId !== undefined) data.terminalId = terminalId;
    if (secret !== undefined) data.secret = secret;
    if (apiKey !== undefined) data.apiKey = apiKey;
    if (token !== undefined) data.token = token;
    if (extra !== undefined) data.extra = extra;
    if (isActive !== undefined) data.isActive = Boolean(isActive);

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ message: 'No hay campos para actualizar.' });
    }

    // Estado resultante después de la actualización (para validar reglas de negocio)
    const resultingBankId = data.bankId ?? existing.bankId;
    const resultingProvider = (data.provider ?? existing.provider) as BankIntegrationProvider;
    const resultingEnvironment = (data.environment ?? existing.environment) as BankEnvironment;
    const resultingUrlBase = data.urlBase ?? existing.urlBase;
    const resultingClientGuid = data.clientGuid ?? existing.clientGuid;
    const resultingMasterKey = data.masterKey ?? existing.masterKey;
    const resultingClientId = data.clientId ?? existing.clientId;
    const resultingAffiliationNumber =
      data.affiliationNumber ?? existing.affiliationNumber;
    const resultingTerminalId = data.terminalId ?? existing.terminalId;
    const resultingSecret = data.secret ?? existing.secret;
    const resultingApiKey = data.apiKey ?? existing.apiKey;
    const resultingToken = data.token ?? existing.token;

    const bank = await prisma.bank.findUnique({
      where: { id: resultingBankId },
    });

    if (!bank) {
      return res.status(400).json({
        message: `Banco no encontrado para bankId=${resultingBankId}.`,
      });
    }

    // Regla: solo puede existir una integración por cada banco.
    // Si se intenta mover la config a otro banco que ya tiene una integración, bloquear.
    if (resultingBankId !== existing.bankId) {
      const configForTargetBank = await prisma.bankIntegrationConfig.findFirst({
        where: {
          bankId: resultingBankId,
          environment: resultingEnvironment,
          NOT: { id },
        },
      });

      if (configForTargetBank) {
        return res.status(409).json({
          message:
            'Ya existe una configuración de integración para el banco de destino. No puede haber más de una por banco.',
        });
      }
    }

    let expectedProvider: BankIntegrationProvider | null = null;
    if (bank.code === 191) {
      expectedProvider = BankIntegrationProvider.BNC;
    } else if (bank.code === 102) {
      expectedProvider = BankIntegrationProvider.BDV;
    }

    if (!expectedProvider) {
      return res.status(400).json({
        message:
          'Este banco no soporta integraciones configurables. Solo se permiten bancos con código 191 (BNC) o 102 (BDV).',
      });
    }

    if (resultingProvider !== expectedProvider) {
      return res.status(400).json({
        message: `provider inválido para este banco. Para banco código ${bank.code} el provider debe ser "${expectedProvider}".`,
      });
    }

    const missingFields: string[] = [];
    const requireField = (name: string, value: unknown, validateUrl = false) => {
      if (value === undefined || value === null || value === '') {
        missingFields.push(name);
        return;
      }
      if (validateUrl && typeof value === 'string' && !URL_BASE_REGEX.test(value)) {
        missingFields.push(`${name} (formato inválido, debe iniciar con http:// o https://)`);
      }
    };

    if (resultingProvider === BankIntegrationProvider.BNC) {
      // Siempre requeridos para BNC
      requireField('urlBase', resultingUrlBase, true);
      requireField('clientGuid', resultingClientGuid);
      requireField('masterKey', resultingMasterKey);
      requireField('clientId', resultingClientId);

      if (servicesArray.includes(BankIntegrationService.VPOS)) {
        requireField('affiliationNumber', resultingAffiliationNumber);
      }
      if (servicesArray.includes(BankIntegrationService.C2P)) {
        requireField('terminalId', resultingTerminalId);
      }
    }

    if (resultingProvider === BankIntegrationProvider.BDV) {
      const hasQueries = servicesArray.includes(BankIntegrationService.QUERIES);
      const hasPasarela =
        servicesArray.includes(BankIntegrationService.VPOS) ||
        servicesArray.includes(BankIntegrationService.C2P);

      if (hasQueries) {
        requireField('urlBase', resultingUrlBase, true);
        requireField('token', resultingToken);
      }

      if (hasPasarela) {
        requireField('secret', resultingSecret);
        requireField('apiKey', resultingApiKey);
      }
    }

    if (missingFields.length > 0) {
      return res.status(400).json({
        message: `Faltan campos requeridos para la configuración de integración bancaria: ${missingFields.join(
          ', ',
        )}.`,
      });
    }

    // Validación remota: probar Logon contra BNC antes de actualizar (solo BNC por ahora)
    if (resultingProvider === BankIntegrationProvider.BNC) {
      try {
        const logonResult = await testBncLogon({
          urlBase: String(resultingUrlBase),
          clientGuid: String(resultingClientGuid),
          masterKey: String(resultingMasterKey),
        });

        if (!logonResult.ok) {
          logError('bank-integrations/logon-check-bnc', new Error('BNC Logon failed'), {
            urlBase: resultingUrlBase,
            clientGuid: resultingClientGuid,
            statusCode: logonResult.statusCode,
            body: logonResult.body,
          });

          return res.status(400).json({
            message:
              'No se pudo validar la configuración contra el BNC (Logon). Verifique ClientGUID, MasterKey y URL base.',
            statusCode: logonResult.statusCode,
            bncResponse: logonResult.body,
          });
        }
      } catch (error) {
        logError('bank-integrations/logon-check-bnc', error, {
          urlBase: resultingUrlBase,
          clientGuid: resultingClientGuid,
        });
        return res.status(502).json({
          message:
            'Error llamando al servicio de Logon del BNC al validar la configuración.',
        });
      }
    }

    const updated = await prisma.bankIntegrationConfig.update({
      where: { id },
      data: {
        ...data,
        services:
          services !== undefined
            ? {
                deleteMany: {},
                createMany: {
                  data: servicesArray.map((s) => ({ service: s })),
                  skipDuplicates: true,
                },
              }
            : undefined,
      },
      include: { services: true },
    });

    const updatedForFrontend = {
      ...updated,
      services: updated.services.map((s: any) => s.service),
    };

    void auditEvent(req, {
      context: 'bank-integrations/update',
      action: 'UPDATE',
      entityType: 'BankIntegrationConfig',
      entityId: id,
      description: `Actualizó configuración de integración bancaria ${id}`,
      metadata: updatedForFrontend,
    });

    return res.json(updatedForFrontend);
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return res.status(409).json({
        message:
          'Ya existe otra configuración con el mismo banco, entorno y servicio. Verifique los datos.',
      });
    }

    logError('bank-integrations/update', error, { params: req.params, body: req.body });
    return res.status(500).json({ message: 'Error actualizando configuración de integración bancaria.' });
  }
},
);

// Eliminar configuración
router.delete(
  '/:id',
  authTokenMiddleware,
  requirePermissions(['MANAGE_BANK_INTEGRATIONS']),
  async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ message: 'ID inválido.' });
    }

    let existing: any = null;
    try {
      existing = await prisma.bankIntegrationConfig.findUnique({
        where: { id },
      });
    } catch {
      // ignore
    }

    await prisma.bankIntegrationConfig.delete({
      where: { id },
    });

    void auditEvent(req, {
      context: 'bank-integrations/delete',
      action: 'DELETE',
      entityType: 'BankIntegrationConfig',
      entityId: id,
      description: existing
        ? `Eliminó configuración de integración bancaria para bancoId=${existing.bankId}, provider=${existing.provider}, environment=${existing.environment}, service=${existing.service}`
        : 'Eliminó configuración de integración bancaria',
      metadata: existing ?? { id },
    });

    return res.status(204).send();
  } catch (error: any) {
    if (error?.code === 'P2025') {
      return res.status(404).json({ message: 'Configuración no encontrada.' });
    }

    logError('bank-integrations/delete', error, { params: req.params });
    return res.status(500).json({ message: 'Error eliminando configuración de integración bancaria.' });
  }
},
);

export default router;

