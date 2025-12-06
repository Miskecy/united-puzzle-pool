import { NextRequest } from 'next/server'
import { rateLimitMiddleware } from '@/lib/rate-limit'
import { prisma } from '@/lib/prisma'
import DatabaseCtor from 'better-sqlite3'
import fs from 'fs/promises'
import path from 'path'

function getSecret(): string { return (process.env.SETUP_SECRET || '').trim() }
function unauthorized() { return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } }) }

async function handler(req: NextRequest) {
	const secret = getSecret()
	if (!secret) return new Response(JSON.stringify({ error: 'Setup disabled' }), { status: 404, headers: { 'Content-Type': 'application/json' } })
	const supplied = req.headers.get('x-setup-secret') || ''
	const cookie = req.headers.get('cookie') || ''
	const hasSession = /(?:^|;\s*)setup_session=1(?:;|$)/.test(cookie)
	if (!hasSession && supplied !== secret) return unauthorized()

	function resolveDbPath() {
		const url = (process.env.DATABASE_URL || '').trim()
		let p = ''
		if (url.startsWith('file:')) {
			p = url.slice(5)
		}
		if (!p) {
			p = path.join(process.cwd(), 'prisma', 'dev.db')
		} else if (!path.isAbsolute(p)) {
			p = path.join(process.cwd(), p)
		}
		const wal = `${p}-wal`
		const shm = `${p}-shm`
		return { dbFile: p, walFile: wal, shmFile: shm }
	}
	const { dbFile, walFile, shmFile } = resolveDbPath()

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	function withDb<T>(fn: (db: any) => T): T {
		const db = new DatabaseCtor(dbFile, { fileMustExist: true })
		try { return fn(db) } finally { try { db.close() } catch { } }
	}

	if (req.method === 'GET') {
		try {
			try { await prisma.$executeRawUnsafe('PRAGMA wal_checkpoint(FULL);') } catch { }
			const now = new Date()
			const pad = (n: number) => n.toString().padStart(2, '0')
			const fname = `dev-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}.db`
			const tmp = path.join(path.dirname(dbFile), `backup-${Date.now()}.db`)
			try {
				withDb(db => {
					db.pragma('wal_checkpoint(FULL)')
					const target = tmp.replace(/'/g, "''")
					db.exec(`VACUUM INTO '${target}'`)
				})
				const buf = await fs.readFile(tmp)
				await fs.unlink(tmp)
				return new Response(buf, {
					status: 200,
					headers: {
						'Content-Type': 'application/octet-stream',
						'Content-Disposition': `attachment; filename="${fname}"`,
					},
				})
			} catch {
				const buf = await fs.readFile(dbFile)
				return new Response(buf, {
					status: 200,
					headers: {
						'Content-Type': 'application/octet-stream',
						'Content-Disposition': `attachment; filename="${fname}"`,
					},
				})
			}
		} catch {
			return new Response(JSON.stringify({ error: 'Backup failed' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
		}
	}

	if (req.method === 'POST') {
		try {
			let buf: ArrayBuffer | null = null
			const ct = req.headers.get('content-type') || ''
			if (ct.includes('multipart/form-data')) {
				const fd = await req.formData()
				const file = fd.get('file') as File | null
				if (!file) return new Response(JSON.stringify({ error: 'Missing file' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
				buf = await file.arrayBuffer()
			} else {
				buf = await req.arrayBuffer()
			}
			if (!buf || (buf as ArrayBuffer).byteLength <= 0) {
				return new Response(JSON.stringify({ error: 'Empty payload' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
			}
			try { await prisma.$executeRawUnsafe('PRAGMA wal_checkpoint(FULL);') } catch { }
			try { await prisma.$disconnect() } catch { }
			try { await fs.unlink(walFile) } catch { }
			try { await fs.unlink(shmFile) } catch { }
			try { await fs.unlink(dbFile) } catch { }
			const tmp = path.join(path.dirname(dbFile), `restore-${Date.now()}.tmp`)
			await fs.writeFile(tmp, Buffer.from(buf))
			try { await fs.rename(tmp, dbFile) } catch { await fs.copyFile(tmp, dbFile); await fs.unlink(tmp) }
			try {
				withDb(db => {
					db.pragma('journal_mode = WAL')
					db.exec('VACUUM')
				})
			} catch { }
			try { await prisma.$connect() } catch { }
			let tables = 0
			try {
				const rows = await prisma.$queryRaw<{ name: string }[]>`SELECT name FROM sqlite_master WHERE type='table'`
				tables = Array.isArray(rows) ? rows.length : 0
			} catch { }
			return new Response(JSON.stringify({ ok: true, tables }), { status: 200, headers: { 'Content-Type': 'application/json' } })
		} catch {
			return new Response(JSON.stringify({ error: 'Restore failed' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
		}
	}

	return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } })
}

export const GET = rateLimitMiddleware(handler)
export const POST = rateLimitMiddleware(handler)
