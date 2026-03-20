# GOBSoft Frontend

Frontend del sistema **Gestión de Operaciones Bancarias (GOBSoft)**.
Construido con **React + Vite + TypeScript + Tailwind + shadcn/ui**, consume la API de operaciones bancarias y módulos administrativos.

## Politica de datos (obligatoria)

En esta aplicacion, documentacion, pruebas y ejemplos:

- No usar datos reales de clientes, cuentas, telefonos o correos.
- No incluir tokens, llaves, credenciales ni secretos.
- Usar siempre datos ficticios, por ejemplo:
  - `USUARIO_TEST`
  - `user@example.test`
  - `00000000`
  - `REF_TEST_001`

## Caracteristicas principales

- Autenticacion local con JWT (`POST /api/auth/login-token`).
- Control de interfaz por permisos (`permissions: string[]`).
- Modulos operativos:
  - Dashboard
  - Transacciones
  - Pago movil P2P
  - VPOS
  - C2P
  - Credito / Debito inmediato
- Seguridad 2FA global.
- Monitoreo de dashboard con heartbeat.

## Stack tecnico

- React 18
- Vite 5
- TypeScript 5
- Tailwind CSS
- shadcn/ui + Radix UI
- React Router
- React Query
- Recharts
- Vitest

## Requisitos

- Node.js 18+ (recomendado)
- npm 9+ (o compatible)

## Instalacion

```bash
npm install
```

## Variables de entorno

Crea o ajusta `.env` usando valores de prueba:

```env
VITE_API_BASE_URL=http://localhost:3000
# Intervalo del heartbeat del dashboard en ms (5000..300000)
VITE_DASHBOARD_HEARTBEAT_MS=10000
```

Archivo de referencia:

- `.env.example`

## Scripts disponibles

- `npm run dev`: inicia el frontend en desarrollo.
- `npm run build`: genera build de produccion.
- `npm run preview`: sirve localmente el build generado.
- `npm run lint`: ejecuta ESLint.
- `npm run test`: ejecuta pruebas con Vitest.
- `npm run test:watch`: ejecuta pruebas en modo watch.

## Ejecucion local

1. Levanta el backend local (`http://localhost:3000`).
2. Configura `VITE_API_BASE_URL` en `.env`.
3. Ejecuta `npm run dev`.
4. Abre la URL local de Vite (usualmente `http://localhost:5173`).

## Flujo de autenticacion y permisos

- Login con `POST /api/auth/login-token`.
- El frontend almacena token y metadatos de sesion en storage.
- El JWT puede incluir `role` y `permissions[]`.
- La UI se habilita por permisos, por ejemplo:
  - `VIEW_DASHBOARD`
  - `EXECUTE_P2P`
  - `MANAGE_SECURITY`

## 2FA global (resumen)

Pantalla: `Seguridad / 2FA` (requiere `MANAGE_SECURITY`).

Endpoints utilizados:

- `GET /api/auth/2fa/status`
- `POST /api/auth/2fa/setup`
- `POST /api/auth/2fa/verify-setup`
- `POST /api/auth/2fa/disable`
- `DELETE /api/auth/2fa`

Para ejecutar P2P, el sistema exige 2FA global habilitado.

## Dashboard en tiempo real (heartbeat)

Endpoint:

- `GET /api/dashboard/heartbeat`

Comportamiento:

- Polling configurable con `VITE_DASHBOARD_HEARTBEAT_MS`.
- Si `updated === true`, refresca widgets ligeros (`recentTx`, `todayTxCount`, `yesterdayTxCount`, `txStats`).

## Estructura de carpetas (resumen)

- `src/pages`: pantallas principales.
- `src/components`: componentes UI y layout.
- `src/services`: capa de consumo HTTP.
- `src/hooks`: hooks reutilizables.
- `src/constants`: constantes de aplicacion.

## Nota de seguridad

- No subir `.env` ni archivos con secretos.
- Mantener solo ejemplos ficticios en documentacion y pruebas.

