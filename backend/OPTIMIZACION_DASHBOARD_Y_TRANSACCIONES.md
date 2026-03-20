# Documentación Backend: Optimización de consultas (Dashboard y Transacciones)

Esta guía define la estrategia implementada y recomendaciones para mantener el dashboard rápido y consistente cuando el volumen de movimientos crece.

## 1) Problema típico

- El frontend consulta `GET /api/dashboard/heartbeat`.
- Si la detección de cambios no es confiable, se termina forzando consultas completas.
- Eso aumenta carga en DB, latencia y uso de CPU.

## 2) Objetivo

- Detectar cambios de forma confiable.
- Evitar escaneo innecesario de tablas.
- Reducir consultas pesadas para recientes y métricas.
- Mantener consistencia entre heartbeat y listados.

## 3) Contrato recomendado de heartbeat

Endpoint:

- `GET /api/dashboard/heartbeat?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&recentPageSize=5&since=<ISO-8601-opcional>`

Respuesta:

```json
{
  "updated": true,
  "watermark": "2026-03-19T18:31:02.512Z",
  "lastTransactionsUpdateAt": "2026-03-19T18:31:02.512Z",
  "lastErrorLogsUpdateAt": null,
  "todayTxCount": 120,
  "yesterdayTxCount": 98,
  "txStats": {
    "p2pCount": 40,
    "c2pCount": 25,
    "vposCount": 30,
    "immediateCreditCount": 25
  },
  "recentTx": []
}
```

Regla clave:

- `updated = (watermark_actual != since)`
- `watermark_actual` se calcula en DB como `MAX(updatedAt)` del mismo rango/filtro.

## 4) Estado implementado

En `src/routes/dashboard.routes.ts`:

- `watermark` se calcula desde DB con `MAX(updatedAt)` filtrado por `movementDate` en rango.
- `updated` se calcula contra query param opcional `since`.
- Si `updated=false`, el endpoint devuelve payload liviano con arreglos/conteos en cero.
- Si `updated=true`, calcula recientes, conteos hoy/ayer y métricas por tipo.
- Orden de `recentTx`: `movementDate DESC, externalOrder DESC, id DESC`.

## 5) Índices en `BankTransaction`

Se añadieron/ajustaron índices en `prisma/schema.prisma`:

- `@@index([updatedAt])`
- `@@index([movementDate(sort: Desc)])`
- `@@index([movementDate(sort: Desc), externalOrder(sort: Desc), id(sort: Desc)])`
- `@@index([accountNumber, movementDate(sort: Desc)])`

También se mantienen índices previos para compatibilidad y búsquedas existentes.

## 6) Consultas recomendadas (estrategia)

### A) Detección de cambio (barata)

Usar agregado:

- `MAX(updatedAt)` con los mismos filtros de rango.

### B) Últimas transacciones

- Selección limitada por `recentPageSize`.
- Orden estable por fecha y desempate (`externalOrder`, `id`).

### C) Métricas agregadas

- Conteos por categorías (`P2P`, `C2P`, `VPOS`, `CRÉDITO INMEDIATO`) dentro del mismo rango.
- Mantener filtros idénticos entre heartbeat y dashboard para evitar inconsistencias.

## 7) Paginación

Para endpoints de listados masivos, preferir cursor pagination:

- `?cursor=<movementDate,id>&limit=50`

Evitar `OFFSET` alto para consultas operativas frecuentes.

## 8) Cache y coherencia (siguiente fase)

Recomendado:

- Cache corto (5-15s) por combinación de filtros en heartbeat.
- Invalidación al insertar/sincronizar transacciones.
- ETag / If-None-Match con `304 Not Modified` (opcional).

## 9) Errores comunes a evitar

- `updatedAt` sin actualizar en procesos de sync/import.
- Diferencias de zona horaria entre frontend y backend.
- Calcular `updated` con criterio distinto al usado en recientes/métricas.
- Frontend enviando un rango y backend aplicando otro por defecto.

## 10) Checklist de implementación

- [x] `updatedAt` activo para movimientos (`@updatedAt`).
- [x] `watermark = MAX(updatedAt)` con filtros del dashboard.
- [x] `updated` calculado con query param `since`.
- [x] Heartbeat separado en detección y cálculo condicional.
- [x] Índices añadidos para rango/orden.
- [ ] Validar con `EXPLAIN` / profiling sobre datos reales.
- [ ] Objetivo p95 heartbeat < 150ms en carga normal.

## 11) Plan por fases

- Fase 1: watermark confiable + `since` + índices base.
- Fase 2: cursor pagination + agregaciones optimizadas.
- Fase 3: cache con invalidación + observabilidad SQL.
