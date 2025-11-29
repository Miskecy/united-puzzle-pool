import { NextRequest } from 'next/server'
import { rateLimitMiddleware } from '@/lib/rate-limit'
import { prisma } from '@/lib/prisma'
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

	const dbDir = path.join(process.cwd(), 'prisma')
	const dbFile = path.join(dbDir, 'dev.db')
	const walFile = path.join(dbDir, 'dev.db-wal')
	const shmFile = path.join(dbDir, 'dev.db-shm')

	if (req.method === 'GET') {
		try {
			try { await prisma.$executeRawUnsafe('PRAGMA wal_checkpoint(FULL);') } catch { }
			const buf = await fs.readFile(dbFile)
			return new Response(buf, {
				status: 200,
				headers: {
					'Content-Type': 'application/octet-stream',
					'Content-Disposition': 'attachment; filename="dev.db"',
				},
			})
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
			try { await fs.unlink(walFile) } catch { }
			try { await fs.unlink(shmFile) } catch { }
			const tmp = path.join(dbDir, `restore-${Date.now()}.tmp`)
			await fs.writeFile(tmp, Buffer.from(buf))
			await fs.copyFile(tmp, dbFile)
			await fs.unlink(tmp)
			return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })
		} catch {
			return new Response(JSON.stringify({ error: 'Restore failed' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
		}
	}

	return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } })
}

export const GET = rateLimitMiddleware(handler)
export const POST = rateLimitMiddleware(handler)
