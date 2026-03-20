#!/bin/sh
set -e

echo "Aplicando migraciones Prisma..."
npx prisma migrate deploy

echo "Iniciando backend..."
node dist/server.js
