import type { Request } from 'express';
import { prisma } from '../lib/prisma';
import { logError } from './logger';

interface AuditEventInput {
  context: string;
  action: string;
  entityType?: string | null;
  entityId?: string | number | null;
  description?: string | null;
  metadata?: unknown;
  userIdOverride?: number | null;
  usernameOverride?: string | null;
}

function getAuthUserFromReq(req: Request | any): { userId: number | null; username: string | null } {
  const sub = req.user?.sub;
  const username = req.user?.username;
  return {
    userId: typeof sub === 'number' ? sub : null,
    username: typeof username === 'string' ? username : null,
  };
}

function getClientInfoFromReq(req: Request | any): { ipAddress: string | null; userAgent: string | null } {
  const ip =
    (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ??
    req.ip ??
    null;
  const userAgent = (req.headers['user-agent'] as string | undefined) ?? null;
  return { ipAddress: ip, userAgent };
}

export async function auditEvent(
  req: Request | any,
  input: AuditEventInput,
): Promise<void> {
  try {
    const { userId: reqUserId, username: reqUsername } = getAuthUserFromReq(req);
    const { ipAddress, userAgent } = getClientInfoFromReq(req);

    const userId =
      input.userIdOverride !== undefined ? input.userIdOverride : reqUserId;
    const username =
      input.usernameOverride !== undefined ? input.usernameOverride : reqUsername;

    await prisma.auditLog.create({
      data: {
        userId,
        username,
        context: input.context,
        action: input.action,
        entityType: input.entityType ?? null,
        entityId:
          input.entityId !== undefined && input.entityId !== null
            ? String(input.entityId)
            : null,
        description: input.description ?? null,
        metadata:
          input.metadata && typeof input.metadata === 'object'
            ? (input.metadata as any)
            : null,
        ipAddress,
        userAgent,
      },
    });
  } catch (error) {
    logError('audit/event-auto', error, { context: input.context, action: input.action });
  }
}

