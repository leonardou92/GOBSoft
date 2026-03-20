import { createApp } from './app';
import { runInitialHistorySyncIfNeeded } from './jobs/initialHistorySync.job';
import { startStatementSyncJob } from './jobs/statementSync.job';

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

const initialSyncStart = process.env.INITIAL_SYNC_START_DATE;

if (!initialSyncStart || !initialSyncStart.trim()) {
  // No permitir arrancar sin definir la fecha inicial de sincronización
  // para garantizar que la data histórica se llene de forma coherente.
  // Esto aplica en todos los entornos mientras no se configure.
  // eslint-disable-next-line no-console
  console.error(
    'ERROR: Debe configurar INITIAL_SYNC_START_DATE en el .env (formato YYYY-MM-DD) antes de iniciar el backend.',
  );
  process.exit(1);
}

const app = createApp();

app.listen(PORT, () => {
  console.log(`API-BNC escuchando en http://localhost:${PORT}`);

  // 1) Sincronización inicial histórica (obligatoria, ya que INITIAL_SYNC_START_DATE está configurada)
  void runInitialHistorySyncIfNeeded().then(() => {
    // 2) Solo después de la sync inicial arrancamos el cron de 3 días
    startStatementSyncJob();
  });
});

