import { NextRequest } from 'next/server'
import { rateLimitMiddleware } from '@/lib/rate-limit'
import { prisma } from '@/lib/prisma'
import { deletePuzzleConfig, updatePuzzleConfig } from '@/lib/config'

function getSecret(): string { return (process.env.SETUP_SECRET || '').trim() }
function unauthorized() { return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } }) }

async function handler(req: NextRequest, { params }: { params: { id: string } }) {
	const secret = getSecret()
	if (!secret) return new Response(JSON.stringify({ error: 'Setup disabled' }), { status: 404, headers: { 'Content-Type': 'application/json' } })
	const supplied = req.headers.get('x-setup-secret') || ''
	const cookie = req.headers.get('cookie') || ''
	const hasSession = /(?:^|;\s*)setup_session=1(?:;|$)/.test(cookie)
	if (!hasSession && supplied !== secret) return unauthorized()

	const id = params?.id || ''
	if (!id) return new Response(JSON.stringify({ error: 'Missing id' }), { status: 400, headers: { 'Content-Type': 'application/json' } })

	if (req.method === 'PATCH') {
		try {
			const body = await req.json()
			const name = body?.name as string | undefined
			const address = body?.address as string | undefined
			const startHex = body?.startHex as string | undefined
			const endHex = body?.endHex as string | undefined
			const solved = (body?.solved === true || body?.solved === 'true') ? true : (body?.solved === false || body?.solved === 'false') ? false : undefined
			const updated = await updatePuzzleConfig(id, { name, address, startHex, endHex, solved })
			return new Response(JSON.stringify(updated), { status: 200, headers: { 'Content-Type': 'application/json' } })
		} catch {
			return new Response(JSON.stringify({ error: 'Invalid payload' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
		}
	}

	if (req.method === 'DELETE') {
		try {
			const url = new URL(req.url)
			const force = url.searchParams.get('force') === 'true' || (req.headers.get('x-force-delete') === 'true')
			if (!force) {
				const target = await prisma.puzzleConfig.findUnique({ where: { id }, select: { active: true } })
				if (target?.active) {
					return new Response(JSON.stringify({ error: 'Active puzzle cannot be deleted without force' }), { status: 409, headers: { 'Content-Type': 'application/json' } })
				}
			}
			await deletePuzzleConfig(id)
			return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })
		} catch {
			return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } })
		}
	}

	return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } })
}

export const PATCH = (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => ctx.params.then(p => rateLimitMiddleware((r) => handler(r, { params: p }))(req))
export const DELETE = (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => ctx.params.then(p => rateLimitMiddleware((r) => handler(r, { params: p }))(req))
