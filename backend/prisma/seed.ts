import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const adminPassword = await bcrypt.hash('Admin123!', 10);
  const clientPassword = await bcrypt.hash('Client123!', 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@lendcalc.com' },
    update: {},
    create: {
      email: 'admin@lendcalc.com',
      name: 'Admin User',
      password: adminPassword,
      role: 'ADMIN',
    },
  });

  const client = await prisma.user.upsert({
    where: { email: 'client@example.com' },
    update: {},
    create: {
      email: 'client@example.com',
      name: 'Sample Client',
      password: clientPassword,
      role: 'CLIENT',
      clientProfile: {
        create: {
          phone: '0412345678',
          residencyStatus: 'CITIZEN',
          numberOfAdultDependants: 0,
          numberOfChildDependants: 2,
          maritalStatus: 'MARRIED',
          employmentStatus: 'FULL_TIME',
          status: 'Prospect',
        },
      },
    },
  });

  console.log('Seeded users:', { admin: admin.email, client: client.email });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
