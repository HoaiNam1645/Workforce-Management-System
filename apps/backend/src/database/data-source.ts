import { resolve } from 'node:path';
import { config } from 'dotenv';
import { DataSource } from 'typeorm';

config({ path: resolve(process.cwd(), '.env') });

export default new DataSource({
  type: 'postgres',
  host: process.env.DATABASE_HOST ?? 'localhost',
  port: Number(process.env.DATABASE_PORT ?? 5432),
  username: process.env.DATABASE_USER ?? 'workforce',
  password: process.env.DATABASE_PASSWORD ?? 'workforce',
  database: process.env.DATABASE_NAME ?? 'workforce',
  schema: 'workforce',
  synchronize: false,
  logging: process.env.DATABASE_LOGGING === 'true',
  ssl:
    process.env.DATABASE_SSL === 'true'
      ? { rejectUnauthorized: false }
      : false,
  entities: [resolve(__dirname, '../modules/**/*.entity.{ts,js}')],
  migrations: [resolve(__dirname, './migrations/*.{ts,js}')],
});
