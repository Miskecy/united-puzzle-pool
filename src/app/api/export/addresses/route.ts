import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createRateLimiter } from '@/lib/rate-limit';

// 20 requests per hour max — new app syncs once/hour, leaves headroom for retries
const exportRateLimit = createRateLimiter(20, 60 * 60 * 1000);

function verifyApiKey(authHeader: string | null): boolean {
	const secret = process.env.EXPORT_API_KEY;
	if (!secret || !authHeader) return false;

	const prefix = 'Bearer ';
	if (!authHeader.startsWith(prefix)) return false;
	const provided = authHeader.slice(prefix.length).trim();

	// Hash both sides to a fixed-length digest before comparing.
	// This prevents timing leaks from length differences and allows
	// timingSafeEqual (which requires equal-length buffers) to work safely.
	const hashProvided = crypto.createHash('sha256').update(provided).digest();
	const hashExpected = crypto.createHash('sha256').update(secret).digest();

	return crypto.timingSafeEqual(hashProvided, hashExpected);
}

async function handler(req: NextRequest) {
	if (req.method !== 'GET') {
		return new Response(JSON.stringify({ error: 'Method not allowed' }), {
			status: 405,
			headers: { 'Content-Type': 'application/json' },
		});
	}

	if (!verifyApiKey(req.headers.get('authorization'))) {
		// Always wait a fixed time on auth failure to slow brute-force attempts
		await new Promise((r) => setTimeout(r, 300 + Math.random() * 200));
		return new Response(JSON.stringify({ error: 'Unauthorized' }), {
			status: 401,
			headers: { 'Content-Type': 'application/json' },
		});
	}

	if (!process.env.EXPORT_API_KEY) {
		return new Response(JSON.stringify({ error: 'Export not configured on this server' }), {
			status: 503,
			headers: { 'Content-Type': 'application/json' },
		});
	}

	try {
		// Join block_solutions → block_assignments to pair private keys with addresses
		const solutions = await prisma.blockSolution.findMany({
			select: {
				privateKeys: true,
				blockAssignment: {
					select: { checkworkAddresses: true },
				},
			},
		});

		const pairs: { address: string; privateKey: string }[] = [];

		for (const sol of solutions) {
			let addresses: string[] = [];
			let keys: string[] = [];

			try {
				addresses = JSON.parse(sol.blockAssignment.checkworkAddresses);
			} catch { continue; }

			try {
				keys = JSON.parse(sol.privateKeys);
			} catch { continue; }

			for (let i = 0; i < addresses.length; i++) {
				const addr = addresses[i];
				const key = keys[i];
				if (addr && key) pairs.push({ address: addr, privateKey: key });
			}
		}

		return new Response(
			JSON.stringify({ addresses: pairs, count: pairs.length, exportedAt: new Date().toISOString() }),
			{ status: 200, headers: { 'Content-Type': 'application/json' } }
		);
	} catch (error) {
		console.error('Export error:', error);
		return new Response(JSON.stringify({ error: 'Internal server error' }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' },
		});
	}
}

export const GET = exportRateLimit(handler);
