import type { Request, Response, NextFunction } from 'express';
import type { AppPermission } from '../security/permissions';

export interface AuthUserPayload {
  sub: number;
  username: string;
  role?: string;
  permissions?: string[];
  [key: string]: unknown;
}

export function requirePermissions(required: AppPermission[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user as AuthUserPayload | undefined;

    if (!user) {
      return res.status(401).json({
        message: 'Autorización requerida.',
      });
    }

    const userPermissions = Array.isArray(user.permissions)
      ? (user.permissions as string[])
      : [];

    const missing = required.filter((p) => !userPermissions.includes(p));

    if (missing.length > 0) {
      return res.status(403).json({
        message: 'No tiene permisos suficientes para acceder a este recurso.',
        requiredPermissions: required,
      });
    }

    return next();
  };
}

