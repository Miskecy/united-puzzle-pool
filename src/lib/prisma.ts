import path from 'path'
import { PrismaClient } from '@prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'

function resolveDbPath(): string {
	const raw = (process.env.DATABASE_URL || '').trim()
	if (!raw) return path.join(process.cwd(), 'prisma', 'dev.db')
	const p = raw.startsWith('file:') ? raw.slice(5) : raw
	if (path.isAbsolute(p)) return p
	const normalized = p.replace(/^[./\\]+/, '')
	const inPrisma = normalized.startsWith('prisma/') || normalized.startsWith(`prisma${path.sep}`)
	return inPrisma
		? path.join(process.cwd(), normalized)
		: path.join(process.cwd(), 'prisma', normalized)
}

function makeClient() {
	const adapter = new PrismaBetterSqlite3({ url: resolveDbPath() })
	return new PrismaClient({
		adapter,
		log: process.env.NODE_ENV === 'production' ? ['error'] : [],
		transactionOptions: { timeout: 30000, maxWait: 30000 },
	})
}

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined }

export const prisma = globalForPrisma.prisma ?? makeClient()

async function configure() {
	try {
		await prisma.$queryRawUnsafe('PRAGMA journal_mode=WAL')
		await prisma.$queryRawUnsafe('PRAGMA busy_timeout=60000')
		await prisma.$queryRawUnsafe('PRAGMA synchronous=NORMAL')
		await prisma.$queryRawUnsafe('PRAGMA wal_checkpoint(TRUNCATE)')
		await prisma.$queryRawUnsafe('PRAGMA optimize')
	} catch { }
}

configure()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
