import { NextRequest } from 'next/server'
import { rateLimitMiddleware } from '@/lib/rate-limit'
import { loadPuzzleConfig } from '@/lib/config'
import { prisma } from '@/lib/prisma'

async function handler(req: NextRequest) {
	try {
		if (req.method !== 'GET') {
			return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } })
		}

		const cfg = await loadPuzzleConfig()
		const address = cfg?.address || ''
		if (!address) {
			return new Response(JSON.stringify({ error: 'Puzzle configuration missing' }), { status: 404, headers: { 'Content-Type': 'application/json' } })
		}

		let txCount = 0
		let balanceBtc = 0
		let balanceUsd = 0
		let balanceKnown = false

		try {
			const r = await fetch(`https://blockstream.info/api/address/${address}`, { cache: 'no-store' })
			if (r.ok) {
				const j = await r.json()
				const funded = Number((j.chain_stats?.funded_txo_sum ?? 0) + (j.mempool_stats?.funded_txo_sum ?? 0))
				const spent = Number((j.chain_stats?.spent_txo_sum ?? 0) + (j.mempool_stats?.spent_txo_sum ?? 0))
				const sats = Math.max(0, funded - spent)
				balanceBtc = sats / 1e8
				txCount = Number(j.chain_stats?.tx_count ?? 0)
				balanceKnown = true
			}
		} catch { }

		let usdPrice = 0
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
		if (!usdPrice || !isFinite(usdPrice)) {
			try {
				const p4 = await fetch('https://blockchain.info/ticker', { cache: 'no-store' })
				if (p4.ok) {
					const pj4 = await p4.json()
					usdPrice = Number(pj4?.USD?.last ?? 0)
				}
			} catch { }
		}
		if (usdPrice && isFinite(usdPrice) && balanceKnown) {
			balanceUsd = balanceBtc * usdPrice
		}

		try {
			if (balanceKnown && balanceBtc < 1 && cfg?.id && !cfg.solved) {
				await prisma.puzzleConfig.update({ where: { id: cfg.id }, data: { solved: true } })
			}
		} catch { }

		const puzzleDetected = !!(cfg?.privateKey && String(cfg.privateKey).trim())
		const data = { address, txCount, balanceBtc, balanceUsd, puzzleDetected }
		return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } })
	} catch {
		return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
	}
}

export const GET = rateLimitMiddleware(handler)
