import { NextRequest } from 'next/server'
import { rateLimitMiddleware } from '@/lib/rate-limit'
import { loadPuzzleConfig } from '@/lib/config'
import { prisma } from '@/lib/prisma'
import { getRedisClient } from '@/lib/redis'

function extractToken(req: NextRequest): string | null {
	const authHeader = req.headers.get('Authorization')
	if (authHeader && authHeader.startsWith('Bearer ')) return authHeader.slice(7)
	return req.headers.get('pool-token')
}

function cryptoRandom(len: number): string {
	const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
	let out = ''
	for (let i = 0; i < len; i++) out += chars.charAt(Math.floor(Math.random() * chars.length))
	return out
}

async function handler(req: NextRequest) {
	try {
		if (req.method !== 'POST') {
			return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } })
		}

		const token = extractToken(req)
		if (!token) return new Response(JSON.stringify({ error: 'Missing authentication token' }), { status: 401, headers: { 'Content-Type': 'application/json' } })

		const userToken = await prisma.userToken.findUnique({ where: { token } })
		if (!userToken) return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401, headers: { 'Content-Type': 'application/json' } })

		// Optional: allow selecting a specific solved puzzle by id
		const bodyInit = await req.json().catch(() => ({})) as { amount?: number, puzzleId?: string }
		let cfg = await loadPuzzleConfig()
		if (bodyInit?.puzzleId) {
			try {
				const pz = await prisma.puzzleConfig.findUnique({ where: { id: String(bodyInit.puzzleId) } })
				if (pz) {
					cfg = {
						id: pz.id,
						name: pz.name || null,
						address: pz.puzzleAddress,
						startHex: pz.puzzleStartRange,
						endHex: pz.puzzleEndRange,
						solved: (pz as unknown as { solved?: boolean }).solved ?? false,
						active: pz.active,
						privateKey: (pz as unknown as { puzzlePrivateKey?: string | null }).puzzlePrivateKey ?? null,
					}
				}
			} catch { }
		}
		if (!cfg || !cfg.solved || !cfg.privateKey) {
			return new Response(JSON.stringify({ error: 'Selected puzzle not available for redemption' }), { status: 409, headers: { 'Content-Type': 'application/json' } })
		}

		await ensureRedeemTable()
		await ensureRedeemColumns()
		try {
			const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(`SELECT id FROM reward_redemptions WHERE user_token_id = ? AND status = 'PENDING' LIMIT 1`, userToken.id)
			if (rows && rows[0]) {
				return new Response(JSON.stringify({ error: 'You already have an active redemption request pending review' }), { status: 409, headers: { 'Content-Type': 'application/json' } })
			}
		} catch { }

		const body = bodyInit
		const availableAgg = await prisma.creditTransaction.aggregate({ where: { userTokenId: userToken.id }, _sum: { amount: true } })
		const available = Math.max(0, Number(availableAgg._sum.amount || 0)) / 1000
		if (!isFinite(available) || available <= 0) {
			return new Response(JSON.stringify({ error: 'No available credits to redeem' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
		}

		const requestedRaw = body?.amount !== undefined ? Number(body.amount) : available
		if (!isFinite(requestedRaw) || requestedRaw <= 0) {
			return new Response(JSON.stringify({ error: 'Invalid amount' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
		}
		if (requestedRaw > available) {
			return new Response(JSON.stringify({ error: 'Amount exceeds available credits' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
		}
		const requested = Math.floor(requestedRaw * 1000) / 1000

		const nonce = cryptoRandom(24)
		const ts = new Date().toISOString()
		const message = [
			'United Puzzle Pool Reward Redemption',
			`Token: ${userToken.token}`,
			`Address: ${userToken.bitcoinAddress}`,
			`Amount: ${requested.toFixed(3)}`,
			`Nonce: ${nonce}`,
			`Timestamp: ${ts}`,
		].join('\n')

		const client = await getRedisClient()
		const key = `redeem:${token}:${nonce}`
		const value = JSON.stringify({ token, userTokenId: userToken.id, address: userToken.bitcoinAddress, amount: requested, message, createdAt: ts, puzzleId: cfg.id || null, puzzleAddress: cfg.address })
		await client.setEx(key, 15 * 60, value)

		return new Response(JSON.stringify({ message, nonce, amount: requested, address: userToken.bitcoinAddress }), { status: 200, headers: { 'Content-Type': 'application/json' } })

	} catch (error) {
		console.error('Redeem init error:', error)
		return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
	}
}

export const POST = rateLimitMiddleware(handler)
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

async function ensureRedeemColumns() {
	try {
		const rows = await prisma.$queryRawUnsafe<{ name: string }[]>(`PRAGMA table_info('reward_redemptions')`)
		const cols = new Set((rows || []).map(r => String(r.name)))
		if (!cols.has('puzzle_id')) { await prisma.$executeRawUnsafe(`ALTER TABLE reward_redemptions ADD COLUMN puzzle_id TEXT`) }
		if (!cols.has('puzzle_address')) { await prisma.$executeRawUnsafe(`ALTER TABLE reward_redemptions ADD COLUMN puzzle_address TEXT`) }
		if (!cols.has('paid_at')) { await prisma.$executeRawUnsafe(`ALTER TABLE reward_redemptions ADD COLUMN paid_at DATETIME`) }
		if (!cols.has('canceled_at')) { await prisma.$executeRawUnsafe(`ALTER TABLE reward_redemptions ADD COLUMN canceled_at DATETIME`) }
	} catch { }
}
