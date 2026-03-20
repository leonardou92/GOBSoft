# GOBSoft

Repositorio oficial: [https://github.com/leonardou92/GOBSoft.git](https://github.com/leonardou92/GOBSoft.git)

Proyecto full-stack para gestion de operaciones bancarias:

- `backend/`: API Node.js + TypeScript + Prisma.
- `frontend/`: React + Vite.
- `docker-compose.yml`: stack lista para Ubuntu con Docker.

## Requisitos

- Docker Engine + Docker Compose v2 (para despliegue con contenedores).
- Node.js 20+ y npm (solo si vas a ejecutar local sin Docker).
- Git.

## Instalacion local (con Docker)

1. Clonar repositorio:

```bash
git clone https://github.com/leonardou92/GOBSoft.git
cd GOBSoft
```

2. Crear archivo de variables:

```bash
cp .env.example .env
```

3. Editar `.env`:

- Cambiar `MYSQL_PASSWORD`.
- Cambiar `MYSQL_ROOT_PASSWORD`.
- Cambiar `BACKEND_JWT_SECRET`.
- (Opcional) cambiar `BACKEND_TWO_FACTOR_ENCRYPTION_KEY`.
- Mantener `DATABASE_URL` en modo interno Docker:
  - `mysql://gobsoft_user:<MYSQL_PASSWORD>@db:3306/gobsoft_db`

4. Levantar servicios:

```bash
docker compose up -d --build
```

5. Verificar:

```bash
docker compose ps
curl http://localhost:3000/health
```

6. Accesos:

- Frontend: `http://localhost:8080`
- API health: `http://localhost:3000/health`

## Instalacion local (sin Docker)

1. Backend:

```bash
cd backend
npm install
cp .env.example .env
# Ajustar DATABASE_URL a tu MySQL local
npx prisma migrate deploy
npx prisma generate
npm run dev
```

2. Frontend (en otra terminal):

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

3. Accesos:

- Frontend Vite: `http://localhost:5173`
- Backend: `http://localhost:3000`

## Despliegue en servidor Ubuntu (manual)

1. Instalar Docker y Compose:

```bash
sudo apt update
sudo apt install -y docker.io docker-compose-v2
sudo systemctl enable --now docker
```

2. Clonar proyecto en servidor:

```bash
git clone https://github.com/leonardou92/GOBSoft.git /opt/gobsoft
cd /opt/gobsoft
```

3. Configurar entorno:

```bash
cp .env.example .env
nano .env
```

4. Levantar stack:

```bash
chmod +x deploy.sh
./deploy.sh main
```

5. Verificar:

```bash
docker compose ps
curl http://localhost:3000/health
```

6. URL de frontend (por defecto):

- `http://IP_DEL_SERVIDOR:8080`

## Auto deploy al hacer push a main

Existe workflow en `.github/workflows/deploy-main.yml` que despliega automaticamente al servidor cuando hay cambios en `main`.

Configura estos secrets en GitHub (Settings > Secrets and variables > Actions):

- `VPS_HOST`: IP o dominio del servidor Ubuntu.
- `VPS_USER`: usuario SSH del servidor.
- `VPS_SSH_KEY`: llave privada SSH (formato OpenSSH).
- `VPS_SSH_PASSPHRASE`: passphrase de la llave privada (si aplica).
- `VPS_PORT`: puerto SSH (opcional, por defecto `22`).

El workflow se conecta por SSH y ejecuta:

```bash
cd /opt/gobsoft
./deploy.sh main
```

## Seguridad de variables de entorno

- `.env` esta ignorado por Git en raiz, `backend/` y `frontend/`.
- `.env.example` contiene solo datos demo/no sensibles.
- Nunca subir credenciales reales ni IPs internas en commits.
