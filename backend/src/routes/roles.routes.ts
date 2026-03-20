import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { logError } from '../utils/logger';
import { authTokenMiddleware } from '../middleware/authToken';
import { requirePermissions } from '../middleware/authorize';
import type { AppPermission } from '../security/permissions';

const router = Router();

// Utilidad para garantizar que solo códigos conocidos se utilicen (opcionalmente
// se puede relajar y permitir cualquier string).
const ALL_PERMISSION_CODES: AppPermission[] = [
  'VIEW_DASHBOARD',
  'VIEW_BANKS',
  'MANAGE_BANKS',
  'VIEW_BANK_ACCOUNTS',
  'MANAGE_BANK_ACCOUNTS',
  'VIEW_BANK_INTEGRATIONS',
  'MANAGE_BANK_INTEGRATIONS',
  'VIEW_TRANSACTIONS',
  'EXECUTE_P2P',
  'EXECUTE_IMMEDIATE_CREDIT_DEBIT',
  'EXECUTE_VPOS',
  'EXECUTE_C2P',
  'VIEW_USERS',
  'MANAGE_USERS',
  'VIEW_API_ERROR_LOGS',
  'VIEW_AUDIT_LOGS',
];

// GET /api/roles-with-permissions
// Lista todos los roles con sus permisos (codes).
router.get(
  '/with-permissions',
  authTokenMiddleware,
  requirePermissions(['MANAGE_USERS']),
  async (_req, res) => {
    try {
      const roles = await prisma.role.findMany({
        orderBy: { id: 'asc' },
        include: {
          rolePermissions: {
            include: {
              permission: true,
            },
          },
        },
      });

      const result = roles.map((role) => ({
        id: role.id,
        name: role.name,
        description: role.description,
        permissions: role.rolePermissions.map((rp) => rp.permission.code),
      }));

      return res.json(result);
    } catch (error) {
      logError('roles/with-permissions', error);
      return res.status(500).json({ message: 'Error listando roles y permisos.' });
    }
  },
);

// PUT /api/roles/:id/permissions
// Reemplaza la lista de permisos de un rol.
router.put(
  '/:id/permissions',
  authTokenMiddleware,
  requirePermissions(['MANAGE_USERS']),
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ message: 'ID de rol inválido.' });
      }

      const { permissions } = (req.body || {}) as { permissions?: string[] };

      if (!Array.isArray(permissions)) {
        return res.status(400).json({
          message: 'Debe enviar "permissions" como arreglo de strings.',
        });
      }

      // Validar que todos los códigos enviados sean conocidos
      const invalid = permissions.filter(
        (p) => !ALL_PERMISSION_CODES.includes(p as AppPermission),
      );
      if (invalid.length > 0) {
        return res.status(400).json({
          message: `Permisos inválidos: ${invalid.join(', ')}`,
        });
      }

      const role = await prisma.role.findUnique({
        where: { id },
      });

      if (!role) {
        return res.status(404).json({ message: 'Rol no encontrado.' });
      }

      const permsInDb = await prisma.permission.findMany({
        where: {
          code: {
            in: permissions,
          },
        },
      });

      // Limpiar permisos actuales del rol y reemplazar por los nuevos
      await prisma.rolePermission.deleteMany({
        where: { roleId: role.id },
      });

      if (permsInDb.length > 0) {
        await prisma.rolePermission.createMany({
          data: permsInDb.map((p) => ({
            roleId: role.id,
            permissionId: p.id,
          })),
          skipDuplicates: true,
        });
      }

      const updated = await prisma.role.findUnique({
        where: { id: role.id },
        include: {
          rolePermissions: {
            include: {
              permission: true,
            },
          },
        },
      });

      return res.json({
        id: updated?.id,
        name: updated?.name,
        description: updated?.description ?? null,
        permissions: updated?.rolePermissions.map((rp) => rp.permission.code) ?? [],
      });
    } catch (error) {
      logError('roles/update-permissions', error, { body: req.body, params: req.params });
      return res.status(500).json({ message: 'Error actualizando permisos del rol.' });
    }
  },
);

