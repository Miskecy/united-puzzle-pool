import { NextRequest } from 'next/server'
import { rateLimitMiddleware } from '@/lib/rate-limit'
import { prisma } from '@/lib/prisma'
import { loadPuzzleConfig } from '@/lib/config'
import { Prisma } from '@prisma/client'

function getSecret(): string { return (process.env.SETUP_SECRET || '').trim() }
function unauthorized() { return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } }) }

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
	const secret = getSecret()
	if (!secret) return new Response(JSON.stringify({ error: 'Setup disabled' }), { status: 404, headers: { 'Content-Type': 'application/json' } })
	const supplied = req.headers.get('x-setup-secret') || ''
	const cookie = req.headers.get('cookie') || ''
	const hasSession = /(?:^|;\s*)setup_session=1(?:;|$)/.test(cookie)
	if (!hasSession && supplied !== secret) return unauthorized()

	try {
		if (req.method !== 'GET') {
			return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } })
		}

		await ensureRedeemTable()
		try { await prisma.$executeRawUnsafe(`ALTER TABLE reward_redemptions ADD COLUMN puzzle_id TEXT`) } catch { }
		try { await prisma.$executeRawUnsafe(`ALTER TABLE reward_redemptions ADD COLUMN puzzle_address TEXT`) } catch { }
		try { await prisma.$executeRawUnsafe(`ALTER TABLE reward_redemptions ADD COLUMN paid_at DATETIME`) } catch { }
		try { await prisma.$executeRawUnsafe(`ALTER TABLE reward_redemptions ADD COLUMN canceled_at DATETIME`) } catch { }

		let balanceBtc = 0
		let usdPrice = 0
		try {
			const cfg = await loadPuzzleConfig()
			const address = cfg?.address || ''
			if (address) {
				try {
					const r = await fetch(`https://blockstream.info/api/address/${address}`, { cache: 'no-store' })
					if (r.ok) {
						const j = await r.json()
						const funded = Number((j.chain_stats?.funded_txo_sum ?? 0) + (j.mempool_stats?.funded_txo_sum ?? 0))
						const spent = Number((j.chain_stats?.spent_txo_sum ?? 0) + (j.mempool_stats?.spent_txo_sum ?? 0))
						const sats = Math.max(0, funded - spent)
						balanceBtc = sats / 1e8
					}
				} catch { }
			}
			try {
				const p = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd', { cache: 'no-store' })
				if (p.ok) {
					const pj = await p.json()
					usdPrice = Number(pj.bitcoin?.usd ?? 0)
				}
			} catch { }
			if (!usdPrice || !isFinite(usdPrice)) {
				try {
					const p2 = await fetch('https://api.coinbase.com/v2/prices/spot?currency=USD', { cache: 'no-store' })
					if (p2.ok) {
						const pj2 = await p2.json()
						usdPrice = Number(pj2?.data?.amount ?? 0)
					}
				} catch { }
			}
			if (!usdPrice || !isFinite(usdPrice)) {
				try {
					const p3 = await fetch('https://api.coindesk.com/v1/bpi/currentprice.json', { cache: 'no-store' })
					if (p3.ok) {
						const pj3 = await p3.json()
						usdPrice = Number(pj3?.bpi?.USD?.rate_float ?? 0)
					}
				} catch { }
			}
		} catch { }

		const url = new URL(req.url)
		const statusFilter = String(url.searchParams.get('status') || '').toUpperCase()
		const puzzleFilter = String(url.searchParams.get('puzzleAddress') || '')

		type Row = { id: string, user_token_id: string, address: string, amount: number, status: string, created_at?: string, updated_at?: string, approved_at?: string, puzzle_address?: string | null }
		const where: string[] = []
		const params: unknown[] = []
		if (statusFilter && ['PENDING', 'APPROVED', 'DENIED', 'PAID', 'CANCELED'].includes(statusFilter)) { where.push(`status = ?`); params.push(statusFilter) }
		if (puzzleFilter) { where.push(`puzzle_address = ?`); params.push(puzzleFilter) }
		const sql = `SELECT id, user_token_id, address, amount, status, created_at, updated_at, approved_at, puzzle_address FROM reward_redemptions ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC LIMIT 200`
		let rows: Row[] = []
		try {
			rows = await prisma.$queryRawUnsafe<Row[]>(sql, ...params)
		} catch (err: unknown) {
			const isKnown = err instanceof Prisma.PrismaClientKnownRequestError
			const code = isKnown ? err.code : ''
			const msg = isKnown ? err.message : String(err)
			const isEmptyDb = code === 'P2021' || msg.includes('does not exist') || msg.includes('no such table')
			if (!isEmptyDb) throw err
		}

		// Fetch BTC balance per puzzle address to compute per-row estimated BTC
		const uniqueAddrs = Array.from(new Set(rows.map(r => String(r.puzzle_address || '')).filter(a => !!a)))
		const addrBalanceBtc: Record<string, number> = {}
		for (const a of uniqueAddrs) {
			try {
				const r = await fetch(`https://blockstream.info/api/address/${a}`, { cache: 'no-store' })
				if (r.ok) {
					const j = await r.json()
					const funded = Number((j.chain_stats?.funded_txo_sum ?? 0) + (j.mempool_stats?.funded_txo_sum ?? 0))
					const spent = Number((j.chain_stats?.spent_txo_sum ?? 0) + (j.mempool_stats?.spent_txo_sum ?? 0))
					const sats = Math.max(0, funded - spent)
					addrBalanceBtc[a] = sats / 1e8
				}
			} catch { }
		}

		let byUser: Array<{ userTokenId: string; _sum: { amount: number | null } }> = []
		try {
			const rowsAgg = await prisma.$queryRawUnsafe<{ userTokenId: string, amount: number | null }[]>(
				`SELECT user_token_id as userTokenId, SUM(amount) as amount FROM credit_transactions GROUP BY user_token_id`
			)
			byUser = (rowsAgg || []).map(r => ({ userTokenId: String(r.userTokenId || ''), _sum: { amount: r.amount } }))
		} catch (err: unknown) {
			const isKnown = err instanceof Prisma.PrismaClientKnownRequestError
			const code = isKnown ? err.code : ''
			const msg = isKnown ? err.message : String(err)
			const isEmptyDb = code === 'P2021' || msg.includes('does not exist') || msg.includes('no such table')
			if (!isEmptyDb) throw err
		}
		let totalMu = 0
		const map: Record<string, number> = {}
		for (const g of byUser) {
			const sum = Number(g._sum.amount || 0)
			const v = sum > 0 ? sum : 0
			totalMu += v
			map[g.userTokenId] = v
		}

		const poolShareBtc = balanceBtc * 0.25
		const poolShareByAddr: Record<string, number> = {}
		for (const a of uniqueAddrs) { poolShareByAddr[a] = (addrBalanceBtc[a] || 0) * 0.25 }
		const items = rows.map(r => ({
			id: String(r.id),
			userTokenId: String(r.user_token_id),
			address: String(r.address),
			puzzleAddress: r.puzzle_address ? String(r.puzzle_address) : '',
			amount: (() => { const a = Number(r.amount || 0); return a >= 1_000_000 ? (a / 1_000_000) : (a / 1_000) })(),
			status: String(r.status || 'PENDING'),
			createdAt: r.created_at ? new Date(r.created_at) : null,
			updatedAt: r.updated_at ? new Date(r.updated_at) : null,
			approvedAt: r.approved_at ? new Date(r.approved_at) : null,
			sharePercent: totalMu > 0 ? ((map[String(r.user_token_id)] || 0) / totalMu) * 100 : 0,
			estimatedBtc: (() => {
				const addr = r.puzzle_address ? String(r.puzzle_address) : ''
				const ps = addr ? (poolShareByAddr[addr] || 0) : poolShareBtc
				return ps > 0 && totalMu > 0 ? ps * (((map[String(r.user_token_id)] || 0) / totalMu)) : 0
			})(),
			estimatedUsd: (() => {
				const addr = r.puzzle_address ? String(r.puzzle_address) : ''
				const ps = addr ? (poolShareByAddr[addr] || 0) : poolShareBtc
				return usdPrice && isFinite(usdPrice) ? ((ps > 0 && totalMu > 0 ? ps * (((map[String(r.user_token_id)] || 0) / totalMu)) : 0) * usdPrice) : 0
			})(),
		}))

		return new Response(JSON.stringify({ items }), { status: 200, headers: { 'Content-Type': 'application/json' } })
	} catch (error) {
		console.error('Admin redeem list error:', error)
		return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
	}
}

export const GET = rateLimitMiddleware(handler)
