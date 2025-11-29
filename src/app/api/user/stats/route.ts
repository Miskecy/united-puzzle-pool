import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { rateLimitMiddleware } from '@/lib/rate-limit';
import { formatCompactHexRange } from '@/lib/formatRange';
import { loadPuzzleConfig } from '@/lib/config';

function extractToken(req: NextRequest): string | null {
	// Try Authorization header first (Bearer token)
	const authHeader = req.headers.get('Authorization');
	if (authHeader && authHeader.startsWith('Bearer ')) {
		return authHeader.slice(7);
	}

	// Fallback to pool-token header
	return req.headers.get('pool-token');
}

async function handler(req: NextRequest) {
	try {
		if (req.method !== 'GET') {
			return new Response(
				JSON.stringify({ error: 'Method not allowed' }),
				{ status: 405, headers: { 'Content-Type': 'application/json' } }
			);
		}

		// Get token from headers
		const token = extractToken(req);
		if (!token) {
			return new Response(
				JSON.stringify({ error: 'Missing authentication token' }),
				{ status: 401, headers: { 'Content-Type': 'application/json' } }
			);
		}

		// Verify token exists
		const userToken = await prisma.userToken.findUnique({
			where: { token },
		});

		if (!userToken) {
			return new Response(
				JSON.stringify({ error: 'Invalid token' }),
				{ status: 401, headers: { 'Content-Type': 'application/json' } }
			);
		}

		// Get user statistics
		const [
			totalBlocks,
			completedBlocks,
			pendingBlocks,
			totalCredits,
			availableCredits,
			activeBlock,
			completedWithSolutions,
		] = await Promise.all([
			// Total blocks assigned
			prisma.blockAssignment.count({
				where: { userTokenId: userToken.id },
			}),

			// Completed blocks
			prisma.blockAssignment.count({
				where: {
					userTokenId: userToken.id,
					status: 'COMPLETED'
				},
			}),

			// Pending blocks
			prisma.blockAssignment.count({
				where: {
					userTokenId: userToken.id,
					status: 'ACTIVE'
				},
			}),

			// Total credits earned (sum of milésimos)
			prisma.creditTransaction.aggregate({
				where: {
					userTokenId: userToken.id,
					type: 'EARNED'
				},
				_sum: {
					amount: true
				},
			}),

			// Available credits (earned - spent) in milésimos
			prisma.creditTransaction.aggregate({
				where: { userTokenId: userToken.id },
				_sum: {
					amount: true
				},
			}),

			// Active block (if any)
			prisma.blockAssignment.findFirst({
				where: {
					userTokenId: userToken.id,
					status: 'ACTIVE'
				},
				orderBy: { createdAt: 'desc' }
			}),

			// Completed blocks with solution timestamps
			prisma.blockAssignment.findMany({
				where: { userTokenId: userToken.id, status: 'COMPLETED' },
				include: { blockSolution: { select: { createdAt: true } } },
			}),
		]);

		// Aggregate totals for keys validated and time spent
		let totalKeysValidatedBI = 0n;
		let totalTimeSpentSeconds = 0;
		for (const b of completedWithSolutions) {
			try {
				const start = BigInt(b.startRange);
				const end = BigInt(b.endRange);
				const size = end > start ? (end - start) : 0n;
				totalKeysValidatedBI += size;
				if (b.blockSolution?.createdAt) {
					const durMs = new Date(b.blockSolution.createdAt).getTime() - new Date(b.createdAt).getTime();
					if (durMs > 0) totalTimeSpentSeconds += Math.floor(durMs / 1000);
				}
			} catch { }
		}

		const cfg = await loadPuzzleConfig();
		const stats = {
			token: userToken.token,
			bitcoinAddress: userToken.bitcoinAddress,
			totalBlocks,
			completedBlocks,
			pendingBlocks,
			totalCredits: Number(totalCredits._sum.amount || 0),
			availableCredits: Number(availableCredits._sum.amount || 0),
			totalKeysValidated: totalKeysValidatedBI.toString(),
			totalTimeSpentSeconds,
            activeBlock: activeBlock ? {
                id: activeBlock.id,
                startRange: formatCompactHexRange(activeBlock.startRange),
                endRange: formatCompactHexRange(activeBlock.endRange),
                bitcoinAddress: activeBlock.puzzleAddressSnapshot || cfg?.address || userToken.bitcoinAddress,
                checkworkAddress: activeBlock.checkworkAddresses ? JSON.parse(activeBlock.checkworkAddresses)[0] : '',
                assignedAt: activeBlock.createdAt,
                expiresAt: new Date(activeBlock.createdAt.getTime() + 12 * 60 * 60 * 1000),
            } : null,
		};

		return new Response(
			JSON.stringify(stats),
			{ status: 200, headers: { 'Content-Type': 'application/json' } }
		);

	} catch (error) {
		console.error('User stats error:', error);
		return new Response(
			JSON.stringify({ error: 'Internal server error' }),
			{ status: 500, headers: { 'Content-Type': 'application/json' } }
		);
	}
}

export const GET = rateLimitMiddleware(handler);
