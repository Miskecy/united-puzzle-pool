import { NextRequest } from 'next/server'
import { rateLimitMiddleware } from '@/lib/rate-limit'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

function getSecret(): string { return (process.env.SETUP_SECRET || '').trim() }
function unauthorized() { return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } }) }

async function handler(req: NextRequest, { params }: { params: { id: string } }) {
	const secret = getSecret()
	if (!secret) return new Response(JSON.stringify({ error: 'Setup disabled' }), { status: 404, headers: { 'Content-Type': 'application/json' } })
	const supplied = req.headers.get('x-setup-secret') || ''
	const cookie = req.headers.get('cookie') || ''
	const hasSession = /(?:^|;\s*)setup_session=1(?:;|$)/.test(cookie)
	if (!hasSession && supplied !== secret) return unauthorized()

	try {
		if (req.method !== 'PATCH') {
			return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } })
		}

		const id = params.id
		const body = await req.json().catch(() => ({})) as { action?: string, note?: string }
		const action = String(body?.action || '').toLowerCase()
		const note = String(body?.note || '')
		if (!id || (action !== 'approve' && action !== 'deny' && action !== 'paid' && action !== 'cancel')) {
			return new Response(JSON.stringify({ error: 'Invalid request' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
		}

		type Row = { id: string, user_token_id: string, amount: number, status: string }
        let rows: Row[] = []
        try {
            rows = await prisma.$queryRawUnsafe<Row[]>(`SELECT id, user_token_id, amount, status FROM reward_redemptions WHERE id = ? LIMIT 1`, id)
        } catch (err: unknown) {
            const isKnown = err instanceof Prisma.PrismaClientKnownRequestError
            const code = isKnown ? err.code : ''
            const msg = isKnown ? err.message : String(err)
            const isEmptyDb = code === 'P2021' || msg.includes('does not exist') || msg.includes('no such table')
            if (isEmptyDb) {
                return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } })
            }
            throw err
        }
		const row = rows && rows[0]
		if (!row) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } })

		const status = String(row.status || 'PENDING')

		const userTokenId = String(row.user_token_id)
		const amountMu = Math.max(0, Number(row.amount || 0))
		const now = new Date().toISOString()

		if (action === 'approve') {
			if (status !== 'PENDING') {
				return new Response(JSON.stringify({ error: 'Already processed' }), { status: 409, headers: { 'Content-Type': 'application/json' } })
			}
            let availableAgg: { _sum: { amount: number | null } } = { _sum: { amount: 0 } }
            try {
                availableAgg = await prisma.creditTransaction.aggregate({ where: { userTokenId }, _sum: { amount: true } })
            } catch (err: unknown) {
                const isKnown = err instanceof Prisma.PrismaClientKnownRequestError
                const code = isKnown ? err.code : ''
                const msg = isKnown ? err.message : String(err)
                const isEmptyDb = code === 'P2021' || msg.includes('does not exist') || msg.includes('no such table')
                if (isEmptyDb) {
                    return new Response(JSON.stringify({ error: 'No credits available to deduct' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
                }
                throw err
            }
			const availableMu = Number(availableAgg._sum.amount || 0)
			const deductMu = Math.min(availableMu, amountMu)
			if (!isFinite(deductMu) || deductMu <= 0) {
				return new Response(JSON.stringify({ error: 'No credits available to deduct' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
			}

			const tx = await prisma.creditTransaction.create({ data: { userTokenId, type: 'SPENT', amount: -deductMu, description: `Redeem approved (${id})` } })
			await prisma.$executeRawUnsafe(`UPDATE reward_redemptions SET status = 'APPROVED', updated_at = ?, approved_at = ?, admin_note = ? WHERE id = ?`, now, now, note || null, id)
			return new Response(JSON.stringify({ success: true, status: 'APPROVED', transactionId: tx.id }), { status: 200, headers: { 'Content-Type': 'application/json' } })
		} else if (action === 'deny') {
			if (status !== 'PENDING') {
				return new Response(JSON.stringify({ error: 'Already processed' }), { status: 409, headers: { 'Content-Type': 'application/json' } })
			}
			await prisma.$executeRawUnsafe(`UPDATE reward_redemptions SET status = 'DENIED', updated_at = ?, admin_note = ? WHERE id = ?`, now, note || null, id)
			return new Response(JSON.stringify({ success: true, status: 'DENIED' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
		} else if (action === 'paid') {
			if (status !== 'APPROVED') {
				return new Response(JSON.stringify({ error: 'Only approved requests can be marked as paid' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
			}
			await prisma.$executeRawUnsafe(`ALTER TABLE reward_redemptions ADD COLUMN paid_at DATETIME`).catch(() => { })
			await prisma.$executeRawUnsafe(`UPDATE reward_redemptions SET status = 'PAID', updated_at = ?, paid_at = ?, admin_note = ? WHERE id = ?`, now, now, note || null, id)
			return new Response(JSON.stringify({ success: true, status: 'PAID' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
		} else if (action === 'cancel') {
			if (status !== 'APPROVED') {
				return new Response(JSON.stringify({ error: 'Only approved requests can be canceled' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
			}
			await prisma.$executeRawUnsafe(`ALTER TABLE reward_redemptions ADD COLUMN canceled_at DATETIME`).catch(() => { })
			await prisma.$executeRawUnsafe(`UPDATE reward_redemptions SET status = 'CANCELED', updated_at = ?, canceled_at = ?, admin_note = ? WHERE id = ?`, now, now, note || null, id)
			return new Response(JSON.stringify({ success: true, status: 'CANCELED' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
		}
		return new Response(JSON.stringify({ error: 'Invalid action' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
	} catch (error) {
		console.error('Admin redeem update error:', error)
		return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
	}
}

export const PATCH = (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => ctx.params.then(p => rateLimitMiddleware((r) => handler(r, { params: p }))(req))
