import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = 'nabeelkhan.dev@gmail.com';
  const password = '12345678';

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`✓ Seed user already exists: ${email}`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.create({ data: { email, passwordHash } });
  console.log(`✓ Seeded user: ${email}`);
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
