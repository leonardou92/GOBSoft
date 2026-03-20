import 'dotenv/config';
import mysql from 'mysql2/promise';

async function main() {
  const url = process.env.DATABASE_URL;

  if (!url) {
    console.error('DATABASE_URL no está definida en el archivo .env');
    process.exit(1);
  }

  const parsed = new URL(url);

  const host = parsed.hostname || 'localhost';
  const port = parsed.port ? Number(parsed.port) : 3306;
  const user = parsed.username || 'root';
  const password = parsed.password || undefined;
  const database = parsed.pathname.replace(/^\//, '') || 'api_bnc';

  try {
    const connection = await mysql.createConnection({
      host,
      port,
      user,
      password,
    });

    await connection.query(
      `CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`,
    );

    console.log(`Base de datos '${database}' verificada/creada correctamente.`);

    await connection.end();
    process.exit(0);
  } catch (error) {
    console.error('Error creando/verificando la base de datos:', error);
    process.exit(1);
  }
}

main();

