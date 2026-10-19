import type { Config } from 'drizzle-kit';

export default {
  schema: './lib/db/schema.ts',
  out: './lib/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgresql://mp_user:mp_pass_change_me@localhost:5432/maintainpredict'
  },
  introspect: {
    casing: 'preserve'
  }
} satisfies Config;
