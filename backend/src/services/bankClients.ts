import { prisma } from '../lib/prisma';
import {
  BankEnvironment,
  BankIntegrationProvider,
  BankIntegrationService,
} from '../generated/prisma/enums';
import type { BankIntegrationConfigModel } from '../generated/prisma/models/BankIntegrationConfig';

export type BankServiceKind = BankIntegrationService;

export interface BankClient {
  readonly provider: BankIntegrationProvider;
  readonly bankId: number;
  readonly environment: BankEnvironment;

  /**
   * Opcional: método genérico de prueba de conectividad (por ejemplo, ping o logon).
   */
  testConnection?(): Promise<void>;

  /**
   * Consulta de saldo (cuando el servicio QUERIES está configurado).
   */
  getBalance?(params: { clientId?: string; workingKey?: string }): Promise<unknown>;

  /**
   * Pago móvil P2P.
   */
  sendP2P?(payload: Record<string, unknown>): Promise<unknown>;

  /**
   * Pago móvil C2P (pasarela).
   */
  sendC2P?(payload: Record<string, unknown>): Promise<unknown>;

  /**
   * VPOS / tarjeta.
   */
  sendVpos?(payload: Record<string, unknown>): Promise<unknown>;
}

export class BncClient implements BankClient {
  readonly provider = BankIntegrationProvider.BNC;
  readonly bankId: number;
  readonly environment: BankEnvironment;

  readonly urlBase: string;
  readonly clientGuid: string;
  readonly masterKey: string;
  readonly clientId: string | null;
  readonly affiliationNumber: string | null;
  readonly terminalId: string | null;

  constructor(config: BankIntegrationConfigModel) {
    this.bankId = config.bankId;
    this.environment = config.environment;
    this.urlBase = config.urlBase ?? '';
    this.clientGuid = config.clientGuid ?? '';
    this.masterKey = config.masterKey ?? '';
    this.clientId = config.clientId;
    this.affiliationNumber = config.affiliationNumber;
    this.terminalId = config.terminalId;
  }

  async testConnection(): Promise<void> {
    // Aquí en el futuro se puede implementar un ping/logon específico por banca.
    return;
  }
}

export class BdvClient implements BankClient {
  readonly provider = BankIntegrationProvider.BDV;
  readonly bankId: number;
  readonly environment: BankEnvironment;

  readonly urlBase: string | null;
  readonly secret: string | null;
  readonly apiKey: string | null;
  readonly token: string | null;

  constructor(config: BankIntegrationConfigModel) {
    this.bankId = config.bankId;
    this.environment = config.environment;
    this.urlBase = config.urlBase;
    this.secret = config.secret;
    this.apiKey = config.apiKey;
    this.token = config.token;
  }

  async testConnection(): Promise<void> {
    // Implementar cuando se defina el endpoint de prueba para BDV.
    return;
  }
}

export async function resolveBankClient(params: {
  bankId: number;
  environment: BankEnvironment;
  service: BankServiceKind;
}): Promise<BankClient> {
  const { bankId, environment, service } = params;

  // Primero intentamos con el servicio solicitado explícitamente.
  let config = await prisma.bankIntegrationConfig.findFirst({
    where: {
      bankId,
      environment,
      isActive: true,
      services: {
        some: {
          service,
        },
      },
    },
  });

  // Caso especial: para AUTH podemos reutilizar una integración que tenga QUERIES
  // (misma credencial de BNC, solo cambia el endpoint que consume el cliente).
  if (!config && service === BankIntegrationService.AUTH) {
    config = await prisma.bankIntegrationConfig.findFirst({
      where: {
        bankId,
        environment,
        isActive: true,
        services: {
          some: {
            service: BankIntegrationService.QUERIES,
          },
        },
      },
    });
  }

  if (!config) {
    const error: any = new Error(
      `No existe configuración de integración activa para bankId=${bankId}, environment=${environment}, service=${service}.`,
    );
    error.code = 'NO_BANK_INTEGRATION_CONFIG';
    error.meta = { bankId, environment, service };
    throw error;
  }

  if (config.provider === BankIntegrationProvider.BNC) {
    return new BncClient(config as BankIntegrationConfigModel);
  }

  if (config.provider === BankIntegrationProvider.BDV) {
    return new BdvClient(config as BankIntegrationConfigModel);
  }

  const error: any = new Error(
    `Proveedor de integración no soportado para bankId=${bankId}: ${config.provider}.`,
  );
  error.code = 'UNSUPPORTED_BANK_PROVIDER';
  error.meta = { bankId, environment, service, provider: config.provider };
  throw error;
}

