# GOBSoft

Repositorio oficial: [https://github.com/leonardou92/GOBSoft.git](https://github.com/leonardou92/GOBSoft.git)

Proyecto full-stack para gestion de operaciones bancarias:

- `backend/`: API Node.js + TypeScript + Prisma.
- `frontend/`: React + Vite.
- `docker-compose.yml`: stack lista para Ubuntu con Docker.

## Despliegue rapido en Ubuntu

1. Instalar Docker Engine + Docker Compose v2.
2. Clonar repositorio:

```bash
git clone https://github.com/leonardou92/GOBSoft.git
cd GOBSoft
```

3. Crear variables:

```bash
cp .env.example .env
```

4. Editar `.env` con secretos reales (no subirlos a GitHub).
5. Levantar servicios:

```bash
docker compose up -d --build
```

6. Verificar:

```bash
docker compose ps
curl http://localhost:3000/health
```

Frontend disponible en `http://localhost:8080` (por defecto).

## Seguridad de variables de entorno

- `.env` esta ignorado por Git en raiz, `backend/` y `frontend/`.
- `.env.example` contiene solo datos demo/no sensibles.
- Nunca subir credenciales reales ni IPs internas en commits.
