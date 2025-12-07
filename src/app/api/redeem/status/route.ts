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
		const rows = await prisma.$queryRawUnsafe<{ id: string, status: string, amount: number, address: string, created_at?: string }[]>(
			`SELECT id, status, amount, address, created_at FROM reward_redemptions WHERE user_token_id = ? AND status = 'PENDING' ORDER BY created_at DESC LIMIT 1`,
			userToken.id
		)
		const row = rows && rows[0]
		if (!row) return new Response(JSON.stringify({ status: 'NONE' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
		const amtRaw = Number(row.amount || 0)
		const credits = amtRaw >= 1_000_000 ? (amtRaw / 1_000_000) : (amtRaw / 1_000)
		return new Response(JSON.stringify({ status: 'PENDING', id: String(row.id), amount: credits, address: String(row.address), createdAt: String(row.created_at || '') }), { status: 200, headers: { 'Content-Type': 'application/json' } })
	} catch (error) {
		console.error('Redeem status error:', error)
		return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
	}
}

export const GET = rateLimitMiddleware(handler)
