import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
	prisma: PrismaClient | undefined;
};

export const prisma =
	globalForPrisma.prisma ??
	new PrismaClient({
		log: process.env.NODE_ENV === 'production' ? ['error'] : [],
		transactionOptions: { timeout: 30000, maxWait: 30000 },
	});

async function configure() {
	try {
		await prisma.$queryRawUnsafe('PRAGMA journal_mode=WAL');
		await prisma.$queryRawUnsafe('PRAGMA busy_timeout=60000');
		await prisma.$queryRawUnsafe('PRAGMA synchronous=NORMAL');
	} catch { }
}

configure();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
