## BNC API Backend (Resumen Técnico)

Este proyecto es un backend en Node.js/TypeScript que actúa como **intermediario seguro** entre clientes internos y la **API de integración del Banco Nacional de Crédito (BNC)**.  
Su objetivo es exponer endpoints legibles (sin encriptación) y encargarse internamente de:

- Construir el envelope requerido por el BNC (`ClientGUID`, `Reference`, `Value`, `Validation`, `swTestOperation`).
- Encriptar/Desencriptar el `Value` usando **AES-256-CBC + PBKDF2 (SHA1)**.
- Generar el `Validation` usando **SHA256**.
- Manejar el ciclo de autenticación (`MasterKey` → `WorkingKey`).
- Registrar errores en archivo y en base de datos.

> Todas las credenciales reales (ClientGUID, MasterKey, WorkingKey, ClientID, afiliaciones, terminales, etc.) se manejan mediante variables de entorno y **no deben** versionarse ni exponerse.

---

### Tecnologías principales

- **Runtime**: Node.js  
- **Lenguaje**: TypeScript  
- **Framework HTTP**: Express  
- **ORM**: Prisma (MySQL/MariaDB)  
- **Autenticación API**: JWT (`Authorization: Bearer <token>`)  
- **Criptografía BNC**: módulo utilitario específico (`bncCrypto`)  
- **Logging**: archivo plano (`logs/errors.log`) + tabla `ApiErrorLog` (con sanitización de datos sensibles)  
- **Seguridad adicional**:
  - Política de contraseñas fuertes para usuarios locales.
  - Rate limiting global y específico para login.
  - Configuración de CORS por entorno.
  - Validación de `JWT_SECRET` y uso de expiraciones cortas.

---

### Entidades principales en base de datos (Prisma)

- **`BankAccount`**: Cuentas bancarias locales (clientId, número de cuenta, alias, banco, teléfono de pago móvil, etc).
- **`BankTransaction`**: Movimientos asociados a cuentas (`TransactionKind` = `TRF`, `DEP`, `P2P`), con metadata (referencias, tipo, código, etc.).
- **`AssociatedClient`**: Clientes asociados (ChildClientID), activos/inactivos.
- **`Branch`**: Sucursales de asociados (BranchID).
- **`ApiErrorLog`**: Registro estructurado de errores de la API (contexto, mensaje, stack, extra).
- **`User`**: Usuarios locales de la API (username, password hasheado, activo/inactivo).

---

### Autenticación y autorización (backend)

1. **Usuario local y JWT**

   - Seed automático de un usuario inicial:
     - `username`: `admin`
     - `password`: `Kiri**4545**`
     - Solo se crea si no existe ya un `admin` en la tabla `User`.
   - Rutas:
     - `POST /api/auth/register`  
       Crea un usuario local nuevo (`username`, `password`) con la clave almacenada hasheada (bcrypt) y validando la fortaleza de la contraseña.
     - `POST /api/auth/login-token`  
       Recibe `username` y `password`, valida contra la base de datos y devuelve un **JWT**:
       - Header esperado en llamadas subsecuentes:
         - `Authorization: Bearer <token>`
       - Configurable mediante:
         - `JWT_SECRET` (secreto para firmar el token; en producción debe ser largo, aleatorio y único. Si `NODE_ENV=production` y es muy corto, el login se bloquea).
         - `JWT_EXPIRES_IN` (duración; por defecto se recomienda un valor corto, por ejemplo `15m`).

2. **Protección de endpoints**

   - Rutas públicas:
     - `GET /health`
     - `POST /api/auth/login`
     - `POST /api/auth/login-simple`
     - `POST /api/auth/register`
     - `POST /api/auth/login-token`
     - `GET /api/docs/*`
   - Rutas protegidas (requieren `Authorization: Bearer <token>` válido):
     - `/api/account/*` (consultas, P2P/C2P, VPOS, crédito/débito inmediato, sincronización de movimientos).
     - `/api/bank-accounts/*` (CRUD de cuentas bancarias locales).
     - `/api/transactions/*` (consulta paginada de movimientos locales).
     - `/api/associates/*` (CRUD de asociados y sucursales).

   El middleware `authTokenMiddleware`:

   - Extrae el JWT del header `Authorization: Bearer <token>`.
   - Verifica con `JWT_SECRET` y, si es válido, adjunta el payload a `req.user`.
   - Registra en `ApiErrorLog` cualquier error de autenticación (falta de header, token inválido o expirado, configuración incorrecta).

3. **Política de contraseñas**

   - Al registrar un usuario (`/api/auth/register`) la contraseña debe cumplir:
     - Mínimo 8 caracteres.
     - Al menos 1 mayúscula.
     - Al menos 1 minúscula.
     - Al menos 1 número.
     - Al menos 1 carácter especial.

4. **Rate limiting**

   - Límite global de peticiones por IP (ventana de 15 minutos) para proteger el backend de abuso.
   - Límite específico para `POST /api/auth/login-token` (pocos intentos de login por IP en la ventana) para mitigar fuerza bruta.

5. **CORS y HTTPS**

   - En producción se recomienda configurar:
     - `NODE_ENV=production`.
     - `CORS_ORIGIN` con la lista de orígenes permitidos (ej: `https://mi-frontend.com,https://otro.com`).
   - El backend:
     - Ajusta dinámicamente CORS según `CORS_ORIGIN` y el entorno.
     - En producción, asume que corre detrás de un proxy HTTPS (Nginx / LB) y rechaza tráfico HTTP plano (`x-forwarded-proto !== 'https'`).

---

### Flujo típico de uso de la API backend

