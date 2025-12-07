import { NextRequest } from 'next/server'
import { rateLimitMiddleware } from '@/lib/rate-limit'
import { listPuzzleConfigs, upsertPuzzleConfig } from '@/lib/config'
import { Prisma } from '@prisma/client'

function getSecret(): string {
	return (process.env.SETUP_SECRET || '').trim()
}

function unauthorized() {
	return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
}

async function handler(req: NextRequest) {
	const secret = getSecret()
	if (!secret) {
		return new Response(JSON.stringify({ error: 'Setup disabled' }), { status: 404, headers: { 'Content-Type': 'application/json' } })
	}

	const supplied = req.headers.get('x-setup-secret') || ''
	const cookie = req.headers.get('cookie') || ''
	const hasSession = /(?:^|;\s*)setup_session=1(?:;|$)/.test(cookie)
	if (!hasSession && supplied !== secret) return unauthorized()

    if (req.method === 'GET') {
        try {
            const list = await listPuzzleConfigs()
            return new Response(JSON.stringify(list), { status: 200, headers: { 'Content-Type': 'application/json' } })
        } catch (err: unknown) {
            const isKnown = err instanceof Prisma.PrismaClientKnownRequestError
            const code = isKnown ? err.code : ''
            const msg = isKnown ? err.message : String(err)
            const isEmptyDb = code === 'P2021' || msg.includes('does not exist') || msg.includes('no such table')
            if (isEmptyDb) {
                return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } })
            }
            return new Response(JSON.stringify({ error: 'Failed to list configs' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
        }
    }

    if (req.method === 'POST') {
        try {
            const body = await req.json()
            const address = String(body?.address ?? '')
            const startHex = String(body?.startHex ?? '')
            const endHex = String(body?.endHex ?? '')
            const name = body?.name ? String(body.name) : undefined
            const solved = body?.solved === true || body?.solved === 'true'
            if (!address || !startHex || !endHex) {
                return new Response(JSON.stringify({ error: 'Missing fields' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
            }
            const saved = await upsertPuzzleConfig({ name, address, startHex, endHex, solved })
            return new Response(JSON.stringify(saved), { status: 200, headers: { 'Content-Type': 'application/json' } })
        } catch (err: unknown) {
            const isKnown = err instanceof Prisma.PrismaClientKnownRequestError
            const msg = isKnown ? err.message : String(err)
            const isEmptyDb = (isKnown && err.code === 'P2021') || msg.includes('does not exist') || msg.includes('no such table')
            if (isEmptyDb) {
                return new Response(JSON.stringify({ error: 'Database not initialized' }), { status: 409, headers: { 'Content-Type': 'application/json' } })
            }
            return new Response(JSON.stringify({ error: 'Invalid payload' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
        }
    }

	return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } })
}

export const GET = rateLimitMiddleware(handler)
export const POST = rateLimitMiddleware(handler)
