# API Transacciones – Documentación frontend

Documentación para el equipo frontend: sync de transacciones desde BNC a BD y consulta de transacciones.

---

## 1) Sync de transacciones desde BNC a BD

**Ruta:** `/api/account/history-by-date-sync`  
**Método:** POST  
**Auth:** `Authorization: Bearer <JWT>`

### Request

**Headers:**
- `Content-Type: application/json`
- `Authorization: Bearer <token_jwt>`

**Body:**
```json
{
  "accountNumber": "01050123456789012345",
  "startDate": "01/03/2026",
  "endDate": "13/03/2026",
  "workingKey": "XXXXXXXX..."
}
```

| Campo | Requerido | Descripción |
|-------|-----------|-------------|
| accountNumber | Sí | Número de cuenta. Debe existir antes en `/api/bank-accounts`. |
| startDate | Sí | Fecha inicio. Formato `dd/MM/yyyy` o ISO. |
| endDate | Sí | Fecha fin. Formato `dd/MM/yyyy` o ISO. |
| workingKey | Sí | WorkingKey válido del día. Viene de la operación de **Logon contra el BNC** (p. ej. `POST /api/auth/login-simple` → extraer de `decrypted`). |

### Response – éxito (200)

```json
{
  "message": "Historial por rango de fechas sincronizado y almacenado en base de datos.",
  "syncedCount": 42,
  "totalFromBnc": 50
}
```

- **syncedCount:** movimientos insertados sin duplicar.  
- **totalFromBnc:** movimientos devueltos por el BNC.

### Response – sin movimientos útiles (200)

```json
{
  "message": "Historial por rango de fechas obtenido desde el BNC, pero no hay movimientos para sincronizar.",
  "syncedCount": 0,
  "totalFromBnc": 0
}
```

### Errores comunes

| Código | Descripción | Ejemplo body |
|--------|-------------|--------------|
| **400** | Request inválido | `{ "message": "Debe enviar accountNumber, startDate, endDate y workingKey en el cuerpo." }` |
| **401** | JWT inválido o expirado | `{ "message": "Token JWT inválido o expirado." }` |
| **404** | Cuenta no existe en BD local | `{ "message": "La cuenta bancaria no existe en la base de datos local. Regístrela primero." }` |
| **502** | Error del BNC | `{ "message": "Error al consultar el historial...", "statusCode": 400, "bncMessage": "00XXXX...", "body": { ... } }` |

---

## 2) Consultar transacciones desde la BD

**Ruta:** `/api/transactions`  
**Método:** GET  
**Auth:** `Authorization: Bearer <JWT>`

### Query params (opcionales)

| Param | Default | Descripción |
|-------|---------|-------------|
| page | 1 | Número de página (>= 1). |
| pageSize | 20 | Tamaño de página (1–200). |
| accountNumber | — | Filtrar por número de cuenta. |
| clientId | — | Filtrar por cliente. |
| operationType | — | Filtrar por tipo lógico. Valores: `CARGO`, `P2PTSP`, `CIOPPS`, `CIPOTR`, `CIORPS`, `ABONO`, `CIOCCS`. |

**Ejemplos:**
- `GET /api/transactions?page=1&pageSize=50`
- `GET /api/transactions?accountNumber=0105...`
- `GET /api/transactions?operationType=P2PTSP`

### Response 200

```json
{
  "page": 1,
  "pageSize": 20,
  "total": 125,
  "totalPages": 7,
  "items": [
    {
      "id": 10,
      "bankAccountId": 1,
      "accountNumber": "01050123456789012345",
      "movementDate": "2026-03-10T00:00:00.000Z",
      "controlNumber": "123456",
      "amount": 100.5,
      "code": "388",
      "bankCode": "0191",
      "debtorInstrument": "584120001122",
      "concept": "Pago móvil recibido",
      "type": "CREDITO",
      "balanceDelta": "INGRESO",
      "referenceA": "REF123",
      "referenceB": null,
      "referenceC": null,
      "referenceD": null,
      "kind": "P2P",
      "transactionTypeCode": 388,
      "operationType": "P2PTSP",
      "transactionTypeLabel": "Abono Pago Móvil BNC",
      "createdAt": "2026-03-10T16:00:00.000Z",
      "updatedAt": "2026-03-10T16:00:00.000Z"
    }
  ]
}
```

---

## Obtención de la workingKey (login-simple)

La **workingKey** no la ingresa el usuario. El frontend debe:

1. Llamar a **POST `/api/auth/login-simple`** (sin body; no requiere JWT).  
2. En la respuesta 200, leer **`decrypted`** y extraer la clave (p. ej. `decrypted.workingKey` o `decrypted.WorkingKey`).  
3. Usar esa workingKey en el body de **POST `/api/account/history-by-date-sync`**.

La WorkingKey **vence a medianoche**; si el sync falla con 502, conviene hacer login-simple de nuevo y reintentar.
