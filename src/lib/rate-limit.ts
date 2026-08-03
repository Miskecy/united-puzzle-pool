import { NextRequest } from 'next/server';

interface RateLimitEntry {
	count: number;
	resetTime: number;
}

const globalStore = new Map<string, RateLimitEntry>();

const DEFAULT_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000');
const DEFAULT_MAX = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '60');

function cleanExpiredEntries(store: Map<string, RateLimitEntry>) {
	const now = Date.now();
	for (const [key, entry] of store.entries()) {
		if (now > entry.resetTime) store.delete(key);
	}
}

function getClientIp(req: Request): string {
	const realIp = req.headers.get('x-real-ip');
	if (realIp) return realIp.trim();
	const forwarded = req.headers.get('x-forwarded-for');
	if (forwarded) {
		// Use the rightmost IP — the one appended by the trusted proxy, not the client
		const parts = forwarded.split(',');
		return parts[parts.length - 1].trim();
	}
	return '127.0.0.1';
}

function buildMiddleware(store: Map<string, RateLimitEntry>, maxRequests: number, windowMs: number) {
	return function rateLimitMiddleware(
		handler: (req: NextRequest) => Promise<Response>
	): (req: NextRequest) => Promise<Response> {
		return async (req: NextRequest) => {
			try {
				const clientIp = getClientIp(req);
				const now = Date.now();

				if (Math.random() < 0.01) cleanExpiredEntries(store);

				let entry = store.get(clientIp);
				if (!entry || now > entry.resetTime) {
					entry = { count: 1, resetTime: now + windowMs };
					store.set(clientIp, entry);
				} else {
					entry.count++;
				}

				if (entry.count > maxRequests) {
					const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
					return new Response(
						JSON.stringify({ error: 'Rate limit exceeded', retryAfter }),
						{
							status: 429,
							headers: {
								'Content-Type': 'application/json',
								'Retry-After': retryAfter.toString(),
							},
						}
					);
				}

				const response = await handler(req);
				const newResponse = new Response(response.body, response);
				newResponse.headers.set('X-RateLimit-Limit', maxRequests.toString());
				newResponse.headers.set('X-RateLimit-Remaining', (maxRequests - entry.count).toString());
				newResponse.headers.set('X-RateLimit-Reset', new Date(entry.resetTime).toISOString());
				return newResponse;
			} catch (error) {
				console.error('Rate limit middleware error:', error);
				return new Response(
					JSON.stringify({ error: 'Internal server error' }),
					{ status: 500, headers: { 'Content-Type': 'application/json' } }
				);
			}
		};
	};
}

export const rateLimitMiddleware = buildMiddleware(globalStore, DEFAULT_MAX, DEFAULT_WINDOW_MS);

// Strict limiter for sensitive endpoints (login, etc.)
export const strictRateLimitMiddleware = buildMiddleware(new Map(), 5, 60_000);

export function createRateLimiter(maxRequests: number, windowMs: number) {
	return buildMiddleware(new Map(), maxRequests, windowMs);
}
