# Gestión de Operaciones Bancarias - Backend

Backend en Node.js + TypeScript que centraliza la gestión de operaciones bancarias, autenticación JWT, autorización por permisos (RBAC), auditoría y sincronización de movimientos.

## Alcance funcional

- Integración con servicios bancarios (auth, consultas, pagos P2P/C2P, VPOS, crédito/débito inmediato).
- Usuarios locales con JWT (`/api/auth/login-token`).
- RBAC por permisos (`Role`, `Permission`, `RolePermission`).
- 2FA global para operaciones sensibles.
- Auditoría (`AuditLog`) y logs de errores (`ApiErrorLog`).
- Sincronización programada de movimientos (`node-cron`).
- Heartbeat del dashboard para actualización casi en tiempo real.

## Stack técnico

- Node.js + TypeScript
- Express
- Prisma
- MySQL
- JWT
- bcryptjs
- node-cron

## Seguridad

- Contraseñas hasheadas (bcrypt).
- Política de contraseña fuerte en registro.
- JWT obligatorio para rutas protegidas.
- `requirePermissions` para autorización por permisos.
- Rate limiting global y específico para login.
- CORS por entorno.
- En producción, rechazo de HTTP plano (se espera proxy HTTPS).
- Cifrado de secreto 2FA con `TWO_FACTOR_ENCRYPTION_KEY` (o fallback a `JWT_SECRET`).

## Variables de entorno

Usa `.env.example` como plantilla. No publiques valores reales.

Variables principales:

- `NODE_ENV` (`development` | `production`)
- `PORT`
- `CORS_ORIGIN` (solo producción)
- `JWT_SECRET`
- `JWT_EXPIRES_IN`
- `TWO_FACTOR_ENCRYPTION_KEY` (opcional, recomendado)
- `DATABASE_URL`
- `STATEMENT_SYNC_CRON`
- `INITIAL_SYNC_START_DATE` (requerida por el arranque actual)

## Instalación

1. Instalar dependencias:

```bash
npm install
```

2. Crear `.env` desde ejemplo:

```bash
cp .env.example .env
```

3. Configurar base de datos y seguridad en `.env`.

4. Ejecutar Prisma:

```bash
npx prisma migrate dev
npx prisma generate
```

5. Levantar en desarrollo:

```bash
npm run dev
```

Healthcheck:

- `GET /health`

## Autenticación y autorización

### JWT

- Login local: `POST /api/auth/login-token`
- Enviar token en:
  - `Authorization: Bearer <token>`

### RBAC (permisos)

Permisos definidos en `src/security/permissions.ts`.

Incluye, entre otros:

- `VIEW_DASHBOARD`
- `VIEW_TRANSACTIONS`
- `EXECUTE_P2P`
- `EXECUTE_C2P`
- `EXECUTE_VPOS`
- `EXECUTE_IMMEDIATE_CREDIT_DEBIT`
- `VIEW_AUDIT_LOGS`
- `MANAGE_USERS`
- `MANAGE_SECURITY` (2FA global)

Roles estándar:

- `ADMIN`
- `OPERADOR`
- `AUDITOR`

`ADMIN` incluye `MANAGE_SECURITY`, por lo tanto puede administrar 2FA global.

## 2FA global (seguridad)

Endpoints:

- `POST /api/auth/2fa/setup`
- `GET /api/auth/2fa/status`
- `POST /api/auth/2fa/verify-setup`
- `POST /api/auth/2fa/disable`
- `DELETE /api/auth/2fa`

Todos requieren JWT y permiso `MANAGE_SECURITY`.

Notas:

- Deshabilitar 2FA requiere código TOTP válido.
- `DELETE /api/auth/2fa` solo elimina configuración si 2FA está deshabilitado.

## Dashboard heartbeat (casi tiempo real)

Endpoint:

- `GET /api/dashboard/heartbeat`

Permiso:

- `VIEW_DASHBOARD`

Query params opcionales:

- `startDate` (`YYYY-MM-DD`)
- `endDate` (`YYYY-MM-DD`)
- `recentPageSize` (1..200, default 5)

Respuesta incluye:

- `lastTransactionsUpdateAt`
- `lastErrorLogsUpdateAt`
- `updated`
- `recentTx`
- `todayTxCount`
- `yesterdayTxCount`
- `txStats`

Uso recomendado frontend:

- Polling cada 5-10 segundos.
- Si `updated=true`, refrescar widgets.
- Si `updated=false`, evitar recálculo pesado.

## Jobs programados

- Sincronización inicial histórica al arrancar (desde `INITIAL_SYNC_START_DATE`).
- Luego arranca cron de estado de cuenta con `STATEMENT_SYNC_CRON`.

## Auditoría y trazabilidad

- Eventos de negocio y seguridad en `AuditLog`.
- Errores técnicos en:
  - archivo `logs/errors.log`
  - tabla `ApiErrorLog`

## Estructura de rutas (alto nivel)

- `/api/auth/*`
- `/api/account/*`
- `/api/dashboard/*`
- `/api/transactions/*`
- `/api/audit/*`
- `/api/error-logs/*`
- `/api/users/*`
- `/api/roles/*`
- `/api/bank-accounts/*`
- `/api/bank-integrations/*`
- `/api/banks/*`
- `/api/associates/*`
- `/api/services/*`
- `/api/docs/*`

## Notas de operación

- No versionar `.env`.
- No incluir credenciales bancarias reales en código, commits o documentación.
- Rotar secretos en producción y usar gestor seguro de secretos cuando aplique.
