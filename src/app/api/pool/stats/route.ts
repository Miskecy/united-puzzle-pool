import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { rateLimitMiddleware } from '@/lib/rate-limit';
import { formatCompactHexRange } from '@/lib/formatRange';

async function handler(req: NextRequest) {
	try {
		if (req.method !== 'GET') {
			return new Response(
				JSON.stringify({ error: 'Method not allowed' }),
				{ status: 405, headers: { 'Content-Type': 'application/json' } }
			);
		}

		// Get pool statistics
		const [
			totalTokens,
			totalBlocks,
			completedBlocks,
			pendingBlocks,
			expiredBlocks,
			totalCreditsAwarded,
			recentBlocks,
			topContributors,
		] = await Promise.all([
			// Total tokens
			prisma.userToken.count(),

			// Total blocks
			prisma.blockAssignment.count(),

			// Completed blocks
			prisma.blockAssignment.count({
				where: { status: 'COMPLETED' }
			}),

			// Pending blocks
			prisma.blockAssignment.count({
				where: { status: 'ACTIVE' }
			}),

			// Expired blocks
			prisma.blockAssignment.count({
				where: { status: 'EXPIRED' }
			}),

			// Total credits awarded
			prisma.creditTransaction.aggregate({
				where: { type: 'EARNED' },
				_sum: {
					amount: true
				},
			}),

			// Recent completed blocks (last 20)
			prisma.blockAssignment.findMany({
				where: { status: 'COMPLETED' },
				include: {
					userToken: {
						select: {
							bitcoinAddress: true,
						}
					},
					blockSolution: {
						select: {
							creditsAwarded: true,
							createdAt: true,
						},
					},
				},
				orderBy: { createdAt: 'desc' },
				take: 20,
			}),

			// Top contributors by credits earned
			prisma.creditTransaction.groupBy({
				by: ['userTokenId'],
				where: { type: 'EARNED' },
				_sum: {
					amount: true
				},
				orderBy: {
					_sum: {
						amount: 'desc'
					}
				},
				take: 10
			}),
		]);

		// Get token details for top contributors
		const topContributorsWithDetails = await Promise.all(
			topContributors.map(async (contributor) => {
				const token = await prisma.userToken.findUnique({
					where: { id: contributor.userTokenId },
					select: { bitcoinAddress: true }
				});

				return {
					bitcoinAddress: token?.bitcoinAddress || 'Unknown',
					totalCredits: Number(contributor._sum.amount || 0),
				};
			})
		);

		const stats = {
			overview: {
				totalTokens,
				totalBlocks,
				completedBlocks,
				pendingBlocks,
				expiredBlocks,
				completionRate: totalBlocks > 0 ? Math.round((completedBlocks / totalBlocks) * 100) : 0,
				totalCreditsAwarded: Number(totalCreditsAwarded._sum.amount || 0),
			},
			recentBlocks: recentBlocks.map((block) => ({
				id: block.id,
				bitcoinAddress: block.puzzleAddressSnapshot || block.userToken.bitcoinAddress,
				puzzleAddress: block.puzzleAddressSnapshot || block.userToken.bitcoinAddress,
				puzzleName: block.puzzleNameSnapshot || null,
				hexRangeStart: formatCompactHexRange(block.startRange),
				hexRangeEnd: formatCompactHexRange(block.endRange),
				hexRangeStartRaw: block.startRange,
				hexRangeEndRaw: block.endRange,
				createdAt: block.createdAt,
				completedAt: block.blockSolution?.createdAt || null,
				creditsAwarded: block.blockSolution?.creditsAwarded || 0,
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
