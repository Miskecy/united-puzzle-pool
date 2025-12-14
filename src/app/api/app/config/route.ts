import { NextRequest } from 'next/server'
import { rateLimitMiddleware } from '@/lib/rate-limit'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

function getSecret(): string { return (process.env.SETUP_SECRET || '').trim() }
function unauthorized() { return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } }) }

async function ensureAppConfigTable() {
    try {
        await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS app_config (
        id TEXT NOT NULL PRIMARY KEY,
        shared_pool_api_enabled INTEGER NOT NULL DEFAULT 0,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`)
        await prisma.$executeRawUnsafe(`INSERT OR IGNORE INTO app_config (id, shared_pool_api_enabled) VALUES ('singleton', 0)`)    
    } catch { }
}

async function getConfig() {
    try {
        const rows = await prisma.$queryRaw<{ shared_pool_api_enabled: number }[]>`
    SELECT shared_pool_api_enabled FROM app_config WHERE id = 'singleton' LIMIT 1
  `
        const enabled = rows && rows[0] ? !!rows[0].shared_pool_api_enabled : false
        return { shared_pool_api_enabled: enabled }
    } catch (err: unknown) {
        const isKnown = err instanceof Prisma.PrismaClientKnownRequestError
        const code = isKnown ? err.code : ''
        const msg = isKnown ? err.message : String(err)
        const isEmptyDb = code === 'P2021' || msg.includes('does not exist') || msg.includes('no such table')
        if (isEmptyDb) {
            return { shared_pool_api_enabled: false }
        }
        return { shared_pool_api_enabled: false }
    }
}

async function setEnabled(enabled: boolean) {
    const now = new Date().toISOString()
    try {
        await ensureAppConfigTable()
        await prisma.$executeRaw`
    UPDATE app_config SET shared_pool_api_enabled = ${enabled ? 1 : 0}, updated_at = ${now} WHERE id = 'singleton'
  `
    } catch {
        try { await ensureAppConfigTable() } catch { }
    }
}

async function handler(req: NextRequest) {
	const secret = getSecret()

    if (req.method === 'GET') {
        const cfg = await getConfig()
        return new Response(JSON.stringify(cfg), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }

	if (req.method === 'PATCH') {
		const supplied = req.headers.get('x-setup-secret') || ''
		const cookie = req.headers.get('cookie') || ''
		const hasSession = /(?:^|;\s*)setup_session=1(?:;|$)/.test(cookie)
		if (!hasSession && supplied !== secret) return unauthorized()
		try {
			const body = await req.json()
            const v = !!body?.shared_pool_api_enabled
            await setEnabled(v)
            const cfg = await getConfig()
            return new Response(JSON.stringify(cfg), { status: 200, headers: { 'Content-Type': 'application/json' } })
        } catch {
            return new Response(JSON.stringify({ error: 'Invalid payload' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
        }
    }

	return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } })
}

export const GET = rateLimitMiddleware(handler)
export const PATCH = rateLimitMiddleware(handler)
