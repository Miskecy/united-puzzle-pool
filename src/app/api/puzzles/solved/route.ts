import { NextRequest } from 'next/server'
import { rateLimitMiddleware } from '@/lib/rate-limit'
import { prisma } from '@/lib/prisma'

async function handler(req: NextRequest) {
	try {
		if (req.method !== 'GET') {
			return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } })
		}

		const items = await prisma.puzzleConfig.findMany({
			where: { solved: true, puzzlePrivateKey: { not: null } },
			orderBy: { createdAt: 'desc' },
			select: { id: true, name: true, puzzleAddress: true, active: true }
		})
		const data: { id: string, name: string | null, address: string, active: boolean, balanceBtc: number, poolShareBtc: number }[] = []
		for (const i of items) {
			let balanceBtc = 0
			try {
				const r = await fetch(`https://blockstream.info/api/address/${i.puzzleAddress}`, { cache: 'no-store' })
				if (r.ok) {
					const j = await r.json()
					const funded = Number((j.chain_stats?.funded_txo_sum ?? 0) + (j.mempool_stats?.funded_txo_sum ?? 0))
					const spent = Number((j.chain_stats?.spent_txo_sum ?? 0) + (j.mempool_stats?.spent_txo_sum ?? 0))
					const sats = Math.max(0, funded - spent)
					balanceBtc = sats / 1e8
				}
			} catch { }
			const poolShareBtc = balanceBtc * 0.25
			if (balanceBtc >= 0.00001) {
				data.push({ id: i.id, name: i.name || null, address: i.puzzleAddress, active: i.active, balanceBtc, poolShareBtc })
			}
		}
		return new Response(JSON.stringify({ items: data }), { status: 200, headers: { 'Content-Type': 'application/json' } })
	} catch (error) {
		console.error('Solved puzzles list error:', error)
		return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
	}
}

export const GET = rateLimitMiddleware(handler)
