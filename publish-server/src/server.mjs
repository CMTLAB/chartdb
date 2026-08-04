import { bootstrapAdmin, migrate, openDatabase } from './db.mjs';
import { buildApp } from './app.mjs';

const port = Number(process.env.PORT ?? 8788);
const host = process.env.HOST ?? '0.0.0.0';
const databaseFile = process.env.DATABASE_FILE ?? '/data/chartdb.sqlite';

const db = openDatabase(databaseFile);
migrate(db);
await bootstrapAdmin(db);

const app = await buildApp({ db, logger: true });
await app.listen({ port, host });
