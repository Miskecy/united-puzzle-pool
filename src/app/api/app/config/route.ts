import { NextRequest } from 'next/server'
import { rateLimitMiddleware } from '@/lib/rate-limit'
import { prisma } from '@/lib/prisma'

function getSecret(): string { return (process.env.SETUP_SECRET || '').trim() }
function unauthorized() { return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } }) }

async function getConfig() {
	const rows = await prisma.$queryRaw<{ shared_pool_api_enabled: number }[]>`
    SELECT shared_pool_api_enabled FROM app_config WHERE id = 'singleton' LIMIT 1
  `
	const enabled = rows && rows[0] ? !!rows[0].shared_pool_api_enabled : false
	return { shared_pool_api_enabled: enabled }
}

async function setEnabled(enabled: boolean) {
	const now = new Date().toISOString()
	await prisma.$executeRaw`
    UPDATE app_config SET shared_pool_api_enabled = ${enabled ? 1 : 0}, updated_at = ${now} WHERE id = 'singleton'
  `
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