// POST /api/roles
// Crea un rol nuevo con permisos iniciales.
router.post(
  '/',
  authTokenMiddleware,
  requirePermissions(['MANAGE_USERS']),
  async (req, res) => {
    try {
      const { name, description, permissions } = (req.body || {}) as {
        name?: string;
        description?: string;
        permissions?: string[];
      };

      if (!name || typeof name !== 'string') {
        return res.status(400).json({ message: 'Debe enviar name (string) para el rol.' });
      }

      const existing = await prisma.role.findUnique({
        where: { name },
      });

      if (existing) {
        return res.status(409).json({ message: 'Ya existe un rol con ese nombre.' });
      }

      const role = await prisma.role.create({
        data: {
          name,
          description: description ?? null,
        },
      });

      // Regla: por defecto el rol NUEVO no tiene permisos.
      // Solo asignamos permisos si el frontend envía un arreglo no vacío.
      if (permissions !== undefined && !Array.isArray(permissions)) {
        return res.status(400).json({
          message: 'Si envías "permissions" debe ser un arreglo de strings.',
        });
      }

      if (Array.isArray(permissions) && permissions.length > 0) {
        const invalid = permissions.filter(
          (p) => !ALL_PERMISSION_CODES.includes(p as AppPermission),
        );
        if (invalid.length > 0) {
          return res.status(400).json({
            message: `Permisos inválidos: ${invalid.join(', ')}`,
          });
        }

        const permsInDb = await prisma.permission.findMany({
          where: { code: { in: permissions } },
        });

        if (permsInDb.length > 0) {
          await prisma.rolePermission.createMany({
            data: permsInDb.map((p) => ({
              roleId: role.id,
              permissionId: p.id,
            })),
            skipDuplicates: true,
          });
        }
      }

      const created = await prisma.role.findUnique({
        where: { id: role.id },
        include: {
          rolePermissions: {
            include: { permission: true },
          },
        },
      });

      return res.status(201).json({
        id: created?.id,
        name: created?.name,
        description: created?.description ?? null,
        permissions: created?.rolePermissions.map((rp) => rp.permission.code) ?? [],
      });
    } catch (error) {
      logError('roles/create', error, { body: req.body });
      return res.status(500).json({ message: 'Error creando rol.' });
    }
  },
);

// GET /api/roles (listado simple sin permisos)
router.get(
  '/',
  authTokenMiddleware,
  requirePermissions(['MANAGE_USERS']),
  async (_req, res) => {
    try {
      const roles = await prisma.role.findMany({
        orderBy: { id: 'asc' },
      });
      return res.json(roles);
    } catch (error) {
      logError('roles/list', error);
      return res.status(500).json({ message: 'Error listando roles.' });
    }
  },
);

// PUT /api/roles/:id (actualizar nombre/description)
router.put(
  '/:id',
  authTokenMiddleware,
  requirePermissions(['MANAGE_USERS']),
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ message: 'ID de rol inválido.' });
      }

      const { name, description } = (req.body || {}) as {
        name?: string;
        description?: string | null;
      };

      const data: any = {};

      // Regla: si el rol está asignado a usuarios, NO se puede cambiar el name,
      // solo la descripción.
      if (name !== undefined) {
        const userCount = await prisma.user.count({
          where: { roleId: id },
        });

        if (userCount > 0) {
          return res.status(409).json({
            message:
              'No se puede cambiar el nombre de un rol que está asignado a usuarios.',
            usersUsingRoleCount: userCount,
          });
        }

        data.name = name;
      }

      if (description !== undefined) data.description = description;

      if (Object.keys(data).length === 0) {
        return res.status(400).json({ message: 'No hay campos para actualizar.' });
      }

      const updated = await prisma.role.update({
        where: { id },
        data,
      });

      return res.json(updated);
    } catch (error: any) {
      if (error?.code === 'P2002') {
        return res
          .status(409)
          .json({ message: 'Ya existe un rol con ese nombre.' });
      }

      logError('roles/update', error, { body: req.body, params: req.params });
      return res.status(500).json({ message: 'Error actualizando rol.' });
    }
  },
);

// DELETE /api/roles/:id
router.delete(
  '/:id',
  authTokenMiddleware,
  requirePermissions(['MANAGE_USERS']),
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ message: 'ID de rol inválido.' });
      }

      const userCount = await prisma.user.count({
        where: { roleId: id },
      });

      if (userCount > 0) {
        return res.status(409).json({
          message:
            'No se puede eliminar el rol porque está asignado a usuarios.',
          usersUsingRoleCount: userCount,
        });
      }

      await prisma.rolePermission.deleteMany({
        where: { roleId: id },
      });

      await prisma.role.delete({
        where: { id },
      });

      return res.status(204).send();
    } catch (error) {
      logError('roles/delete', error, { params: req.params });
      return res.status(500).json({ message: 'Error eliminando rol.' });
    }
  },
);

export default router;

