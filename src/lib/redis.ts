import { createClient } from 'redis';
import { randomUUID } from 'crypto';

const redisClient = createClient({
	url: process.env.REDIS_URL || 'redis://localhost:6379',
});

redisClient.on('error', (err) => console.log('Redis Client Error', err));

export async function connectRedis() {
	if (!redisClient.isOpen) {
		await redisClient.connect();
	}
	return redisClient;
}

export async function getRedisClient() {
	return await connectRedis();
}

export async function setBlockExpiration(blockId: string, expiresAt: Date) {
	const client = await connectRedis();
	await client.setEx(`block:${blockId}:expires`, 86400, expiresAt.toISOString());
}

export async function getBlockExpiration(blockId: string) {
	const client = await connectRedis();
	const expiresAt = await client.get(`block:${blockId}:expires`);
	return expiresAt ? new Date(expiresAt) : null;
}

export async function deleteBlockExpiration(blockId: string) {
	const client = await connectRedis();
	await client.del(`block:${blockId}:expires`);
}

export async function getActiveBlockByToken(tokenId: string, workerId?: string | null) {
	const client = await connectRedis();
	const key = workerId ? `token:${tokenId}:${workerId}:active-block` : `token:${tokenId}:active-block`;
	const activeBlock = await client.get(key);
	return activeBlock;
}

export async function setActiveBlock(tokenId: string, blockId: string, workerId?: string | null, ttl?: number) {
	const client = await connectRedis();
	const key = workerId ? `token:${tokenId}:${workerId}:active-block` : `token:${tokenId}:active-block`;
	if (ttl) {
		await client.set(key, blockId, { EX: ttl });
	} else {
		await client.set(key, blockId);
	}
}

export async function clearActiveBlock(tokenId: string, workerId?: string | null) {
	const client = await connectRedis();
	const key = workerId ? `token:${tokenId}:${workerId}:active-block` : `token:${tokenId}:active-block`;
	await client.del(key);
}

export default redisClient;

export async function acquireLock(key: string, ttlMs: number) {
	const client = await connectRedis();
	const token = randomUUID();
	const res = await client.set(key, token, { NX: true, PX: ttlMs });
	return res ? token : null;
}

export async function releaseLock(key: string, token: string) {
	const client = await connectRedis();
	const script = 'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end';
	await client.eval(script, { keys: [key], arguments: [token] });
}

export async function acquireAssignmentLock() {
	return await acquireLock('lock:block-assignment', 5000);
}

export async function releaseAssignmentLock(token: string) {
	await releaseLock('lock:block-assignment', token);
}

export async function incrementBlockSubmitFailures(blockId: string): Promise<number> {
	const client = await connectRedis();
	const key = `block:${blockId}:submit-failures`;
	const count = await client.incr(key);
	// Expire the counter after 24 h so it doesn't linger
	await client.expire(key, 86400);
	return count;
}

export async function deleteBlockSubmitFailures(blockId: string) {
	const client = await connectRedis();
	await client.del(`block:${blockId}:submit-failures`);
}

// Redis fixed-window rate limiter — shared across all processes/workers.
// Falls back to "allow" on Redis error so a Redis outage doesn't lock out users.
export async function checkRateLimit(
	clientIp: string,
	maxRequests: number,
	windowSec: number
): Promise<{ allowed: boolean; remaining: number; retryAfter: number }> {
	try {
		const client = await connectRedis();
		const key = `rl:${clientIp}:${windowSec}`;
		const count = await client.incr(key);
		if (count === 1) await client.expire(key, windowSec);
		const ttl = await client.ttl(key);
		const retryAfter = ttl > 0 ? ttl : windowSec;
		return {
			allowed: count <= maxRequests,
			remaining: Math.max(0, maxRequests - count),
			retryAfter,
		};
	} catch {
		return { allowed: true, remaining: maxRequests, retryAfter: 0 };
	}
}

// Cache for COMPLETED block intervals — immutable once set, invalidated on block submit.
export async function getCachedCompletedIntervals(): Promise<string | null> {
	try {
		const client = await connectRedis();
		return await client.get('cache:completed-intervals');
	} catch {
		return null;
	}
}

export async function setCachedCompletedIntervals(data: string, ttlSec = 300): Promise<void> {
	try {
		const client = await connectRedis();
		await client.setEx('cache:completed-intervals', ttlSec, data);
	} catch { }
}

export async function invalidateCompletedIntervals(): Promise<void> {
	try {
		const client = await connectRedis();
		await client.del('cache:completed-intervals');
	} catch { }
}

// Idempotency lock for block submissions — prevents double-credit from concurrent retries.
// Returns true if the caller should proceed, false if another submit for this block is already in flight.
export async function acquireSubmitLock(blockId: string, ttlSec = 300): Promise<boolean> {
	try {
		const client = await connectRedis();
		const res = await client.set(`submit:lock:${blockId}`, '1', { NX: true, EX: ttlSec });
		return res !== null;
	} catch {
		return true; // fail open: allow submission if Redis is down
	}
}

// Debounce the expensive expired-block sweep — runs at most once every 30 s globally.
export async function shouldRunExpiredSweep(): Promise<boolean> {
	try {
		const client = await connectRedis();
		const res = await client.set('sweep:expired-blocks', '1', { NX: true, EX: 30 });
		return res !== null;
	} catch {
		return true;
	}
}
