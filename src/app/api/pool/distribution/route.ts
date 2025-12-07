import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { rateLimitMiddleware } from '@/lib/rate-limit'
import { loadPuzzleConfig } from '@/lib/config'

function extractToken(req: NextRequest): string | null {
	const authHeader = req.headers.get('Authorization')
	if (authHeader && authHeader.startsWith('Bearer ')) return authHeader.slice(7)
	return req.headers.get('pool-token')
}

async function getPuzzleBalanceBtc(address: string): Promise<number> {
	let balanceBtc = 0
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
	return balanceBtc
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

		const cfg = await loadPuzzleConfig()
		if (!cfg || !cfg.address) {
			return new Response(JSON.stringify({ error: 'Puzzle configuration missing' }), { status: 404, headers: { 'Content-Type': 'application/json' } })
		}

		const balanceBtc = await getPuzzleBalanceBtc(cfg.address)
		const poolShareBtc = balanceBtc * 0.25

		const byUser = await prisma.creditTransaction.groupBy({ by: ['userTokenId'], _sum: { amount: true } })
		let totalMu = 0
		let userMu = 0
		for (const g of byUser) {
			const sum = Number(g._sum.amount || 0)
			const v = sum > 0 ? sum : 0
			totalMu += v
			if (g.userTokenId === userToken.id) userMu = v
		}

		const userSharePercent = totalMu > 0 ? (userMu / totalMu) * 100 : 0
		const expectedRewardBtc = totalMu > 0 ? poolShareBtc * (userMu / totalMu) : 0

		return new Response(JSON.stringify({
			balanceBtc,
			poolShareBtc,
			totalAvailableCredits: totalMu / 1000,
			userAvailableCredits: userMu / 1000,
			userSharePercent,
			expectedRewardBtc,
		}), { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

	} catch (error) {
		console.error('Pool distribution error:', error)
		return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
	}
}

export const GET = rateLimitMiddleware(handler)

