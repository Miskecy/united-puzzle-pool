import { NextRequest } from 'next/server';

interface RateLimitEntry {
	count: number;
	resetTime: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

const WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000'); // 1 minute
const MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '60');

function cleanExpiredEntries() {
	const now = Date.now();
	for (const [key, entry] of rateLimitStore.entries()) {
		if (now > entry.resetTime) {
			rateLimitStore.delete(key);
		}
	}
}

function getClientIp(req: Request): string {
	// Get IP from various headers
	const forwarded = req.headers.get('x-forwarded-for');
	const realIp = req.headers.get('x-real-ip');

	if (forwarded) {
		return forwarded.split(',')[0].trim();
	}

	if (realIp) {
		return realIp;
	}

	// Fallback to a default IP for development
	return '127.0.0.1';
}

export function rateLimitMiddleware(
	handler: (req: NextRequest) => Promise<Response>
): (req: NextRequest) => Promise<Response> {
	return async (req: NextRequest) => {
		try {
			const clientIp = getClientIp(req);
			const now = Date.now();

			// Clean expired entries periodically
			if (Math.random() < 0.01) { // 1% chance to clean
				cleanExpiredEntries();
			}

			let entry = rateLimitStore.get(clientIp);

			if (!entry || now > entry.resetTime) {
				// Create new entry or reset expired one
				entry = {
					count: 1,
					resetTime: now + WINDOW_MS
				};
				rateLimitStore.set(clientIp, entry);
			} else {
				// Increment request count
				entry.count++;
			}

			if (entry.count > MAX_REQUESTS) {
				return new Response(
					JSON.stringify({
						error: 'Rate limit exceeded',
						retryAfter: Math.ceil((entry.resetTime - now) / 1000)
					}),
					{
						status: 429,
						headers: {
							'Content-Type': 'application/json',
							'Retry-After': Math.ceil((entry.resetTime - now) / 1000).toString()
						}
					}
				);
			}

			// Add rate limit headers to response
			const response = await handler(req);
			const newResponse = new Response(response.body, response);

			newResponse.headers.set('X-RateLimit-Limit', MAX_REQUESTS.toString());
			newResponse.headers.set('X-RateLimit-Remaining', (MAX_REQUESTS - entry.count).toString());
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
}