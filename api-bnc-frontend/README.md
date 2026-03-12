# API BNC Frontend (Node)

Proyecto mínimo en **Node.js** pensado como bootstrap y soporte para el ecosistema **API BNC**.

## Requisitos

- Node.js instalado (versión recomendada: 18 o superior).
- npm (incluido con Node).

## Instalación

```bash
npm install
```

## Scripts disponibles

- `npm start`  
  Ejecuta el servidor en modo simple:

  ```bash
  npm start
  ```

- `npm run dev`  
  Ejecuta el servidor con recarga automática mediante `nodemon`:

  ```bash
  npm run dev
  ```

## Endpoints iniciales

- `GET /health`  
  Respuesta JSON con el estado del servicio.

- `GET /` (y cualquier otra ruta)  
  Respuesta en texto plano con un mensaje genérico.

## Documentación de contexto

El contexto detallado del proyecto está en:

- `docs/PROJECT_CONTEXT.md`

Puedes copiar ese archivo completo para pegarlo donde necesites describir el **contexto del proyecto**.