1. **Autenticación local**
   - Login con `POST /api/auth/login-token` usando un usuario local (`User`).
   - Guardar el JWT devuelto.

2. **Llamadas a endpoints protegidos**
   - Incluir siempre:
     - `Authorization: Bearer <token>`
   - Ejemplos (sin mostrar credenciales reales):
     - `POST /api/account/login-simple` → obtiene un `WorkingKey` contra el BNC usando MasterKey (en `.env`).
     - `POST /api/account/balance-simple` → consulta de saldo, backend arma el `Value` encriptado con WorkingKey.
     - `POST /api/account/history-by-date-simple` → historial por rango de fechas.
     - `POST /api/account/p2p-simple` / `c2p-simple` → pagos móviles P2P/C2P.
     - `POST /api/account/vpos-simple` → consumo de VPOS virtual.
     - `POST /api/account/immediate-credit-simple` / `immediate-debit-simple` / `immediate-status-simple` → crédito/débito inmediato y consulta de estatus.

3. **Sincronización con base de datos**

   - Endpoint dedicado para traer movimientos desde BNC y guardarlos en `BankTransaction`, mapeando el tipo lógico a `TRF`, `DEP` o `P2P`.
   - Consulta posterior mediante `/api/transactions` (paginado).

4. **Manejo de errores**

   - Cualquier error en la comunicación con BNC o en la lógica de negocio:
     - Se retorna al cliente con un JSON estructurado (statusCode, message y body cuando aplica).
     - Se registra en:
       - Archivo `logs/errors.log`.
       - Tabla `ApiErrorLog` (con `context` indicando el endpoint u operación).
     - Antes de registrar datos adicionales (`extra`), se **enmascaran campos sensibles** (`masterKey`, `workingKey`, `value`, `validation`, `token`, `authorization`, `password`, `secret`, etc.).

---

### Variables de entorno (sin credenciales reales)

Ejemplo de configuración **no real** (ver `.env.example`):

```env
BNC_URL_BASE=https://servicios.bncenlinea.com:16500/api
BNC_CLIENT_GUID=00000000-0000-0000-0000-000000000000
BNC_MASTER_KEY=MI_MASTER_KEY_DE_EJEMPLO
BNC_CLIENT_ID=J000000000
BNC_CHILD_CLIENT_ID=
BNC_BRANCH_ID=
BNC_TERMINAL_ID=TERM000000
BNC_DEFAULT_BANK_CODE=191
BNC_AFFILIATION_NUMBER=AFI000000000
JWT_SECRET=MI_SECRETO_DE_EJEMPLO_NO_REAL
JWT_EXPIRES_IN=15m
NODE_ENV=development
CORS_ORIGIN=
DATABASE_URL=mysql://usuario:password@host:3306/basededatos
```

> En los entornos reales (QA/Producción), estos valores deben venir de variables de entorno del sistema, sin incluirse jamás en el control de versiones.

---

Para detalles completos sobre el comportamiento criptográfico y los endpoints específicos del BNC, consultar `docs/PROJECT_CONTEXT.md`, que contiene la documentación funcional y técnica basada en información pública y ejemplos ficticios.

---

### Instalación y puesta en marcha

1. **Requisitos previos**

   - Node.js (versión LTS recomendada).
   - Base de datos MySQL/MariaDB accesible.
   - Herramientas de línea de comandos (`npm`).

2. **Clonar el repositorio**

   ```bash
   git clone <URL_DE_TU_REPO_PRIVADO>
   cd bnc-api-backend
   ```

3. **Instalar dependencias**

   ```bash
   npm install
   ```

4. **Configurar variables de entorno**

   - Copiar el archivo de ejemplo:

     ```bash
     cp .env.example .env
     ```

   - Editar `.env` y ajustar:
     - Datos de conexión a la base de datos (`DATABASE_URL`).
     - Parámetros del BNC (`BNC_URL_BASE`, `BNC_CLIENT_GUID`, `BNC_MASTER_KEY`, `BNC_CLIENT_ID`, etc.).
     - Seguridad:
       - `JWT_SECRET` (secreto fuerte y único).
       - `JWT_EXPIRES_IN` (ej: `15m`).
       - `NODE_ENV` (`development` o `production`).
       - `CORS_ORIGIN` (en producción, orígenes permitidos separados por comas).

5. **Aplicar migraciones de base de datos (Prisma)**

   ```bash
   npx prisma migrate dev --name init
   npx prisma generate
   ```

6. **Levantar el servidor en desarrollo**

   ```bash
   npm run dev
   ```

   - Endpoint de salud: `GET /health` → `{ "status": "ok", "service": "api-bnc" }`.

7. **Primer acceso (usuario admin por defecto)**

   - El backend crea automáticamente (si no existe) un usuario:
     - `username`: `admin`
     - `password`: `Kiri**4545**`
   - Para obtener un JWT:
     - `POST /api/auth/login-token` con cuerpo:

       ```json
       {
         "username": "admin",
         "password": "Kiri**4545**"
       }
       ```

     - Usar el `token` devuelto en los endpoints protegidos con el header:

       ```http
       Authorization: Bearer <token>
       ```

8. **Despliegue en producción (resumen)**

   - Colocar el backend detrás de un reverse proxy HTTPS (por ejemplo, Nginx) que:
     - Termine TLS.
     - Reenvíe `X-Forwarded-Proto: https`.
   - Configurar en el entorno del servidor:
     - `NODE_ENV=production`
     - `JWT_SECRET` con un valor largo y aleatorio.
     - `CORS_ORIGIN` con los dominios reales del frontend.
   - Revisar periódicamente los logs en `logs/errors.log` y en la tabla `ApiErrorLog`.
