import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import { env } from '@/lib/env';

declare global {
  // eslint-disable-next-line no-var
  var __pg: postgres.Sql | undefined;
}

const client =
  global.__pg ??
  postgres(env.DATABASE_URL, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
  });

if (env.NODE_ENV !== 'production') global.__pg = client;

export const db = drizzle(client, { schema, logger: env.NODE_ENV === 'development' });
export { client as pg };
