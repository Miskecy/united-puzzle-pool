import { NextRequest } from 'next/server';
import { checkRateLimit } from '@/lib/redis';

const DEFAULT_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000');
const DEFAULT_MAX = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '60');

function getClientIp(req: Request): string {
	const realIp = req.headers.get('x-real-ip');
	if (realIp) return realIp.trim();
	const forwarded = req.headers.get('x-forwarded-for');
	if (forwarded) {
		// Use the rightmost IP — appended by the trusted proxy, not spoofable by the client
		const parts = forwarded.split(',');
		return parts[parts.length - 1].trim();
	}
	return '127.0.0.1';
}

function buildMiddleware(maxRequests: number, windowMs: number) {
	const windowSec = Math.ceil(windowMs / 1000);
	return function rateLimitMiddleware(
		handler: (req: NextRequest) => Promise<Response>
	): (req: NextRequest) => Promise<Response> {
		return async (req: NextRequest) => {
			try {
				const clientIp = getClientIp(req);
				const { allowed, remaining, retryAfter } = await checkRateLimit(
					clientIp, maxRequests, windowSec
				);
				if (!allowed) {
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
				newResponse.headers.set('X-RateLimit-Remaining', remaining.toString());
				newResponse.headers.set('X-RateLimit-Reset', new Date(Date.now() + retryAfter * 1000).toISOString());
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

export const rateLimitMiddleware = buildMiddleware(DEFAULT_MAX, DEFAULT_WINDOW_MS);

// Strict limiter for sensitive endpoints (login, etc.)
export const strictRateLimitMiddleware = buildMiddleware(5, 60_000);

export function createRateLimiter(maxRequests: number, windowMs: number) {
	return buildMiddleware(maxRequests, windowMs);
}
