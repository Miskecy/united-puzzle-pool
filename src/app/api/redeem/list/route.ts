import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { rateLimitMiddleware } from '@/lib/rate-limit'

function extractToken(req: NextRequest): string | null {
	const authHeader = req.headers.get('Authorization')
	if (authHeader && authHeader.startsWith('Bearer ')) return authHeader.slice(7)
	return req.headers.get('pool-token')
}

async function ensureRedeemTable() {
	try {
		await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS reward_redemptions (
        id TEXT NOT NULL PRIMARY KEY,
        user_token_id TEXT NOT NULL,
        address TEXT NOT NULL,
        amount INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING',
        message TEXT NOT NULL,
        signature TEXT NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL,
        approved_at DATETIME,
        admin_note TEXT,
        CONSTRAINT reward_redemptions_user_token_id_fkey FOREIGN KEY (user_token_id) REFERENCES user_tokens (id) ON DELETE RESTRICT ON UPDATE CASCADE
      )
    `)
	} catch { }
}

async function handler(req: NextRequest) {
	try {
		if (req.method !== 'GET') {
			return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } })
		}

		const token = extractToken(req)
		if (!token) return new Response(JSON.stringify({ error: 'Missing authentication token' }), { status: 401, headers: { 'Content-Type': 'application/json' } })

		const userToken = await prisma.userToken.findUnique({ where: { token } })
		if (!userToken) return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401, headers: { 'Content-Type': 'application/json' } })

		await ensureRedeemTable()
		try { await prisma.$executeRawUnsafe(`ALTER TABLE reward_redemptions ADD COLUMN puzzle_id TEXT`) } catch { }
		try { await prisma.$executeRawUnsafe(`ALTER TABLE reward_redemptions ADD COLUMN puzzle_address TEXT`) } catch { }
		try { await prisma.$executeRawUnsafe(`ALTER TABLE reward_redemptions ADD COLUMN paid_at DATETIME`) } catch { }
		try { await prisma.$executeRawUnsafe(`ALTER TABLE reward_redemptions ADD COLUMN canceled_at DATETIME`) } catch { }

		type Row = { id: string, amount: number, status: string, created_at?: string, approved_at?: string, updated_at?: string, paid_at?: string, canceled_at?: string, puzzle_address?: string | null }
		const rows = await prisma.$queryRawUnsafe<Row[]>(`SELECT id, amount, status, created_at, approved_at, updated_at, paid_at, canceled_at, puzzle_address FROM reward_redemptions WHERE user_token_id = ? ORDER BY created_at DESC LIMIT 50`, userToken.id)

		const items = rows.map(r => ({
			id: String(r.id),
			amount: (() => { const a = Number(r.amount || 0); return a >= 1_000_000 ? (a / 1_000_000) : (a / 1_000) })(),
			status: String(r.status || 'PENDING'),
			createdAt: r.created_at ? new Date(r.created_at).toISOString() : null,
			approvedAt: r.approved_at ? new Date(r.approved_at).toISOString() : null,
			updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : null,
			paidAt: r.paid_at ? new Date(r.paid_at).toISOString() : null,
			canceledAt: r.canceled_at ? new Date(r.canceled_at).toISOString() : null,
			puzzleAddress: r.puzzle_address ? String(r.puzzle_address) : null,
		}))

		return new Response(JSON.stringify({ items }), { status: 200, headers: { 'Content-Type': 'application/json' } })
	} catch (error) {
		console.error('Redeem list error:', error)
		return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
	}
}

export const GET = rateLimitMiddleware(handler)

