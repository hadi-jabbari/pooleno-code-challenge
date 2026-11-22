import { config as loadEnv } from 'dotenv';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

loadEnv({ override: true });

async function main(): Promise<void> {
  const connectionString =
    process.env.DATABASE_URL ?? 'postgresql://pooleno:pooleno@127.0.0.1:5433/pooleno';

  const pool = new Pool({ connectionString });
  const db = drizzle(pool);

  console.log('Running migrations...');
  await migrate(db, { migrationsFolder: './drizzle' });
  console.log('Migrations complete.');
  await pool.end();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
