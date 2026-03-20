import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { logError } from '../utils/logger';

export function authTokenMiddleware(req: Request, res: Response, next: NextFunction) {
  const jwtSecret = process.env.JWT_SECRET;

  if (!jwtSecret) {
    logError('auth/jwt-missing-env', new Error('JWT_SECRET not configured'), {
      path: req.path,
    });
    return res.status(500).json({
      message: 'JWT_SECRET no está configurado en el servidor.',
    });
  }

  const authHeader = req.headers.authorization || '';

  if (!authHeader.startsWith('Bearer ')) {
    logError('auth/jwt-invalid', new Error('Missing Bearer token'), {
      path: req.path,
      method: req.method,
    });

    return res.status(401).json({
      message: 'Autorización requerida. Use header Authorization: Bearer <token>.',
    });
  }

  const token = authHeader.slice('Bearer '.length).trim();

  try {
    const decoded = jwt.verify(token, jwtSecret);
    (req as any).user = decoded;
    return next();
  } catch (error) {
    logError('auth/jwt-invalid', error, {
      path: req.path,
      method: req.method,
    });

    return res.status(401).json({
      message: 'Token JWT inválido o expirado.',
    });
  }
}

