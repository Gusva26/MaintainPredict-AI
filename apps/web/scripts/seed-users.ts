import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { db, pg } from '../lib/db/client';
import { users } from '../lib/db/schema';
import { eq } from 'drizzle-orm';

const PWD = 'Password123!';

async function main() {
  const hash = await bcrypt.hash(PWD, 10);
  // 7 usuarios (spec §10): 1 admin, 1 supervisor, 1 planner y 4 técnicos.
  const list = [
    { email: 'admin@mp.ai',      fullName: 'Admin Principal',    role: 'admin' },
    { email: 'supervisor@mp.ai', fullName: 'Laura Supervisora',  role: 'supervisor' },
    { email: 'planner@mp.ai',    fullName: 'Diego Planificador', role: 'planner' },
    { email: 'tec1@mp.ai',       fullName: 'Carlos Técnico',     role: 'technician' },
    { email: 'tec2@mp.ai',       fullName: 'Marta Técnica',      role: 'technician' },
    { email: 'tec3@mp.ai',       fullName: 'Javier Técnico',     role: 'technician' },
    { email: 'tec4@mp.ai',       fullName: 'Ana Técnica',        role: 'technician' },
  ] as const;

  console.log('Seeding demo users with real bcrypt hash...');
  for (const u of list) {
    const [exists] = await db.select().from(users).where(eq(users.email, u.email)).limit(1);
    if (exists) {
      await db.update(users).set({ passwordHash: hash, role: u.role, fullName: u.fullName, isActive: true })
        .where(eq(users.email, u.email));
      console.log('↻ updated', u.email);
    } else {
      await db.insert(users).values({ ...u, passwordHash: hash, isActive: true });
      console.log('＋ inserted', u.email);
    }
  }

  await pg.end();
  console.log('Done! All users seeded with password:', PWD);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
