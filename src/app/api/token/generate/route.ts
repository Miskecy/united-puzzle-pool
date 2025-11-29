import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateRandomToken } from '@/lib/utils';
import { rateLimitMiddleware } from '@/lib/rate-limit';
import { isValidBitcoinAddress } from '@/lib/formatRange';

async function handler(req: NextRequest) {
	try {
		if (req.method !== 'POST') {
			return new Response(
				JSON.stringify({ error: 'Method not allowed' }),
				{ status: 405, headers: { 'Content-Type': 'application/json' } }
			);
		}

		const body = await req.json();
		const { bitcoinAddress } = body;

		if (!bitcoinAddress) {
			return new Response(
				JSON.stringify({ error: 'Bitcoin address is required' }),
				{ status: 400, headers: { 'Content-Type': 'application/json' } }
			);
		}

		if (!isValidBitcoinAddress(bitcoinAddress)) {
			return new Response(
				JSON.stringify({ error: 'Invalid Bitcoin address format' }),
				{ status: 400, headers: { 'Content-Type': 'application/json' } }
			);
		}

		// Generate random token
		const token = generateRandomToken(64);

		// Find existing user by bitcoinAddress; if exists, update token instead of creating a duplicate
		const existing = await prisma.userToken.findFirst({
			where: { bitcoinAddress },
			orderBy: { createdAt: 'desc' },
		});

		if (existing) {
			const updated = await prisma.userToken.update({
				where: { id: existing.id },
				data: { token },
			});

			return new Response(
				JSON.stringify({
					token: updated.token,
					bitcoinAddress: updated.bitcoinAddress,
					createdAt: updated.createdAt,
				}),
				{ status: 200, headers: { 'Content-Type': 'application/json' } }
			);
		}

		// No existing user found; create new user token
		const created = await prisma.userToken.create({
			data: { token, bitcoinAddress },
		});

		return new Response(
			JSON.stringify({
				token: created.token,
				bitcoinAddress: created.bitcoinAddress,
				createdAt: created.createdAt,
			}),
			{ status: 201, headers: { 'Content-Type': 'application/json' } }
		);

	} catch (error) {
		console.error('Token generation error:', error);
		return new Response(
			JSON.stringify({ error: 'Internal server error' }),
			{ status: 500, headers: { 'Content-Type': 'application/json' } }
		);
	}
}

export const POST = rateLimitMiddleware(handler);
