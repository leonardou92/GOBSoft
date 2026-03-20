import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { logError } from '../utils/logger';
import { auditEvent } from '../utils/audit';
import { authTokenMiddleware } from '../middleware/authToken';
import { requirePermissions } from '../middleware/authorize';

const router = Router();

// Listar usuarios (paginado)
router.get(
  '/',
  authTokenMiddleware,
  requirePermissions(['VIEW_USERS']),
  async (req, res) => {
  try {
    const page = Number(req.query.page ?? '1');
    const pageSize = Number(req.query.pageSize ?? '20');

    if (Number.isNaN(page) || page < 1) {
      return res.status(400).json({ message: 'page debe ser un número >= 1.' });
    }

    if (Number.isNaN(pageSize) || pageSize < 1 || pageSize > 200) {
      return res
        .status(400)
        .json({ message: 'pageSize debe estar entre 1 y 200.' });
    }

    const skip = (page - 1) * pageSize;

    const [items, total] = await Promise.all([
      prisma.user.findMany({
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          username: true,
          firstName: true,
          lastName: true,
          email: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
          role: {
            select: {
              id: true,
              name: true,
              description: true,
            },
          },
        },
      }),
      prisma.user.count(),
    ]);

    const totalPages = Math.ceil(total / pageSize) || 1;

    void auditEvent(req, {
      context: 'users/list',
      action: 'VIEW',
      entityType: 'User',
      entityId: null,
      description: 'Listado de usuarios',
      metadata: {
        page,
        pageSize,
      },
    });

    return res.json({
      page,
      pageSize,
      total,
      totalPages,
      items,
    });
  } catch (error) {
    logError('users/list', error, { query: req.query });
    return res.status(500).json({ message: 'Error listando usuarios.' });
  }
},
);

// Obtener detalle de usuario
router.get(
  '/:id',
  authTokenMiddleware,
  requirePermissions(['VIEW_USERS']),
  async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      return res.status(400).json({ message: 'ID inválido.' });
    }

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        firstName: true,
        lastName: true,
        email: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        role: {
          select: {
            id: true,
            name: true,
            description: true,
          },
        },
      },
    });

    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado.' });
    }

    void auditEvent(req, {
      context: 'users/detail',
      action: 'VIEW',
      entityType: 'User',
      entityId: id,
      description: 'Detalle de usuario',
      metadata: { id },
    });

    return res.json(user);
  } catch (error) {
    logError('users/get', error, { params: req.params });
    return res.status(500).json({ message: 'Error obteniendo usuario.' });
  }
},
);

// Actualizar usuario (perfil y estado, y opcionalmente password)
router.put(
  '/:id',
  authTokenMiddleware,
  requirePermissions(['MANAGE_USERS']),
  async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      return res.status(400).json({ message: 'ID inválido.' });
    }

    const { firstName, lastName, email, isActive, password, roleId } = req.body || {};

    const data: any = {};
    if (firstName !== undefined) data.firstName = firstName;
    if (lastName !== undefined) data.lastName = lastName;
    if (email !== undefined) data.email = email;
    if (isActive !== undefined) data.isActive = Boolean(isActive);

    if (password) {
      const passwordStr = String(password);
      const hash = await bcrypt.hash(passwordStr, 10);
      data.passwordHash = hash;
    }

    // Actualizar rol dinámico del usuario (opcional)
    if (roleId !== undefined) {
      const numericRoleId = Number(roleId);
      if (!Number.isInteger(numericRoleId) || numericRoleId <= 0) {
        return res.status(400).json({ message: 'roleId debe ser un número entero positivo.' });
      }

      const role = await prisma.role.findUnique({
        where: { id: numericRoleId },
      });

      if (!role) {
        return res.status(400).json({ message: 'El roleId especificado no existe.' });
      }

      data.roleId = numericRoleId;
    }

    if (Object.keys(data).length === 0) {
      return res
        .status(400)
        .json({ message: 'No hay campos para actualizar.' });
    }

    // Si cambia email, verificar duplicado
    if (email) {
      const existingEmail = await prisma.user.findFirst({
        where: {
          email: String(email),
          id: { not: id },
        },
      });
      if (existingEmail) {
        return res
          .status(409)
          .json({ message: 'Ya existe un usuario con ese correo.' });
      }
    }

    const updated = await prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        username: true,
        firstName: true,
        lastName: true,
        email: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        role: {
          select: {
            id: true,
            name: true,
            description: true,
          },
        },
      },
    });

    void auditEvent(req, {
      context: 'users/update',
      action: 'UPDATE',
      entityType: 'User',
      entityId: id,
      description: `Actualizó usuario ${updated.username}`,
      metadata: {
        id: updated.id,
        username: updated.username,
        firstName: updated.firstName,
        lastName: updated.lastName,
        email: updated.email,
        isActive: updated.isActive,
      },
    });

    return res.json(updated);
  } catch (error: any) {
    logError('users/update', error, { params: req.params, body: req.body });
    return res.status(500).json({ message: 'Error actualizando usuario.' });
  }
},
);

// Eliminar usuario
router.delete(
  '/:id',
  authTokenMiddleware,
  requirePermissions(['MANAGE_USERS']),
  async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      return res.status(400).json({ message: 'ID inválido.' });
    }

    let deletedUsername: string | null = null;

    try {
      const existing = await prisma.user.findUnique({
        where: { id },
        select: { username: true },
      });
      deletedUsername = existing?.username ?? null;

      await prisma.user.delete({ where: { id } });
    } catch (error: any) {
      if (error?.code === 'P2025') {
        return res.status(404).json({ message: 'Usuario no encontrado.' });
      }
      throw error;
    }

    void auditEvent(req, {
      context: 'users/delete',
      action: 'DELETE',
      entityType: 'User',
      entityId: id,
      description: deletedUsername
        ? `Eliminó usuario ${deletedUsername}`
        : 'Eliminó usuario',
      metadata: { id, username: deletedUsername },
    });

    return res.status(204).send();
  } catch (error) {
    logError('users/delete', error, { params: req.params });
    return res.status(500).json({ message: 'Error eliminando usuario.' });
  }
},
);

export default router;

