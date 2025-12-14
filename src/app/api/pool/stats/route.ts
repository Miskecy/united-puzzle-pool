import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { rateLimitMiddleware } from '@/lib/rate-limit';
import { formatCompactHexRange } from '@/lib/formatRange';
import { Prisma } from '@prisma/client';

type TopContributor = { userTokenId: string | null; _sum: { amount: number | null } };
type RecentBlock = {
	id: string;
	puzzleAddressSnapshot?: string | null;
	userToken: { bitcoinAddress: string };
	puzzleNameSnapshot?: string | null;
	startRange: string;
	endRange: string;
	createdAt: Date;
	blockSolution?: { creditsAwarded: number | null; createdAt: Date } | null;
};
type ActiveBlock = {
	id: string;
	puzzleAddressSnapshot?: string | null;
	userToken: { bitcoinAddress: string };
	puzzleNameSnapshot?: string | null;
	startRange: string;
	endRange: string;
	createdAt: Date;
	expiresAt: Date;
};

async function handler(req: NextRequest) {
	try {
		if (req.method !== 'GET') {
			return new Response(
				JSON.stringify({ error: 'Method not allowed' }),
				{ status: 405, headers: { 'Content-Type': 'application/json' } }
			);
		}

		// Get pool statistics
		const url = req.nextUrl
		const takeParam = Number(url.searchParams.get('take') || 0)
		const skipParam = Number(url.searchParams.get('skip') || 0)
		const daysParam = Number(url.searchParams.get('days') || 0)
		const take = (isFinite(takeParam) && takeParam > 0 && takeParam <= 100) ? takeParam : 20
		const skip = (isFinite(skipParam) && skipParam >= 0) ? skipParam : 0
		const days = (isFinite(daysParam) && daysParam > 0 && daysParam <= 30) ? daysParam : 0
		const thresholdDate = days > 0 ? new Date(Date.now() - days * 24 * 60 * 60 * 1000) : null
		let totalTokens = 0
		let totalBlocks = 0
		let completedBlocks = 0
		let pendingBlocks = 0
		let expiredBlocks = 0
		let totalCreditsAwarded: { _sum: { amount: number | null } } = { _sum: { amount: 0 } }
		let recentBlocks: RecentBlock[] = []
		let activeBlocks: ActiveBlock[] = []
		let topContributors: TopContributor[] = []
		let userTokens7d: Array<{ userTokenId: string | null }> = []
		let sharedTokens7d: Array<{ sharedPoolTokenId: string | null }> = []

		try {
			;[
				totalTokens,
				totalBlocks,
				completedBlocks,
				pendingBlocks,
				expiredBlocks,
				totalCreditsAwarded,
				recentBlocks,
				activeBlocks,
				topContributors,
				userTokens7d,
				sharedTokens7d,
			] = await Promise.all([
				prisma.userToken.count(),
				prisma.blockAssignment.count(),
				prisma.blockAssignment.count({
					where: days > 0 ? {
						status: 'COMPLETED',
						blockSolution: { is: { createdAt: { gte: thresholdDate! } } },
					} : { status: 'COMPLETED' }
				}),
				prisma.blockAssignment.count({ where: { status: 'ACTIVE' } }),
				prisma.blockAssignment.count({ where: { status: 'EXPIRED' } }),
				prisma.creditTransaction.aggregate({ where: { type: 'EARNED' }, _sum: { amount: true } }),
				prisma.blockAssignment.findMany({
					where: days > 0 ? {
						status: 'COMPLETED',
						blockSolution: { is: { createdAt: { gte: thresholdDate! } } },
					} : { status: 'COMPLETED' },
					include: { userToken: { select: { bitcoinAddress: true } }, blockSolution: { select: { creditsAwarded: true, createdAt: true } } },
					orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
					skip: days > 0 ? 0 : skip,
					take: days > 0 ? 5000 : take,
				}),
				prisma.blockAssignment.findMany({
					where: { status: 'ACTIVE' },
					include: { userToken: { select: { bitcoinAddress: true } } },
					orderBy: { createdAt: 'desc' },
					take: take,
				}),
				prisma.creditTransaction.groupBy({
					by: ['userTokenId'],
					where: { type: 'EARNED' },
					_sum: { amount: true },
					orderBy: { _sum: { amount: 'desc' } },
					take: 10,
				}),
				prisma.blockAssignment.findMany({
					where: days > 0 ? { OR: [{ updatedAt: { gte: thresholdDate! } }, { createdAt: { gte: thresholdDate! } }] } : { OR: [{ updatedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } }, { createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } }] },
					select: { userTokenId: true },
					distinct: ['userTokenId'],
				}),
				prisma.blockAssignment.findMany({
					where: days > 0 ? { NOT: { sharedPoolTokenId: null }, OR: [{ updatedAt: { gte: thresholdDate! } }, { createdAt: { gte: thresholdDate! } }] } : { NOT: { sharedPoolTokenId: null }, OR: [{ updatedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } }, { createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } }] },
					select: { sharedPoolTokenId: true },
					distinct: ['sharedPoolTokenId'],
				}),
			])
		} catch (err: unknown) {
			const isKnown = err instanceof Prisma.PrismaClientKnownRequestError
			const code = isKnown ? err.code : ''
			const msg = isKnown ? err.message : String(err)
			const isEmptyDb = code === 'P2021' || msg.includes('does not exist')
			if (!isEmptyDb) throw err
		}

		// Get token details for top contributors
		const topContributorsWithDetails = await Promise.all(
			topContributors.map(async (contributor) => {
				const token = await prisma.userToken.findUnique({
					where: { id: contributor.userTokenId ?? undefined },
					select: { bitcoinAddress: true }
				});

				return {
					bitcoinAddress: token?.bitcoinAddress || 'Unknown',
					totalCredits: Number(contributor._sum.amount || 0) / 1000,
				};
			})
		);

		const minerSet = new Set<string>();
		for (const u of userTokens7d) {
			if (u.userTokenId) minerSet.add(`u:${u.userTokenId}`);
		}
		for (const s of sharedTokens7d) {
			if (s.sharedPoolTokenId) minerSet.add(`s:${s.sharedPoolTokenId}`);
		}

		const stats = {
			overview: {
				totalTokens,
				totalBlocks,
				completedBlocks,
				pendingBlocks,
				expiredBlocks,
				completionRate: totalBlocks > 0 ? Math.round((completedBlocks / totalBlocks) * 100) : 0,
				totalCreditsAwarded: Number(totalCreditsAwarded._sum.amount || 0) / 1000,
				activeMiners: minerSet.size,
			},
            recentBlocks: recentBlocks.map((block) => ({
                id: block.id,
                bitcoinAddress: block.userToken.bitcoinAddress,
                puzzleAddress: block.puzzleAddressSnapshot || null,
                puzzleName: block.puzzleNameSnapshot || null,
                hexRangeStart: formatCompactHexRange(block.startRange),
                hexRangeEnd: formatCompactHexRange(block.endRange),
                hexRangeStartRaw: block.startRange,
                hexRangeEndRaw: block.endRange,
                createdAt: block.createdAt,
                completedAt: block.blockSolution?.createdAt || null,
                creditsAwarded: (Number(block.blockSolution?.creditsAwarded || 0) / 1000),
            })),
            activeBlocks: activeBlocks.map((block) => ({
                id: block.id,
                bitcoinAddress: block.userToken.bitcoinAddress,
                puzzleAddress: block.puzzleAddressSnapshot || null,
                puzzleName: block.puzzleNameSnapshot || null,
                hexRangeStart: formatCompactHexRange(block.startRange),
                hexRangeEnd: formatCompactHexRange(block.endRange),
                hexRangeStartRaw: block.startRange,
                hexRangeEndRaw: block.endRange,
                createdAt: block.createdAt,
                expiresAt: block.expiresAt,
                completedAt: null,
                creditsAwarded: 0,
            })),
			topContributors: topContributorsWithDetails,
		};

		return new Response(
			JSON.stringify(stats),
			{ status: 200, headers: { 'Content-Type': 'application/json' } }
		);

	} catch (error) {
		console.error('Pool stats error:', error);
		return new Response(
			JSON.stringify({ error: 'Internal server error' }),
			{ status: 500, headers: { 'Content-Type': 'application/json' } }
		);
	}
}

export const GET = rateLimitMiddleware(handler);
