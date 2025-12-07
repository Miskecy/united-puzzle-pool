import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { rateLimitMiddleware } from '@/lib/rate-limit'
import { getRedisClient } from '@/lib/redis'
import * as bitcoinMessage from 'bitcoinjs-message'

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
		await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_reward_redemptions_created ON reward_redemptions(created_at)`)
	} catch { }
}

function randomId(): string {
	const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
	let out = ''
	for (let i = 0; i < 24; i++) out += chars.charAt(Math.floor(Math.random() * chars.length))
	return out
}

async function handler(req: NextRequest) {
	try {
		if (req.method !== 'POST') {
			return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } })
		}

		const token = extractToken(req)
		if (!token) return new Response(JSON.stringify({ error: 'Missing authentication token' }), { status: 401, headers: { 'Content-Type': 'application/json' } })

		const body = await req.json().catch(() => ({})) as { nonce?: string, signature?: string }
		const nonce = String(body?.nonce || '').trim()
		const signature = String(body?.signature || '').trim()
		if (!nonce || !signature) {
			return new Response(JSON.stringify({ error: 'Missing nonce or signature' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
		}

		const client = await getRedisClient()
		const key = `redeem:${token}:${nonce}`
		const raw = await client.get(key)
		if (!raw) {
			return new Response(JSON.stringify({ error: 'Redemption session expired or invalid' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
		}

		const data = JSON.parse(raw) as { token: string, userTokenId: string, address: string, amount: number, message: string }
		const payload = JSON.parse(raw) as { token: string, userTokenId: string, address: string, amount: number, message: string, puzzleId?: string | null, puzzleAddress?: string | null }

		const ok = bitcoinMessage.verify(data.message, data.address, signature)
		if (!ok) {
			return new Response(JSON.stringify({ error: 'Signature verification failed' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
		}

		const userToken = await prisma.userToken.findUnique({ where: { id: data.userTokenId } })
		if (!userToken || userToken.token !== token) {
			return new Response(JSON.stringify({ error: 'Invalid token or user session' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
		}

		await ensureRedeemTable()
		try { await prisma.$executeRawUnsafe(`ALTER TABLE reward_redemptions ADD COLUMN puzzle_id TEXT`) } catch { }
		try { await prisma.$executeRawUnsafe(`ALTER TABLE reward_redemptions ADD COLUMN puzzle_address TEXT`) } catch { }
		try { await prisma.$executeRawUnsafe(`ALTER TABLE reward_redemptions ADD COLUMN paid_at DATETIME`) } catch { }
		try { await prisma.$executeRawUnsafe(`ALTER TABLE reward_redemptions ADD COLUMN canceled_at DATETIME`) } catch { }

		const id = randomId()
		const now = new Date().toISOString()
		await prisma.$executeRawUnsafe(
			`INSERT INTO reward_redemptions (id, user_token_id, address, amount, status, message, signature, created_at, updated_at) VALUES (?, ?, ?, ?, 'PENDING', ?, ?, ?, ?)`,
			id,
			data.userTokenId,
			data.address,
			Math.round(Number(data.amount || 0) * 1000),
			data.message,
			signature,
			now,
			now,
		)

		try {
			await prisma.$executeRawUnsafe(`UPDATE reward_redemptions SET puzzle_id = ?, puzzle_address = ? WHERE id = ?`, payload.puzzleId || null, payload.puzzleAddress || null, id)
		} catch { }

		await client.del(key)

		return new Response(JSON.stringify({ success: true, requestId: id }), { status: 200, headers: { 'Content-Type': 'application/json' } })

	} catch (error) {
		console.error('Redeem confirm error:', error)
		return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
	}
}

export const POST = rateLimitMiddleware(handler)
