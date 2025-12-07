import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { rateLimitMiddleware } from '@/lib/rate-limit'
import { loadPuzzleConfig, parseHexBI } from '@/lib/config'
import { Prisma } from '@prisma/client'

async function handler(req: NextRequest) {
	try {
		if (req.method !== 'GET') {
			return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } })
		}
		const url = req.nextUrl
		const pageParam = Number(url.searchParams.get('page') || 1)
		const pageSizeParam = Number(url.searchParams.get('pageSize') || 50)
		const page = (isFinite(pageParam) && pageParam > 0) ? pageParam : 1
		const pageSize = (isFinite(pageSizeParam) && pageSizeParam > 0 && pageSizeParam <= 100) ? pageSizeParam : 50
		const skip = (page - 1) * pageSize

		let total = 0
		let items: Array<{ id: string; startRange: string; endRange: string; createdAt: Date; blockSolution?: { createdAt: Date } | null }> = []
		const cfg = await loadPuzzleConfig()
		try {
			;[total, items] = await Promise.all([
				prisma.blockAssignment.count({ where: { status: 'COMPLETED' } }),
				prisma.blockAssignment.findMany({
					where: { status: 'COMPLETED' },
					include: { blockSolution: { select: { createdAt: true } } },
					orderBy: { blockSolution: { createdAt: 'desc' } },
					skip,
					take: pageSize,
				}),
			])
		} catch (err: unknown) {
			const isKnown = err instanceof Prisma.PrismaClientKnownRequestError
			const code = isKnown ? err.code : ''
			const msg = isKnown ? err.message : String(err)
			const isEmptyDb = code === 'P2021' || msg.includes('does not exist') || msg.includes('no such table')
			if (!isEmptyDb) throw err
		}

		const pStart = parseHexBI(cfg?.startHex || null) ?? 0n
		const pEnd = parseHexBI(cfg?.endHex || null) ?? 0n
		const pSpan = pEnd > pStart ? (pEnd - pStart) : 0n
		const data = items.map(b => {
			let pos = 0
			try {
				const s = BigInt(b.startRange)
				if (pSpan > 0n) {
					const rel = s > pStart ? (s - pStart) : 0n
					const scaled = (rel * 10000n) / pSpan
					const pct = Number(scaled) / 100
					pos = Math.max(0, Math.min(100, pct))
				}
			} catch { }
			return {
				id: b.id,
				startRange: b.startRange,
				endRange: b.endRange,
				createdAt: b.createdAt,
				completedAt: b.blockSolution?.createdAt || null,
				positionPercent: pos,
			}
		})

		return new Response(JSON.stringify({ total, page, pageSize, items: data }), { status: 200, headers: { 'Content-Type': 'application/json' } })
	} catch {
		return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
	}
}

export const GET = rateLimitMiddleware(handler)
