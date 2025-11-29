import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { rateLimitMiddleware } from '@/lib/rate-limit';
import { formatCompactHexRange } from '@/lib/formatRange';
import type { CreditTransaction } from '@prisma/client';

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

    // Pagination params
    const url = new URL(req.url);
    const pageSizeParam = Number(url.searchParams.get('pageSize')) || 50;
    const blocksPageParam = Number(url.searchParams.get('blocksPage')) || 1;
    const transactionsPageParam = Number(url.searchParams.get('transactionsPage')) || 1;
    const pageSize = Math.max(1, Math.min(200, pageSizeParam));
    const blocksPage = Math.max(1, blocksPageParam);
    const transactionsPage = Math.max(1, transactionsPageParam);

    // Totals for pagination
    const [blocksTotal, transactionsTotal] = await Promise.all([
      prisma.blockAssignment.count({ where: { userTokenId: userToken.id } }),
      prisma.creditTransaction.count({ where: { userTokenId: userToken.id } }),
    ]);

    // Get user's block history (paginated)
    const blockAssignments = await prisma.blockAssignment.findMany({
      where: { userTokenId: userToken.id },
      include: {
        blockSolution: true,
      },
      orderBy: { createdAt: 'desc' },
      skip: (blocksPage - 1) * pageSize,
      take: pageSize,
    });

    // Get user's credit transactions (paginated)
    const creditTransactions = await prisma.creditTransaction.findMany({
      where: { userTokenId: userToken.id },
      orderBy: { createdAt: 'desc' },
      skip: (transactionsPage - 1) * pageSize,
      take: pageSize,
    });

		interface BlockWithCompletedAt {
			completedAt?: Date | null;
		}

		interface HistoryTransaction {
			id: string;
			type: string;
			amount: number;
			description: string | null;
			createdAt: Date;
		}

    const history = {
      blocks: blockAssignments.map((block) => ({
        id: block.id,
        hexRangeStart: formatCompactHexRange(block.startRange),
        hexRangeEnd: formatCompactHexRange(block.endRange),
        checkworkAddresses: JSON.parse(block.checkworkAddresses),
        status: block.status,
        assignedAt: block.createdAt,
        completedAt: (block as BlockWithCompletedAt).completedAt || null,
        expiresAt: block.expiresAt,
        solution: block.blockSolution ? {
          id: block.blockSolution.id,
          creditsAwarded: Number(block.blockSolution.creditsAwarded || 0),
          createdAt: block.blockSolution.createdAt,
        } : null,
      })),
      transactions: creditTransactions.map((tx: CreditTransaction): HistoryTransaction => ({
        id: tx.id,
        type: tx.type,
        amount: Number(tx.amount || 0),
        description: tx.description || '',
        createdAt: tx.createdAt,
      })),
      blocksTotal,
      transactionsTotal,
      pageSize,
      blocksPage,
      transactionsPage,
    };

		return new Response(
			JSON.stringify(history),
			{ status: 200, headers: { 'Content-Type': 'application/json' } }
		);

	} catch (error) {
		console.error('User history error:', error instanceof Error ? error.message : String(error));
		return new Response(
			JSON.stringify({ error: 'Internal server error' }),
			{ status: 500, headers: { 'Content-Type': 'application/json' } }
		);
	}
}

export const GET = rateLimitMiddleware(handler);
